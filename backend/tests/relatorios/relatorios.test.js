/**
 * Relatorios em imagem. Parte 1: validacoes puras. Parte 2: API num banco DESCARTAVEL (apagado no
 * fim; pulada sem acesso): quem ve, quem importa, rascunho x publicado e exclusao.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const dns = require("dns");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const mongoose = require("mongoose");
const express = require("express");
const jwt = require("jsonwebtoken");

const { tipoDaImagem, validarCampos, nomeArquivoPdf } = require("../../src/services/relatoriosService");

// PNG 1x1 valido
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(30, 1)]);

test("tipo da imagem pela assinatura, nao pelo que o cliente diz", () => {
  assert.equal(tipoDaImagem(PNG), "image/png");
  assert.equal(tipoDaImagem(JPEG), "image/jpeg");
  assert.equal(tipoDaImagem(Buffer.from("%PDF-1.7 conteudo qualquer")), null);
  assert.equal(tipoDaImagem(Buffer.from("<html><script>alert(1)</script></html>")), null);
  assert.equal(tipoDaImagem(Buffer.alloc(4)), null);
});

test("titulo e mes de referencia", () => {
  assert.deepEqual(validarCampos({ titulo: "  Fechamento   Setembro ", referencia: "2026-09" }), { titulo: "Fechamento Setembro", referencia: "2026-09" });
  assert.deepEqual(validarCampos({ titulo: "Abc", referencia: "" }), { titulo: "Abc", referencia: null });
  assert.throws(() => validarCampos({ titulo: "A" }), /titulo/);
  assert.throws(() => validarCampos({ titulo: "Abc", referencia: "2026-13" }), /referencia/);
  assert.throws(() => validarCampos({ titulo: "Abc", referencia: "setembro" }), /referencia/);
});

test("nome do arquivo PDF: sem acento nem simbolo", () => {
  assert.equal(nomeArquivoPdf("Relatório de setembro/2026"), "Relatorio de setembro 2026.pdf");
  assert.equal(nomeArquivoPdf("  Fechamento: Super do Povo (out/26)  "), "Fechamento Super do Povo (out 26).pdf");
  assert.equal(nomeArquivoPdf("***"), "relatorio.pdf");
  assert.equal(nomeArquivoPdf(""), "relatorio.pdf");
});

// ── API ─────────────────────────────────────────────────────────────────────────

const NOME_BANCO = `rebaixa_teste_relatorios_${Date.now()}`;
const uri = process.env.MONGODB_URI ? process.env.MONGODB_URI.replace(/\/[^/?]*(\?|$)/, `/${NOME_BANCO}$1`) : null;
const podeRodar = !!(uri && process.env.JWT_SECRET);
let server, base;
const tokens = {};
const pronto = () => podeRodar && server;

test.before(async () => {
  if (!podeRodar) return;
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
  try { await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 }); } catch { return; }
  for (const [k, role] of [["admin", "admin"], ["sup", "supervisor"], ["sup2", "supervisor"], ["dir", "diretoria"], ["vend", "vendedor"]]) {
    tokens[k] = jwt.sign({ id: "0000000000000000000000" + (k === "admin" ? "01" : "02"), role, roles: [], nome: `Teste ${k}`, codigo: k }, process.env.JWT_SECRET);
  }
  // usuarios de verdade: o relatorio de supervisor so aceita supervisores ativos que existem
  const User = require("../../src/models/User");
  for (const [codigo, role, ativo] of [["sup", "supervisor", true], ["sup2", "supervisor", true], ["dir", "diretoria", true], ["supinativo", "supervisor", false]]) {
    await User.create({ nome: `Teste ${codigo}`, email: `${codigo}@teste.com`, codigo, senhaHash: "x", role, ativo });
  }
  const app = express();
  app.use(express.json());
  app.use("/api/relatorios", require("../../src/routes/relatorios"));
  app.use(require("../../src/middlewares/errorHandler"));
  await new Promise((ok) => { server = app.listen(0, ok); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((ok) => server.close(ok));
  if (mongoose.connection.readyState === 1) { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
});

async function chamar(quem, metodo, rota, corpo, { bruto } = {}) {
  const headers = { Authorization: `Bearer ${tokens[quem]}` };
  let body;
  if (bruto) { headers["Content-Type"] = "application/octet-stream"; body = bruto; }
  else if (corpo !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(corpo); }
  const r = await fetch(`${base}/api/relatorios${rota}`, { method: metodo, headers, body });
  const tipo = r.headers.get("content-type") || "";
  return { status: r.status, tipo, dados: tipo.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
}

let id;

test("quem importa e quem so ve", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  assert.equal((await chamar("vend", "GET", "")).status, 403); // vendedor nao tem por padrao
  for (const q of ["sup", "dir", "admin"]) assert.equal((await chamar(q, "GET", "")).status, 200, q);
  for (const q of ["sup", "dir", "vend"]) assert.equal((await chamar(q, "POST", "", { titulo: "Teste", totalPaginas: 1 })).status, 403, q);
  assert.equal((await chamar("sup", "DELETE", "/000000000000000000000000")).status, 403);
});

test("fluxo: rascunho invisivel, paginas, publicar, ver e baixar a imagem", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  const c = await chamar("admin", "POST", "", { titulo: "  Fechamento  Setembro/2026 ", referencia: "2026-09", arquivoNome: "Fechamento_Setembro_2026.pdf", totalPaginas: 2 });
  assert.equal(c.status, 201);
  id = c.dados.relatorio.id;
  assert.equal(c.dados.relatorio.titulo, "Fechamento Setembro/2026");

  // rascunho nao aparece nem abre para quem so ve
  assert.deepEqual((await chamar("sup", "GET", "")).dados.relatorios, []);
  assert.equal((await chamar("sup", "GET", `/${id}`)).status, 404);

  // validacoes do envio
  assert.equal((await chamar("admin", "PUT", `/${id}/paginas/1`, undefined, { bruto: Buffer.from("%PDF-1.4 nao e imagem") })).status, 400);
  assert.equal((await chamar("admin", "PUT", `/${id}/paginas/3`, undefined, { bruto: PNG })).status, 400); // alem do total
  assert.equal((await chamar("admin", "PUT", `/${id}/paginas/-1`, undefined, { bruto: PNG })).status, 400);
  assert.equal((await chamar("admin", "POST", `/${id}/publicar`)).status, 400); // faltam paginas

  assert.equal((await chamar("admin", "PUT", `/${id}/paginas/1?largura=1800&altura=1272`, undefined, { bruto: PNG })).status, 200);
  assert.equal((await chamar("admin", "PUT", `/${id}/paginas/0`, undefined, { bruto: JPEG })).status, 200); // miniatura
  const falta = await chamar("admin", "POST", `/${id}/publicar`);
  assert.equal(falta.status, 400);
  assert.match(falta.dados.error, /Faltam as paginas: 2/);
  assert.equal((await chamar("admin", "PUT", `/${id}/paginas/2?largura=1800&altura=1272`, undefined, { bruto: PNG })).status, 200);
  assert.equal((await chamar("admin", "POST", `/${id}/publicar`)).status, 200);

  // publicado: lista, detalhe e imagem
  const lista = (await chamar("sup", "GET", "")).dados.relatorios;
  assert.equal(lista.length, 1);
  assert.equal(lista[0].titulo, "Fechamento Setembro/2026");
  assert.equal(lista[0].totalPaginas, 2);
  const det = (await chamar("dir", "GET", `/${id}`)).dados.relatorio;
  assert.deepEqual(det.paginas.map((p) => [p.numero, p.largura, p.altura]), [[1, 1800, 1272], [2, 1800, 1272]]);
  const img = await chamar("sup", "GET", `/${id}/paginas/1`);
  assert.equal(img.status, 200);
  assert.equal(img.tipo, "image/png");
  assert.ok(Buffer.compare(img.dados, PNG) === 0, "bytes iguais aos enviados");
  assert.equal((await chamar("sup", "GET", `/${id}/paginas/0`)).tipo, "image/jpeg");
  assert.equal((await chamar("sup", "GET", `/${id}/paginas/9`)).status, 404);
  assert.equal((await chamar("vend", "GET", `/${id}/paginas/1`)).status, 403);

  // publicado: as paginas existentes nao mudam
  assert.equal((await chamar("admin", "PUT", `/${id}/paginas/1`, undefined, { bruto: PNG })).status, 400);
});

test("ordem da lista, renomear e excluir", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  // segundo relatorio de um mes MAIS NOVO entra primeiro
  const c = await chamar("admin", "POST", "", { titulo: "Outubro", referencia: "2026-10", totalPaginas: 1 });
  const id2 = c.dados.relatorio.id;
  await chamar("admin", "PUT", `/${id2}/paginas/1`, undefined, { bruto: PNG });
  await chamar("admin", "POST", `/${id2}/publicar`);
  assert.deepEqual((await chamar("sup", "GET", "")).dados.relatorios.map((r) => r.titulo), ["Outubro", "Fechamento Setembro/2026"]);

  const ren = await chamar("admin", "PUT", `/${id}`, { titulo: "Setembro 2026", referencia: "2026-09" });
  assert.equal(ren.status, 200);
  assert.equal((await chamar("admin", "PUT", `/${id}`, { titulo: "x" })).status, 400);
  assert.equal((await chamar("sup", "PUT", `/${id}`, { titulo: "Hack" })).status, 403);

  const RelatorioPagina = require("../../src/models/RelatorioPagina");
  assert.ok((await RelatorioPagina.countDocuments({ relatorioId: id })) >= 3);
  assert.equal((await chamar("admin", "DELETE", `/${id}`)).status, 200);
  assert.equal(await RelatorioPagina.countDocuments({ relatorioId: id }), 0); // as imagens saem junto
  assert.equal((await chamar("sup", "GET", `/${id}`)).status, 404);
  assert.equal((await chamar("admin", "DELETE", "/abc")).status, 404);
});

test("rascunho abandonado ha mais de 1 dia some no proximo envio", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  const Relatorio = require("../../src/models/Relatorio");
  const velho = await chamar("admin", "POST", "", { titulo: "Esquecido", totalPaginas: 1 });
  await Relatorio.collection.updateOne({ _id: new mongoose.Types.ObjectId(velho.dados.relatorio.id) }, { $set: { createdAt: new Date(Date.now() - 25 * 3600 * 1000) } });
  await chamar("admin", "POST", "", { titulo: "Novo", totalPaginas: 1 });
  assert.equal(await Relatorio.countDocuments({ titulo: "Esquecido" }), 0);
  assert.equal(await Relatorio.countDocuments({ titulo: "Novo" }), 1);
});

test("juntar PDFs: origem por pagina e adicao a um relatorio publicado", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  const RelatorioPagina = require("../../src/models/RelatorioPagina");
  const put = (rid, n, q = "") => chamar("admin", "PUT", `/${rid}/paginas/${n}${q}`, undefined, { bruto: PNG });
  const origem = (nome) => "?origem=" + encodeURIComponent(nome);

  // relatorio novo com 2 PDFs (3 paginas): a origem de cada pagina fica registrada
  const c = await chamar("admin", "POST", "", { titulo: "Mensal Setembro", referencia: "2026-09", totalPaginas: 3 });
  const rid = c.dados.relatorio.id;
  await put(rid, 0);
  await put(rid, 1, origem("Fechamento Scanntech.pdf"));
  await put(rid, 2, origem("Fechamento Scanntech.pdf"));
  await put(rid, 3, origem("Encartes.pdf"));
  assert.equal((await chamar("admin", "POST", `/${rid}/publicar`)).status, 200);
  const det = (await chamar("sup", "GET", `/${rid}`)).dados.relatorio;
  assert.deepEqual(det.paginas.map((p) => [p.numero, p.origem]), [[1, "Fechamento Scanntech.pdf"], [2, "Fechamento Scanntech.pdf"], [3, "Encartes.pdf"]]);

  // adicao: as paginas novas ficam invisiveis ate confirmar
  assert.equal((await chamar("sup", "POST", `/${rid}/adicao`)).status, 403);
  assert.deepEqual((await chamar("admin", "POST", `/${rid}/adicao`)).dados, { totalPaginas: 3, limite: 150 });
  assert.equal((await put(rid, 3)).status, 400); // pagina ja publicada
  assert.equal((await put(rid, 151)).status, 400); // alem do limite
  assert.equal((await put(rid, 4, origem("Vendas.pdf"))).status, 200);
  assert.equal((await chamar("sup", "GET", `/${rid}`)).dados.relatorio.paginas.length, 3);
  assert.equal((await chamar("sup", "GET", `/${rid}/paginas/4`)).status, 404);
  assert.equal((await chamar("admin", "POST", `/${rid}/adicao/confirmar`, { quantidade: 2 })).status, 400); // falta a pagina 5

  // uma tentativa interrompida nao deixa pagina velha valer na proxima
  await chamar("admin", "POST", `/${rid}/adicao`);
  assert.equal(await RelatorioPagina.countDocuments({ relatorioId: rid, numero: { $gt: 3 } }), 0);
  assert.equal((await put(rid, 4, origem("Vendas.pdf"))).status, 200);
  assert.equal((await put(rid, 5, origem("Vendas.pdf"))).status, 200);
  const ok = await chamar("admin", "POST", `/${rid}/adicao/confirmar`, { quantidade: 2 });
  assert.equal(ok.status, 200);
  assert.equal(ok.dados.relatorio.totalPaginas, 5);
  const depois = (await chamar("sup", "GET", `/${rid}`)).dados.relatorio;
  assert.deepEqual(depois.paginas.map((p) => p.origem), ["Fechamento Scanntech.pdf", "Fechamento Scanntech.pdf", "Encartes.pdf", "Vendas.pdf", "Vendas.pdf"]);
  assert.equal((await chamar("sup", "GET", `/${rid}/paginas/5`)).status, 200);
  assert.equal((await chamar("admin", "POST", `/${rid}/adicao/confirmar`, { quantidade: 1 })).status, 400); // nada novo para confirmar
  assert.equal((await chamar("admin", "POST", `/${rid}/adicao/confirmar`, { quantidade: 0 })).status, 400);

  // rascunho nao aceita "adicao"
  const rasc = await chamar("admin", "POST", "", { titulo: "Rascunho", totalPaginas: 1 });
  assert.equal((await chamar("admin", "POST", `/${rasc.dados.relatorio.id}/adicao`)).status, 404);
});

test("baixar o relatorio completo em PDF: todas as paginas, na ordem, so para quem pode ver", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  const c = await chamar("admin", "POST", "", { titulo: "Relatório PDF Completo", referencia: "2026-10", totalPaginas: 3 });
  const rid = c.dados.relatorio.id;
  const baixar = async (quem, id) => {
    const r = await fetch(`${base}/api/relatorios/${id}/pdf`, { headers: { Authorization: `Bearer ${tokens[quem]}` } });
    return { status: r.status, tipo: r.headers.get("content-type"), disp: r.headers.get("content-disposition"), corpo: Buffer.from(await r.arrayBuffer()) };
  };

  // rascunho: nao existe para quem so ve
  assert.equal((await baixar("sup", rid)).status, 404);

  for (const n of [1, 2, 3]) await chamar("admin", "PUT", `/${rid}/paginas/${n}`, undefined, { bruto: PNG });
  await chamar("admin", "POST", `/${rid}/publicar`);

  const ok = await baixar("sup", rid);
  assert.equal(ok.status, 200);
  assert.equal(ok.tipo, "application/pdf");
  assert.match(ok.disp, /attachment; filename="Relatorio PDF Completo\.pdf"/);
  assert.equal(ok.corpo.subarray(0, 5).toString("latin1"), "%PDF-");
  const texto = ok.corpo.toString("latin1");
  assert.equal((texto.match(/\/Type \/Page\b(?!s)/g) || []).length, 3, "uma pagina de PDF por imagem");
  assert.match(texto, /%%EOF\s*$/);

  assert.equal((await baixar("vend", rid)).status, 403); // sem a permissao de ver
  assert.equal((await baixar("sup", "000000000000000000000000")).status, 404);
  assert.equal((await baixar("sup", "abc")).status, 404);
});

test("para quem e o relatorio: comercial (todos) ou de um supervisor (so ele e quem ve tudo)", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  const Relatorio = require("../../src/models/Relatorio");
  const publicar = async (corpo) => {
    const c = await chamar("admin", "POST", "", { totalPaginas: 1, ...corpo });
    if (c.status !== 201) return c;
    await chamar("admin", "PUT", `/${c.dados.relatorio.id}/paginas/1`, undefined, { bruto: PNG });
    await chamar("admin", "POST", `/${c.dados.relatorio.id}/publicar`);
    return c;
  };

  // sem tipo = comercial; de supervisor exige supervisor ativo que exista
  const com = await publicar({ titulo: "Para o comercial" });
  assert.equal(com.dados.relatorio.tipo, "comercial");
  assert.equal((await chamar("admin", "POST", "", { titulo: "Sem responsavel", totalPaginas: 1, tipo: "supervisor" })).status, 400);
  assert.equal((await chamar("admin", "POST", "", { titulo: "Lista vazia", totalPaginas: 1, tipo: "supervisor", supervisores: [] })).status, 400);
  assert.equal((await chamar("admin", "POST", "", { titulo: "Inexistente", totalPaginas: 1, tipo: "supervisor", supervisores: ["nao-existe"] })).status, 400);
  assert.equal((await chamar("admin", "POST", "", { titulo: "Inativo", totalPaginas: 1, tipo: "supervisor", supervisores: ["supinativo"] })).status, 400);
  assert.equal((await chamar("admin", "POST", "", { titulo: "Nao e supervisor", totalPaginas: 1, tipo: "supervisor", supervisores: ["dir"] })).status, 400);
  assert.equal((await chamar("admin", "POST", "", { titulo: "Tipo estranho", totalPaginas: 1, tipo: "todos" })).status, 400);

  const so1 = await publicar({ titulo: "So do supervisor 1", tipo: "supervisor", supervisores: ["sup"] });
  assert.equal(so1.status, 201);
  assert.deepEqual(so1.dados.relatorio.supervisores, [{ codigo: "sup", nome: "Teste sup" }]);
  const id1 = so1.dados.relatorio.id;

  // lista: o supervisor 1 ve os dois; o supervisor 2 so o comercial; diretoria e admin veem tudo
  const titulos = async (quem) => (await chamar(quem, "GET", "")).dados.relatorios.map((r) => r.titulo);
  assert.ok((await titulos("sup")).includes("So do supervisor 1") && (await titulos("sup")).includes("Para o comercial"));
  assert.ok(!(await titulos("sup2")).includes("So do supervisor 1") && (await titulos("sup2")).includes("Para o comercial"));
  for (const q of ["dir", "admin"]) assert.ok((await titulos(q)).includes("So do supervisor 1"), q);

  // abrir, imagem e PDF seguem a mesma regra (o outro supervisor recebe "nao encontrado")
  for (const rota of [`/${id1}`, `/${id1}/paginas/1`, `/${id1}/pdf`]) {
    assert.equal((await chamar("sup", "GET", rota)).status, 200, `sup ${rota}`);
    assert.equal((await chamar("dir", "GET", rota)).status, 200, `dir ${rota}`);
    assert.equal((await chamar("sup2", "GET", rota)).status, 404, `sup2 ${rota}`);
  }

  // mais de um supervisor responsavel
  const dois = await publicar({ titulo: "Dos dois supervisores", tipo: "supervisor", supervisores: ["sup2", "sup"] });
  assert.deepEqual(dois.dados.relatorio.supervisores.map((s) => s.codigo), ["sup", "sup2"]);
  assert.equal((await chamar("sup2", "GET", `/${dois.dados.relatorio.id}`)).status, 200);

  // mudar o tipo: para o outro supervisor, para comercial (limpa a lista) e de volta; so envia o que mudou
  const troca = await chamar("admin", "PUT", `/${id1}`, { titulo: "So do supervisor 1", tipo: "supervisor", supervisores: ["sup2"] });
  assert.equal(troca.status, 200);
  assert.equal((await chamar("sup", "GET", `/${id1}`)).status, 404);
  assert.equal((await chamar("sup2", "GET", `/${id1}`)).status, 200);
  const renomear = await chamar("admin", "PUT", `/${id1}`, { titulo: "Renomeado" }); // sem tipo: mantem o destino
  assert.deepEqual([renomear.dados.relatorio.tipo, renomear.dados.relatorio.supervisores.map((s) => s.codigo)], ["supervisor", ["sup2"]]);
  const virouComercial = await chamar("admin", "PUT", `/${id1}`, { titulo: "Renomeado", tipo: "comercial" });
  assert.deepEqual([virouComercial.dados.relatorio.tipo, virouComercial.dados.relatorio.supervisores], ["comercial", []]);
  assert.equal((await chamar("sup", "GET", `/${id1}`)).status, 200);
  assert.equal((await chamar("admin", "PUT", `/${id1}`, { titulo: "Renomeado", tipo: "supervisor" })).status, 400); // sem supervisor
  assert.equal((await chamar("sup", "PUT", `/${id1}`, { tipo: "comercial" })).status, 403); // so quem importa muda o destino

  // relatorio antigo, sem o campo "tipo", continua comercial
  const antigo = await publicar({ titulo: "Antigo sem tipo" });
  await Relatorio.collection.updateOne({ _id: new mongoose.Types.ObjectId(antigo.dados.relatorio.id) }, { $unset: { tipo: "", supervisores: "" } });
  assert.ok((await titulos("sup2")).includes("Antigo sem tipo"));
  assert.equal((await chamar("sup2", "GET", `/${antigo.dados.relatorio.id}`)).dados.relatorio.tipo, "comercial");

  // lista de supervisores para escolher: so quem importa; so ativos
  assert.equal((await chamar("sup", "GET", "/supervisores")).status, 403);
  const sups = (await chamar("admin", "GET", "/supervisores")).dados.supervisores.map((s) => s.codigo);
  assert.deepEqual(sups.sort(), ["sup", "sup2"]);
});
