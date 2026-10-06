/**
 * Exportacao do Painel de Vencimentos. Parte 1: planilha (pura, lida de volta com o exceljs).
 * Parte 2: API num banco DESCARTAVEL (pulada sem acesso): escopo de carteira e arquivo valido.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const dns = require("dns");

require("dotenv").config({ path: path.join(__dirname, "../../.env") });
process.env.ERP_HOST = ""; // sem ERP: as colunas de compra saem vazias

const mongoose = require("mongoose");
const express = require("express");
const jwt = require("jsonwebtoken");
const ExcelJS = require("exceljs");

const { COLUNAS, montarLinhas, gerarPlanilha } = require("../../src/services/exportacaoVencimentosService");

async function lerPlanilha(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet("Vencimentos");
  const linhas = [];
  ws.eachRow((row) => linhas.push(row.values.slice(1)));
  return linhas;
}

test("planilha: colunas pedidas, uma linha por item, preco e data da ultima compra quando ha", async () => {
  const itens = [
    { clienteCodigo: "9634", cliente: "MEGA - PACAJUS", produtoCodigo: "152530", produto: "MANTEIGA GHEE 160G", quantidade: 5, dataValidade: "2026-11-03T00:00:00.000Z", diasParaVencer: 29 },
    { clienteCodigo: "9487", cliente: "MEGA - MESSEJANA", produtoCodigo: "187201", produto: "NATA COM SAL 200G", quantidade: 9, dataValidade: new Date("2026-11-07T03:00:00.000Z"), diasParaVencer: 33, codigoRede: "125" },
    { clienteCodigo: "8971165", cliente: "SUPER DO POVO - CAMBEBA", produtoCodigo: "187201", produto: "NATA COM SAL 200G", quantidade: 4, dataValidade: "2026-11-09", diasParaVencer: 35, codigoRede: "125" },
  ];
  const compras = new Map([["9634|152530", { precoUltimaCompra: 10.3, dataUltimaCompra: "2026-10-01T00:00:00.000Z" }]]);
  // a loja do Super do Povo nao compra em nome proprio: vale a ultima compra da rede (CD)
  const comprasRede = new Map([["125|187201", { precoUltimaCompra: 2.65, dataUltimaCompra: "2026-10-01T00:00:00.000Z" }]]);
  const linhas = montarLinhas(itens, compras, comprasRede);
  assert.equal(linhas[0].precoCompra, 10.3);
  assert.equal(linhas[0].origemPreco, "última compra da loja");
  assert.equal(linhas[1].precoCompra, 2.65); // sem compra da loja, mas a rede 125 tem
  assert.equal(linhas[1].origemPreco, "última compra da rede");
  assert.equal(linhas[2].precoCompra, 2.65);
  assert.equal(montarLinhas(itens, compras)[1].precoCompra, null);
  assert.equal(montarLinhas(itens, compras)[1].origemPreco, "sem compra no ERP");

  const [cabecalho, l1, l2] = await lerPlanilha(await gerarPlanilha(montarLinhas(itens.slice(0, 2), compras)));
  assert.deepEqual(cabecalho, COLUNAS.map((c) => c.header));
  assert.deepEqual(cabecalho.slice(0, 6), ["ID loja", "Loja", "Código produto", "Nome produto", "Estoque", "Data de validade"]);
  assert.equal(cabecalho[7], "Preço de compra (ERP)");
  assert.deepEqual(l1.slice(0, 5), ["9634", "MEGA - PACAJUS", "152530", "MANTEIGA GHEE 160G", 5]);
  assert.equal(l1[5].toISOString().slice(0, 10), "2026-11-03");
  assert.equal(l1[7], 10.3);
  assert.equal(l1[8].toISOString().slice(0, 10), "2026-10-01");
  assert.equal(l2[5].toISOString().slice(0, 10), "2026-11-07"); // data com hora nao desloca o dia
  assert.equal(l2[7], undefined); // sem compra: celula vazia
  assert.equal(l2[9], "sem compra no ERP");
});

// ── API ─────────────────────────────────────────────────────────────────────────

const NOME_BANCO = `rebaixa_teste_exportar_${Date.now()}`;
const uri = process.env.MONGODB_URI ? process.env.MONGODB_URI.replace(/\/[^/?]*(\?|$)/, `/${NOME_BANCO}$1`) : null;
const podeRodar = !!(uri && process.env.JWT_SECRET);
let server, base;
const tokens = {};
const ids = {};

test.before(async () => {
  if (!podeRodar) return;
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  } catch {
    return;
  }
  const Estoque = require("../../src/models/Estoque");
  const Carteira = require("../../src/models/Carteira");
  for (const [role, codigo] of [["admin", "A1"], ["supervisor", "S1"]]) tokens[role] = jwt.sign({ id: "000000000000000000000001", role, roles: [], nome: role, codigo }, process.env.JWT_SECRET);
  await Carteira.create({ clienteCodigo: "900", clienteNome: "LOJA DO S1", supervisorCodigo: "S1", codigoRede: "1", redeSubrede: "R" });
  const docs = await Estoque.create([
    { chave: "900|500", clienteCodigo: "900", cliente: "LOJA DO S1", produtoCodigo: "500", produto: "IOGURTE", quantidade: 10, dataValidade: new Date(Date.now() + 20 * 864e5) },
    { chave: "901|500", clienteCodigo: "901", cliente: "LOJA DE OUTRO", produtoCodigo: "500", produto: "IOGURTE", quantidade: 7, dataValidade: new Date(Date.now() + 10 * 864e5) },
  ]);
  ids.minha = docs[0]._id.toString();
  ids.outra = docs[1]._id.toString();
  const app = express();
  app.use(express.json());
  app.use("/api/estoque", require("../../src/routes/estoque"));
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

async function exportar(quem, corpo) {
  const r = await fetch(`${base}/api/estoque/exportar`, { method: "POST", headers: { Authorization: `Bearer ${tokens[quem]}`, "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  return { status: r.status, tipo: r.headers.get("content-type"), itens: r.headers.get("x-itens"), corpo: r.status === 200 ? Buffer.from(await r.arrayBuffer()) : await r.json() };
}

test("API: admin exporta tudo; supervisor so o que esta na carteira dele; sem itens da 400", async (t) => {
  if (!(podeRodar && server)) return t.skip("sem banco de teste");
  const adm = await exportar("admin", { ids: [ids.minha, ids.outra] });
  assert.equal(adm.status, 200);
  assert.match(adm.tipo, /spreadsheetml/);
  assert.equal(adm.itens, "2");
  const linhas = await lerPlanilha(adm.corpo);
  assert.equal(linhas.length, 3);
  assert.deepEqual(linhas.slice(1).map((l) => l[0]), ["901", "900"]); // ordenado pela validade

  const sup = await exportar("supervisor", { ids: [ids.minha, ids.outra] });
  assert.equal(sup.itens, "1");
  assert.equal((await lerPlanilha(sup.corpo))[1][0], "900");
  assert.equal((await exportar("supervisor", { ids: [ids.outra] })).status, 404);
  assert.equal((await exportar("admin", { ids: [] })).status, 400);
  assert.equal((await exportar("admin", {})).status, 400);
});
