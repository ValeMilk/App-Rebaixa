/**
 * Relatorios em imagem (PDF convertido no navegador do admin): regras de validacao e persistencia.
 * O backend nunca interpreta o PDF; so recebe as imagens ja prontas, pagina a pagina.
 */
const mongoose = require("mongoose");
const Relatorio = require("../models/Relatorio");
const RelatorioPagina = require("../models/RelatorioPagina");

const MAX_PAGINAS = 150; // por relatorio, somando todos os PDFs
const MAX_BYTES_PAGINA = 6 * 1024 * 1024;
const RASCUNHO_VALE_MS = 24 * 3600 * 1000;

function erro(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  e.publicMessage = mensagem;
  return e;
}

/** Tipo da imagem pela assinatura dos primeiros bytes (nao confia no cabecalho enviado). */
function tipoDaImagem(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

const normalizar = (s) => String(s || "").trim().replace(/\s+/g, " ");

/** Titulo e mes de referencia validados. Funcao pura. */
function validarCampos({ titulo, referencia }) {
  const t = normalizar(titulo);
  if (t.length < 2 || t.length > 120) throw erro(400, "Informe o titulo do relatorio (de 2 a 120 caracteres).");
  let ref = null;
  if (referencia != null && String(referencia).trim() !== "") {
    ref = String(referencia).trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ref)) throw erro(400, "Mes de referencia invalido (use AAAA-MM).");
  }
  return { titulo: t, referencia: ref };
}

function idValido(id) {
  return mongoose.Types.ObjectId.isValid(id) ? String(id) : null;
}

async function buscar(id, { publicado } = {}) {
  const oid = idValido(id);
  const r = oid ? await Relatorio.findById(oid).lean() : null;
  if (!r || (publicado !== undefined && r.publicado !== publicado)) throw erro(404, "Relatorio nao encontrado.");
  return r;
}

function resumo(r) {
  return {
    id: String(r._id),
    titulo: r.titulo,
    referencia: r.referencia || null,
    totalPaginas: r.totalPaginas,
    arquivoNome: r.arquivoNome || null,
    publicadoEm: r.publicadoEm || null,
    criadoPorNome: r.criadoPorNome || null,
  };
}

/** Relatorios publicados, do mais recente (mes de referencia, depois publicacao) para o mais antigo. */
async function listar() {
  const rs = await Relatorio.find({ publicado: true }).lean();
  rs.sort((a, b) => String(b.referencia || "").localeCompare(String(a.referencia || "")) || new Date(b.publicadoEm) - new Date(a.publicadoEm));
  return rs.map(resumo);
}

async function detalhar(id) {
  const r = await buscar(id, { publicado: true });
  // so as paginas ja confirmadas (as de uma adicao em andamento ficam depois do fim e nao aparecem)
  const paginas = await RelatorioPagina.find({ relatorioId: r._id, numero: { $gte: 1, $lte: r.totalPaginas } }, "numero largura altura origem").sort({ numero: 1 }).lean();
  return { ...resumo(r), paginas: paginas.map((p) => ({ numero: p.numero, largura: p.largura, altura: p.altura, origem: p.origem || null })) };
}

/** Rascunhos abandonados (sem publicar ha mais de 1 dia) saem junto com as paginas. */
async function limparRascunhos() {
  const velhos = await Relatorio.find({ publicado: false, createdAt: { $lt: new Date(Date.now() - RASCUNHO_VALE_MS) } }, "_id").lean();
  if (!velhos.length) return 0;
  const ids = velhos.map((r) => r._id);
  await RelatorioPagina.deleteMany({ relatorioId: { $in: ids } });
  await Relatorio.deleteMany({ _id: { $in: ids } });
  return ids.length;
}

async function criar(dados, user) {
  const campos = validarCampos(dados || {});
  const total = Number(dados?.totalPaginas);
  if (!Number.isInteger(total) || total < 1 || total > MAX_PAGINAS) throw erro(400, `O relatorio precisa ter de 1 a ${MAX_PAGINAS} paginas.`);
  await limparRascunhos();
  const r = await Relatorio.create({
    ...campos,
    arquivoNome: normalizar(dados.arquivoNome).slice(0, 200) || null,
    totalPaginas: total,
    criadoPorId: user?.id,
    criadoPorNome: user?.nome,
  });
  return resumo(r);
}

/**
 * Grava (ou regrava) a imagem de uma pagina. numero 0 = miniatura.
 * - rascunho: paginas 0..totalPaginas;
 * - relatorio ja publicado (adicao de PDFs): so paginas NOVAS, depois do fim; elas so passam a
 *   valer quando a adicao e confirmada (confirmarAdicao).
 */
async function gravarPagina(id, numero, dados, { largura, altura, origem } = {}) {
  const r = await buscar(id);
  const n = Number(numero);
  if (!Number.isInteger(n) || n < 0) throw erro(400, "Numero de pagina invalido.");
  if (r.publicado) {
    if (n <= r.totalPaginas) throw erro(400, "As paginas ja publicadas nao mudam; envie so as paginas novas.");
    if (n > MAX_PAGINAS) throw erro(400, `O relatorio nao pode passar de ${MAX_PAGINAS} paginas.`);
  } else if (n > r.totalPaginas) {
    throw erro(400, "Numero de pagina invalido.");
  }
  if (!Buffer.isBuffer(dados) || dados.length === 0) throw erro(400, "Envie a imagem da pagina.");
  if (dados.length > MAX_BYTES_PAGINA) throw erro(413, "Imagem grande demais (maximo de 6 MB por pagina).");
  const mime = tipoDaImagem(dados);
  if (!mime) throw erro(400, "A pagina precisa ser uma imagem PNG, JPEG ou WebP.");
  const dim = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) < 20000 ? Math.round(Number(v)) : null);
  await RelatorioPagina.updateOne(
    { relatorioId: r._id, numero: n },
    { $set: { mime, largura: dim(largura), altura: dim(altura), origem: normalizar(origem).slice(0, 200) || null, dados } },
    { upsert: true }
  );
  return { numero: n, bytes: dados.length };
}

/** Publica o rascunho quando todas as paginas 1..N chegaram. */
async function publicar(id) {
  const r = await buscar(id, { publicado: false });
  const presentes = await RelatorioPagina.find({ relatorioId: r._id, numero: { $gte: 1 } }, "numero").lean();
  const tem = new Set(presentes.map((p) => p.numero));
  const faltam = [];
  for (let n = 1; n <= r.totalPaginas; n++) if (!tem.has(n)) faltam.push(n);
  if (faltam.length) throw erro(400, `Faltam as paginas: ${faltam.slice(0, 10).join(", ")}${faltam.length > 10 ? "…" : ""}.`);
  await Relatorio.updateOne({ _id: r._id }, { $set: { publicado: true, publicadoEm: new Date() } });
  return resumo({ ...r, publicado: true, publicadoEm: new Date() });
}

/** Comeca uma adicao: descarta paginas "de preparo" sobrando de uma tentativa anterior. */
async function iniciarAdicao(id) {
  const r = await buscar(id, { publicado: true });
  await RelatorioPagina.deleteMany({ relatorioId: r._id, numero: { $gt: r.totalPaginas } });
  return { totalPaginas: r.totalPaginas, limite: MAX_PAGINAS };
}

/** Confirma a adicao de `quantidade` paginas (totalPaginas+1 ...): so entao elas aparecem para todos. */
async function confirmarAdicao(id, quantidade) {
  const r = await buscar(id, { publicado: true });
  const q = Number(quantidade);
  if (!Number.isInteger(q) || q < 1) throw erro(400, "Informe quantas paginas foram adicionadas.");
  const novoTotal = r.totalPaginas + q;
  if (novoTotal > MAX_PAGINAS) throw erro(400, `O relatorio nao pode passar de ${MAX_PAGINAS} paginas.`);
  const presentes = await RelatorioPagina.countDocuments({ relatorioId: r._id, numero: { $gt: r.totalPaginas, $lte: novoTotal } });
  if (presentes !== q) throw erro(400, "Algumas paginas novas nao chegaram. Tente adicionar de novo.");
  const ok = await Relatorio.updateOne({ _id: r._id, totalPaginas: r.totalPaginas }, { $set: { totalPaginas: novoTotal } });
  if (!ok.modifiedCount) throw erro(409, "O relatorio foi alterado por outra pessoa. Recarregue e tente de novo.");
  await RelatorioPagina.deleteMany({ relatorioId: r._id, numero: { $gt: novoTotal } });
  return resumo({ ...r, totalPaginas: novoTotal });
}

async function atualizar(id, dados) {
  const r = await buscar(id, { publicado: true });
  const campos = validarCampos({ titulo: dados?.titulo ?? r.titulo, referencia: dados && "referencia" in dados ? dados.referencia : r.referencia });
  await Relatorio.updateOne({ _id: r._id }, { $set: campos });
  return resumo({ ...r, ...campos });
}

async function remover(id) {
  const r = await buscar(id);
  await RelatorioPagina.deleteMany({ relatorioId: r._id });
  await Relatorio.deleteOne({ _id: r._id });
}

/** Imagem de uma pagina (ou da miniatura) de um relatorio publicado. */
async function imagem(id, numero) {
  const r = await buscar(id, { publicado: true });
  const n = Number(numero);
  const p = Number.isInteger(n) && n >= 0 && n <= r.totalPaginas ? await RelatorioPagina.findOne({ relatorioId: r._id, numero: n }) : null;
  if (!p) throw erro(404, "Pagina nao encontrada.");
  return { mime: p.mime, dados: Buffer.from(p.dados) };
}

module.exports = { MAX_PAGINAS, tipoDaImagem, validarCampos, listar, detalhar, criar, gravarPagina, publicar, iniciarAdicao, confirmarAdicao, atualizar, remover, imagem, limparRascunhos };
