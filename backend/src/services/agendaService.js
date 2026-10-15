/**
 * Agenda semanal de visitas por cidade (supervisores).
 *
 * Regras: cada usuario monta a PROPRIA agenda; quem tem "agenda_visitas.ver_todas" consulta a de
 * qualquer supervisor, sem alterar; o admin tambem pode montar a agenda em nome de um supervisor.
 * Datas sao texto "AAAA-MM-DD" e horarios "HH:MM" (sem fuso).
 */
const AgendaVisita = require("../models/AgendaVisita");
const Carteira = require("../models/Carteira");
const User = require("../models/User");
const { carteiraDoUsuario } = require("./escopoService");
const { usuarioPode } = require("./permissoesService");

const MAX_DIAS_CONSULTA = 62;
const MAX_LOJAS = 80;
const MAX_REDES = 40;
const MAX_LOJAS_LISTA = 500;
const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e"]);

function erro(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  e.publicMessage = mensagem;
  return e;
}

const normalizar = (s) => String(s || "").trim().replace(/\s+/g, " ");
const chave = (s) => normalizar(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const temAcento = (s) => /[̀-ͯ]/.test(String(s).normalize("NFD"));

/**
 * "SAO GONCALO DO AMARANTE" / "são gonçalo" -> nome proprio ("Sao Goncalo do Amarante", "São Gonçalo").
 * Texto que ja mistura maiusculas e minusculas ("Maracanaú") fica como foi digitado. Funcao pura.
 */
function formatarCidade(s) {
  const t = normalizar(s);
  if (!t || (t !== t.toUpperCase() && t !== t.toLowerCase())) return t;
  return t
    .toLowerCase()
    .split(" ")
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function dataValida(s) {
  if (typeof s !== "string" || !RE_DATA.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Soma `n` dias a uma data "AAAA-MM-DD". Funcao pura. */
function somarDias(s, n) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const diasEntre = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 864e5);
const ehSegunda = (s) => new Date(`${s}T00:00:00Z`).getUTCDay() === 1;

/** Campos de uma visita, validados. Funcao pura (a cidade ainda nao e a grafia canonica). */
function validarEvento(dados) {
  const d = dados || {};
  if (!dataValida(d.data)) throw erro(400, "Informe a data da visita.");
  const diaInteiro = d.diaInteiro === true || d.diaInteiro === "true";
  let inicio = null;
  let fim = null;
  if (!diaInteiro) {
    if (!RE_HORA.test(String(d.inicio || "")) || !RE_HORA.test(String(d.fim || ""))) throw erro(400, "Informe o horário de início e de fim (HH:MM) ou marque dia inteiro.");
    if (String(d.fim) <= String(d.inicio)) throw erro(400, "O horário de fim precisa ser depois do início.");
    inicio = String(d.inicio);
    fim = String(d.fim);
  }
  const cidade = normalizar(d.cidade);
  if (cidade && (cidade.length < 2 || cidade.length > 80)) throw erro(400, "Informe a cidade da visita (de 2 a 80 letras).");

  // Redes (classes) e subredes (subclasses) a visitar
  if ((d.redes != null && !Array.isArray(d.redes)) || (d.subredes != null && !Array.isArray(d.subredes))) throw erro(400, "Lista de redes invalida.");
  const redes = [];
  const redesVistas = new Set();
  for (const r of d.redes || []) {
    const codigoRede = String(r?.codigoRede || "").trim();
    if (!codigoRede || redesVistas.has(codigoRede)) continue;
    redesVistas.add(codigoRede);
    redes.push({ codigoRede, nome: normalizar(r.nome).slice(0, 120) });
  }
  const subredes = [];
  const subredesVistas = new Set();
  for (const s of d.subredes || []) {
    const nome = normalizar(s?.nome).slice(0, 120);
    const codigoRede = String(s?.codigoRede || "").trim();
    const k = `${codigoRede}::${chave(nome)}`;
    if (!nome || subredesVistas.has(k)) continue;
    subredesVistas.add(k);
    subredes.push({ codigoRede, redeNome: normalizar(s.redeNome).slice(0, 120), nome });
  }
  if (redes.length > MAX_REDES || subredes.length > MAX_REDES) throw erro(400, `Escolha no máximo ${MAX_REDES} redes e ${MAX_REDES} subredes por visita.`);
  if (!cidade && !redes.length && !subredes.length) throw erro(400, "Informe a cidade ou escolha ao menos uma rede ou subrede.");

  const lojas = [];
  const vistas = new Set();
  if (d.lojas != null && !Array.isArray(d.lojas)) throw erro(400, "Lista de lojas invalida.");
  for (const l of d.lojas || []) {
    const clienteCodigo = String(l?.clienteCodigo || "").trim();
    if (!clienteCodigo || vistas.has(clienteCodigo)) continue;
    vistas.add(clienteCodigo);
    lojas.push({ clienteCodigo, clienteNome: normalizar(l.clienteNome).slice(0, 120) });
  }
  if (lojas.length > MAX_LOJAS) throw erro(400, `Escolha no máximo ${MAX_LOJAS} lojas por visita.`);
  const observacao = String(d.observacao || "").trim();
  if (observacao.length > 500) throw erro(400, "A observação pode ter até 500 caracteres.");
  return { data: d.data, diaInteiro, inicio, fim, cidade, redes, subredes, lojas, observacao };
}

/** Cidades que o sistema ja conhece (carteira do Lacteus + ja usadas em agendas): chave -> nome. */
async function cidadesConhecidas() {
  const [daCarteira, dasAgendas] = await Promise.all([
    Carteira.distinct("cidade", { cidade: { $nin: [null, ""] } }),
    AgendaVisita.distinct("cidade"),
  ]);
  // Mesma cidade em grafias diferentes: vale a que tem acento ("Maracanaú"), que alguem digitou de
  // proposito, sobre a do Lacteus ("MARACANAU"); entre iguais, a primeira.
  const mapa = new Map();
  for (const c of [...dasAgendas, ...daCarteira]) {
    const k = chave(c);
    if (!k) continue;
    const nome = formatarCidade(c);
    if (!mapa.has(k) || (temAcento(nome) && !temAcento(mapa.get(k)))) mapa.set(k, nome);
  }
  return mapa;
}

async function cidades() {
  const mapa = await cidadesConhecidas();
  return [...mapa.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function paraJson(ev) {
  return {
    id: String(ev._id),
    donoCodigo: ev.donoCodigo,
    donoNome: ev.donoNome,
    data: ev.data,
    diaInteiro: !!ev.diaInteiro,
    inicio: ev.inicio || null,
    fim: ev.fim || null,
    cidade: ev.cidade || "",
    redes: (ev.redes || []).map((r) => ({ codigoRede: r.codigoRede, nome: r.nome || "" })),
    subredes: (ev.subredes || []).map((s) => ({ codigoRede: s.codigoRede || "", redeNome: s.redeNome || "", nome: s.nome })),
    lojas: (ev.lojas || []).map((l) => ({ clienteCodigo: l.clienteCodigo, clienteNome: l.clienteNome || "" })),
    observacao: ev.observacao || "",
  };
}

/** Visitas no periodo [de, ate]. Quem so gerencia a propria agenda ve so a propria. */
async function listar(user, { de, ate, dono } = {}) {
  if (!dataValida(de) || !dataValida(ate) || ate < de) throw erro(400, "Informe o periodo (de e ate, AAAA-MM-DD).");
  if (diasEntre(de, ate) > MAX_DIAS_CONSULTA) throw erro(400, `Consulte no máximo ${MAX_DIAS_CONSULTA} dias por vez.`);
  const verTodas = await usuarioPode(user, "agenda_visitas.ver_todas");
  const filtro = { data: { $gte: de, $lte: ate } };
  if (!verTodas) filtro.donoCodigo = user.codigo;
  else if (dono && dono !== "todos") filtro.donoCodigo = String(dono);
  const evs = await AgendaVisita.find(filtro).sort({ data: 1, diaInteiro: -1, inicio: 1, cidadeChave: 1 }).lean();
  return { visitas: evs.map(paraJson), verTodas };
}

/** Supervisores com agenda (para o seletor de quem ve tudo): quem tem perfil de supervisor e ativo. */
async function donosDisponiveis() {
  const users = await User.find({ ativo: true, $or: [{ role: "supervisor" }, { roles: "supervisor" }] }, "nome codigo").sort({ nome: 1 }).lean();
  return users.map((u) => ({ codigo: u.codigo, nome: u.nome }));
}

/** Dono (supervisor) de uma nova visita: o proprio usuario; o admin pode escolher outro. */
async function resolverDono(user, donoCodigo) {
  if (user.role === "admin" && donoCodigo && String(donoCodigo) !== String(user.codigo)) {
    const u = await User.findOne({ codigo: String(donoCodigo), ativo: true }, "nome codigo").lean();
    if (!u) throw erro(400, "Supervisor nao encontrado.");
    return { donoId: u._id, donoCodigo: u.codigo, donoNome: u.nome };
  }
  return { donoId: user.id, donoCodigo: user.codigo, donoNome: user.nome };
}

async function cidadeCanonica(cidade) {
  const mapa = await cidadesConhecidas();
  const digitada = formatarCidade(cidade);
  const conhecida = mapa.get(chave(cidade));
  if (!conhecida) return digitada;
  // quem digitou com acento ganha da grafia sem acento do Lacteus
  return temAcento(digitada) && !temAcento(conhecida) ? digitada : conhecida;
}

async function buscarDoDono(user, id) {
  const ev = await AgendaVisita.findById(id).catch(() => null);
  if (!ev) throw erro(404, "Visita nao encontrada.");
  if (user.role !== "admin" && ev.donoCodigo !== user.codigo) throw erro(403, "Voce so pode alterar a sua propria agenda.");
  return ev;
}

async function criar(user, dados) {
  const campos = validarEvento(dados);
  const dono = await resolverDono(user, dados?.donoCodigo);
  const cidade = campos.cidade ? await cidadeCanonica(campos.cidade) : "";
  const ev = await AgendaVisita.create({ ...campos, cidade, cidadeChave: chave(cidade), ...dono, criadoPorNome: user.nome });
  return paraJson(ev);
}

async function atualizar(user, id, dados) {
  const ev = await buscarDoDono(user, id);
  const campos = validarEvento(dados);
  const cidade = campos.cidade ? await cidadeCanonica(campos.cidade) : "";
  Object.assign(ev, campos, { cidade, cidadeChave: chave(cidade) });
  await ev.save();
  return paraJson(ev);
}

async function remover(user, id) {
  const ev = await buscarDoDono(user, id);
  await ev.deleteOne();
}

/**
 * Copia todas as visitas da semana que comeca na segunda `de` para a semana que comeca em `para`
 * (mesmo dia da semana, mesmo horario). Visita que ja existe igual no destino nao e duplicada.
 */
async function copiarSemana(user, { de, para, donoCodigo } = {}) {
  if (!dataValida(de) || !dataValida(para) || !ehSegunda(de) || !ehSegunda(para)) throw erro(400, "Informe as duas semanas pela segunda-feira (AAAA-MM-DD).");
  if (de === para) throw erro(400, "A semana de destino precisa ser diferente da de origem.");
  const dono = await resolverDono(user, donoCodigo);
  const origem = await AgendaVisita.find({ donoCodigo: dono.donoCodigo, data: { $gte: de, $lte: somarDias(de, 6) } }).lean();
  const deslocamento = diasEntre(de, para);
  const existentes = await AgendaVisita.find({ donoCodigo: dono.donoCodigo, data: { $gte: para, $lte: somarDias(para, 6) } }, "data cidadeChave redes subredes diaInteiro inicio fim").lean();
  const sig = (e) => {
    const r = (e.redes || []).map((x) => x.codigoRede).sort().join(",");
    const s = (e.subredes || []).map((x) => `${x.codigoRede}:${chave(x.nome)}`).sort().join(",");
    return `${e.data}|${e.cidadeChave || ""}|${r}|${s}|${e.diaInteiro ? 1 : 0}|${e.inicio || ""}|${e.fim || ""}`;
  };
  const ja = new Set(existentes.map(sig));
  const novas = [];
  let ignoradas = 0;
  for (const e of origem) {
    const copia = { ...e, data: somarDias(e.data, deslocamento) };
    if (ja.has(sig(copia))) { ignoradas += 1; continue; }
    ja.add(sig(copia));
    novas.push({
      donoId: dono.donoId, donoCodigo: dono.donoCodigo, donoNome: dono.donoNome,
      data: copia.data, diaInteiro: !!e.diaInteiro, inicio: e.inicio || null, fim: e.fim || null,
      cidade: e.cidade || "", cidadeChave: e.cidadeChave || "", redes: e.redes || [], subredes: e.subredes || [],
      lojas: e.lojas || [], observacao: e.observacao || "",
      criadoPorNome: user.nome,
    });
  }
  if (novas.length) await AgendaVisita.insertMany(novas);
  return { copiadas: novas.length, ignoradas, deOrigem: origem.length };
}

/** Carteira a usar nas opcoes da visita: a do proprio usuario; o admin que marca na agenda de um supervisor usa a dele. */
function alvoDaCarteira(user, dono) {
  return user.role === "admin" && dono && dono !== "todos" ? { role: "supervisor", codigo: String(dono) } : user;
}

/**
 * Redes (classes) e subredes (subclasses) da carteira que o usuario alcanca, para escolher na visita.
 * Com `cidade`, cada opcao diz quantas lojas tem naquela cidade e as que tem la vem primeiro.
 */
async function redes(user, cidade, dono) {
  const carteira = await carteiraDoUsuario(alvoDaCarteira(user, dono));
  const k = cidade ? chave(cidade) : null;
  const porRede = new Map();
  const porSub = new Map();
  for (const c of carteira) {
    const codigo = String(c.codigoRede || "").trim();
    const nomeRede = normalizar(c.redeSubrede);
    if (!codigo || codigo === "0" || !nomeRede || /inativ/i.test(nomeRede)) continue;
    const naCidade = !!k && chave(c.cidade) === k;
    if (!porRede.has(codigo)) porRede.set(codigo, { codigoRede: codigo, nome: nomeRede, lojas: new Set(), naCidade: new Set() });
    const r = porRede.get(codigo);
    r.lojas.add(c.clienteCodigo);
    if (naCidade) r.naCidade.add(c.clienteCodigo);
    const nomeSub = normalizar(c.subrede);
    if (nomeSub && chave(nomeSub) !== chave(nomeRede)) {
      const sk = `${codigo}::${chave(nomeSub)}`;
      if (!porSub.has(sk)) porSub.set(sk, { codigoRede: codigo, redeNome: nomeRede, nome: nomeSub, lojas: new Set(), naCidade: new Set() });
      const s = porSub.get(sk);
      s.lojas.add(c.clienteCodigo);
      if (naCidade) s.naCidade.add(c.clienteCodigo);
    }
  }
  const saida = (m) =>
    [...m.values()]
      .map((x) => ({ ...x, lojas: x.lojas.size, lojasNaCidade: x.naCidade.size, naCidade: undefined }))
      .sort((a, b) => b.lojasNaCidade - a.lojasNaCidade || a.nome.localeCompare(b.nome, "pt-BR"));
  return { redes: saida(porRede), subredes: saida(porSub) };
}

/** Lojas que o usuario alcanca, opcionalmente so as da cidade (para escolher na visita). */
async function lojas(user, cidade, dono) {
  const carteira = await carteiraDoUsuario(alvoDaCarteira(user, dono));
  const k = cidade ? chave(cidade) : null;
  const vistos = new Set();
  const saida = [];
  for (const c of carteira) {
    if (vistos.has(c.clienteCodigo)) continue;
    if (k && chave(c.cidade) !== k) continue;
    vistos.add(c.clienteCodigo);
    saida.push({ clienteCodigo: c.clienteCodigo, clienteNome: normalizar(c.clienteNome) || c.clienteCodigo, cidade: c.cidade ? formatarCidade(c.cidade) : null, redeSubrede: normalizar(c.redeSubrede) || null });
  }
  saida.sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, "pt-BR"));
  return saida.slice(0, MAX_LOJAS_LISTA);
}

module.exports = {
  formatarCidade, dataValida, somarDias, validarEvento,
  cidades, listar, donosDisponiveis, criar, atualizar, remover, copiarSemana, redes, lojas,
};
