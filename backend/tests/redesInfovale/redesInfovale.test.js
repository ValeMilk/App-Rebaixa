/**
 * Redes do InfoVale. Parte 1: regra pura das linhas de carteira. Parte 2: API contra um banco
 * DESCARTAVEL (apagado no fim; pulada sem acesso), conferindo que a rede criada aqui vira carteira,
 * sobrevive a sincronizacao e respeita o Lacteus.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const dns = require("dns");

require("dotenv").config({ path: path.join(__dirname, "../../.env") });
process.env.PG_HOST = ""; // sem Postgres: as lojas do Ativmob vem do espelho de estoque

const mongoose = require("mongoose");
const express = require("express");
const jwt = require("jsonwebtoken");

const { montarDocsCarteira } = require("../../src/services/redesInfovaleService");

// ── Parte 1: regra pura ─────────────────────────────────────────────────────────

test("carteira: uma linha por loja e por supervisor; loja que esta no Lacteus e ignorada", () => {
  const redes = [
    { codigoRede: "IV1", nome: "Rede A", supervisores: [{ codigo: "S1", nome: "Ana" }, { codigo: "S2", nome: "Bia" }], lojas: [{ clienteCodigo: "10", clienteNome: "Loja 10" }, { clienteCodigo: "11", clienteNome: "Loja 11" }] },
    { codigoRede: "IV2", nome: "Rede B", supervisores: [], lojas: [{ clienteCodigo: "20", clienteNome: "Loja 20" }] },
  ];
  const docs = montarDocsCarteira(redes, new Set(["11"]));
  assert.deepEqual(docs.map((d) => `${d.codigoRede}/${d.clienteCodigo}/${d.supervisorCodigo}`), ["IV1/10/S1", "IV1/10/S2", "IV2/20/"]);
  assert.ok(docs.every((d) => d.origem === "infovale" && d.subrede === null));
  assert.equal(docs[0].redeSubrede, "Rede A");
});

// ── Parte 2: API ────────────────────────────────────────────────────────────────

const NOME_BANCO = `rebaixa_teste_redes_${Date.now()}`;
const baseUri = process.env.MONGODB_URI;
const uri = baseUri ? baseUri.replace(/\/[^/?]*(\?|$)/, `/${NOME_BANCO}$1`) : null;
const podeRodar = !!(uri && process.env.JWT_SECRET);

let server, base, Carteira, svc;
const tokens = {};
const ids = {};
const pronto = () => podeRodar && server;

async function chamar(quem, metodo, rota, json) {
  const headers = { Authorization: `Bearer ${tokens[quem]}` };
  if (json !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(`${base}/api${rota}`, { method: metodo, headers, body: json !== undefined ? JSON.stringify(json) : undefined });
  return { status: r.status, dados: await r.json().catch(() => null) };
}

test.before(async () => {
  if (!podeRodar) return;
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
  try {
    await mongoose.connect(uri, { autoIndex: true, serverSelectionTimeoutMS: 20000 });
  } catch {
    return;
  }
  const User = require("../../src/models/User");
  const Estoque = require("../../src/models/Estoque");
  Carteira = require("../../src/models/Carteira");
  svc = require("../../src/services/redesInfovaleService");
  for (const [chave, role, codigo] of [["admin", "admin", "A1"], ["sup1", "supervisor", "S1"], ["sup2", "supervisor", "S2"], ["sup3", "supervisor", "S3"], ["vend", "vendedor", "V1"]]) {
    const u = await User.create({ nome: `Teste ${chave}`, email: `${chave}@teste.com`, codigo, senhaHash: "x", role });
    ids[chave] = u._id.toString();
    tokens[chave] = jwt.sign({ id: ids[chave], role, roles: [], nome: u.nome, codigo }, process.env.JWT_SECRET);
  }
  // Lacteus conhece a loja 1 (rede 21); o Ativmob tem estoque nas lojas 1, 900, 901 e 902
  await Carteira.create({ clienteCodigo: "1", clienteNome: "LOJA LACTEUS", supervisorCodigo: "S3", codigoRede: "21", redeSubrede: "FRANGOLANDIA   " });
  const item = (clienteCodigo, cliente) => ({ chave: `${clienteCodigo}|500`, clienteCodigo, cliente, produtoCodigo: "500", produto: "IOGURTE", quantidade: 10, dataValidade: new Date(Date.now() + 20 * 864e5), classificacao: "rebaixa" });
  await Estoque.collection.insertMany([item("1", "LOJA LACTEUS"), item("900", "MEGA - PACAJUS"), item("901", "MEGA - MESSEJANA"), item("902", "MERCADINHO SOLTO")]);

  const app = express();
  app.use(express.json());
  app.use("/api/redes-infovale", require("../../src/routes/redesInfovale"));
  app.use("/api/estoque", require("../../src/routes/estoque"));
  app.use("/api/encartes", require("../../src/routes/encartes"));
  app.use(require("../../src/middlewares/errorHandler"));
  await new Promise((ok) => { server = app.listen(0, ok); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((ok) => server.close(ok));
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

const MEGA = [{ clienteCodigo: "900", clienteNome: "MEGA - PACAJUS" }, { clienteCodigo: "901", clienteNome: "MEGA - MESSEJANA" }];
let redeId;

test("so quem tem a permissao (admin, por padrao) gerencia as redes", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  assert.equal((await chamar("sup1", "GET", "/redes-infovale")).status, 403);
  assert.equal((await chamar("vend", "POST", "/redes-infovale", {})).status, 403);
  assert.equal((await chamar("admin", "GET", "/redes-infovale")).status, 200);
});

test("opcoes: so lojas do Ativmob que nao estao no Lacteus; supervisores ativos", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  const r = await chamar("admin", "GET", "/redes-infovale/opcoes");
  assert.deepEqual(r.dados.lojas.map((l) => l.clienteCodigo).sort(), ["900", "901", "902"]);
  assert.ok(r.dados.lojas.every((l) => l.rede === null));
  assert.deepEqual(r.dados.supervisores.map((s) => s.codigo), ["S1", "S2", "S3"]);
});

test("criar a rede: vira carteira dos supervisores escolhidos e aparece no estoque deles", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  const r = await chamar("admin", "POST", "/redes-infovale", { nome: "  Mega   Supermercados ", supervisores: [ids.sup1, ids.sup2], lojas: MEGA });
  assert.equal(r.status, 201);
  const rede = r.dados.redes[0];
  redeId = rede.id;
  assert.equal(rede.codigoRede, "IV1");
  assert.equal(rede.nome, "Mega Supermercados");
  assert.deepEqual(rede.supervisores.map((s) => s.codigo), ["S1", "S2"]);

  const linhas = await Carteira.find({ origem: "infovale" }).lean();
  assert.equal(linhas.length, 4); // 2 lojas x 2 supervisores
  assert.ok(linhas.every((l) => l.codigoRede === "IV1" && l.redeSubrede === "Mega Supermercados"));

  for (const sup of ["sup1", "sup2"]) {
    const est = await chamar(sup, "GET", "/estoque");
    assert.deepEqual(est.dados.itens.map((i) => i.clienteCodigo).sort(), ["900", "901"], `estoque de ${sup}`);
    assert.ok(est.dados.itens.every((i) => i.codigoRede === "IV1" && i.redeSubrede === "Mega Supermercados"));
  }
  const outro = await chamar("sup3", "GET", "/estoque"); // supervisor de fora continua vendo so a carteira do Lacteus
  assert.deepEqual(outro.dados.itens.map((i) => i.clienteCodigo), ["1"]);
  const adm = await chamar("admin", "GET", "/estoque");
  assert.equal(adm.dados.itens.find((i) => i.clienteCodigo === "900").redeSubrede, "Mega Supermercados");
  assert.equal(adm.dados.itens.find((i) => i.clienteCodigo === "902").redeSubrede, null);

  // a rede aparece em Encartes para os supervisores dela, e so para eles
  const redesDe = async (quem) => ((await chamar(quem, "GET", "/encartes")).dados.grupos || []).map((g) => g.codigoRede);
  assert.ok((await redesDe("sup1")).includes("IV1"));
  assert.ok(!(await redesDe("sup3")).includes("IV1"));
});

test("validacoes: nome repetido (InfoVale ou Lacteus), loja em outra rede, supervisor invalido, sem lojas", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  const nova = (extra) => chamar("admin", "POST", "/redes-infovale", { nome: "Outra", supervisores: [], lojas: [{ clienteCodigo: "902", clienteNome: "MERCADINHO SOLTO" }], ...extra });
  assert.equal((await nova({ nome: "mega supermercados" })).status, 400);
  assert.equal((await nova({ nome: "frangolandia" })).status, 400);
  assert.match((await nova({ lojas: [MEGA[0]] })).dados.error, /ja esta na rede Mega Supermercados/);
  assert.equal((await nova({ supervisores: [ids.vend] })).status, 400);
  assert.equal((await nova({ supervisores: ["xpto"] })).status, 400);
  assert.equal((await nova({ lojas: [] })).status, 400);
  assert.equal((await nova({ nome: "A" })).status, 400);
  assert.equal(await Carteira.countDocuments({ origem: "infovale" }), 4); // nada mudou
  // a loja ja usada aparece marcada nas opcoes
  const op = await chamar("admin", "GET", "/redes-infovale/opcoes");
  assert.equal(op.dados.lojas.find((l) => l.clienteCodigo === "900").rede.codigoRede, "IV1");
});

test("a rede sobrevive a sincronizacao da carteira; loja que entra no Lacteus passa a valer pelo Lacteus", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  // sincronizacao do ERP: apaga tudo e recarrega; agora o Lacteus tambem conhece a loja 901
  await Carteira.deleteMany({});
  await Carteira.insertMany([
    { clienteCodigo: "1", clienteNome: "LOJA LACTEUS", supervisorCodigo: "S3", codigoRede: "21", redeSubrede: "FRANGOLANDIA" },
    { clienteCodigo: "901", clienteNome: "MEGA - MESSEJANA", supervisorCodigo: "S3", codigoRede: "21", redeSubrede: "FRANGOLANDIA" },
  ]);
  await svc.aplicarNaCarteira();
  const linhas = await Carteira.find({ origem: "infovale" }).lean();
  assert.deepEqual(linhas.map((l) => `${l.clienteCodigo}/${l.supervisorCodigo}`).sort(), ["900/S1", "900/S2"]);
  assert.equal(await Carteira.countDocuments({ clienteCodigo: "901" }), 1);

  const rede = (await chamar("admin", "GET", "/redes-infovale")).dados.redes[0];
  assert.equal(rede.lojas.find((l) => l.clienteCodigo === "901").noLacteus, "FRANGOLANDIA");
  assert.equal(rede.lojas.find((l) => l.clienteCodigo === "900").noLacteus, null);
  assert.deepEqual((await chamar("sup1", "GET", "/estoque")).dados.itens.map((i) => i.clienteCodigo), ["900"]);
});

test("editar: troca nome, supervisores e lojas; excluir tira tudo da carteira", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  const r = await chamar("admin", "PUT", `/redes-infovale/${redeId}`, { nome: "Mega", supervisores: [ids.sup3], lojas: [MEGA[0], { clienteCodigo: "902", clienteNome: "MERCADINHO SOLTO" }] });
  assert.equal(r.status, 200);
  assert.equal(r.dados.redes[0].codigoRede, "IV1"); // o codigo nao muda
  const linhas = await Carteira.find({ origem: "infovale" }).lean();
  assert.deepEqual(linhas.map((l) => `${l.clienteCodigo}/${l.supervisorCodigo}/${l.redeSubrede}`).sort(), ["900/S3/Mega", "902/S3/Mega"]);
  assert.deepEqual((await chamar("sup1", "GET", "/estoque")).dados.itens, []);

  assert.equal((await chamar("admin", "PUT", "/redes-infovale/000000000000000000000000", { nome: "X1", supervisores: [], lojas: MEGA })).status, 404);
  assert.equal((await chamar("admin", "DELETE", `/redes-infovale/${redeId}`)).status, 200);
  assert.equal(await Carteira.countDocuments({ origem: "infovale" }), 0);
  assert.equal(await Carteira.countDocuments({}), 2); // a carteira do Lacteus fica intacta
  // codigo novo nao reaproveita nada em uso
  const nova = await chamar("admin", "POST", "/redes-infovale", { nome: "Nova", supervisores: [], lojas: [MEGA[0]] });
  assert.equal(nova.dados.redes[0].codigoRede, "IV1");
  assert.equal((await Carteira.findOne({ origem: "infovale" }).lean()).supervisorCodigo, "");
});

test("rede que ja existe no Lacteus: recebe lojas do Ativmob sem criar rede nova", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  const SOLTO = [{ clienteCodigo: "902", clienteNome: "MERCADINHO SOLTO" }];
  const op = await chamar("admin", "GET", "/redes-infovale/opcoes");
  assert.deepEqual(op.dados.redesLacteus, [{ codigoRede: "21", nome: "FRANGOLANDIA", supervisoresCodigos: ["S3"] }]);

  // pelo nome nao cria (a mensagem aponta o caminho); pelo codigo do Lacteus, sim
  const porNome = await chamar("admin", "POST", "/redes-infovale", { nome: "Frangolandia", supervisores: [], lojas: SOLTO });
  assert.equal(porNome.status, 400);
  assert.match(porNome.dados.error, /ja existe no Lacteus/);
  assert.equal((await chamar("admin", "POST", "/redes-infovale", { codigoRedeLacteus: "999", supervisores: [], lojas: SOLTO })).status, 400);

  const r = await chamar("admin", "POST", "/redes-infovale", { codigoRedeLacteus: "21", supervisores: [ids.sup1], lojas: SOLTO });
  assert.equal(r.status, 201);
  const rede = r.dados.redes.find((x) => x.codigoRede === "21");
  assert.equal(rede.doLacteus, true);
  assert.equal(rede.nome, "FRANGOLANDIA");
  const linha = await Carteira.findOne({ origem: "infovale", clienteCodigo: "902" }).lean();
  assert.equal(`${linha.codigoRede}/${linha.redeSubrede}/${linha.supervisorCodigo}`, "21/FRANGOLANDIA/S1");
  const est = await chamar("sup1", "GET", "/estoque");
  assert.equal(est.dados.itens.find((i) => i.clienteCodigo === "902").redeSubrede, "FRANGOLANDIA");

  // uma entrada por rede do Lacteus; ela sai das opcoes; o proximo codigo IV ignora o codigo numerico
  assert.equal((await chamar("admin", "POST", "/redes-infovale", { codigoRedeLacteus: "21", supervisores: [], lojas: SOLTO })).status, 400);
  assert.deepEqual((await chamar("admin", "GET", "/redes-infovale/opcoes")).dados.redesLacteus, []);

  // editar mantem o nome do Lacteus; excluir tira so as lojas a mais
  const ed = await chamar("admin", "PUT", `/redes-infovale/${rede.id}`, { nome: "Outro nome", supervisores: [ids.sup2], lojas: SOLTO });
  assert.equal(ed.dados.redes.find((x) => x.codigoRede === "21").nome, "FRANGOLANDIA");
  assert.equal((await Carteira.findOne({ origem: "infovale", clienteCodigo: "902" }).lean()).supervisorCodigo, "S2");
  assert.equal((await chamar("admin", "DELETE", `/redes-infovale/${rede.id}`)).status, 200);
  assert.equal(await Carteira.countDocuments({ codigoRede: "21" }), 2); // as lojas do Lacteus continuam la
  assert.equal(await Carteira.countDocuments({ clienteCodigo: "902" }), 0);
});
