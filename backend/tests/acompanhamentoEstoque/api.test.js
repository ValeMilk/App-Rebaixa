/**
 * Acompanhamento de estoque ponta a ponta: duas planilhas sao confirmadas pela Integracao Estoque
 * (fluxo real) e depois lidas pelo painel. Banco DESCARTAVEL (outro nome de banco, apagado no fim);
 * se nao houver acesso ao banco, o arquivo e pulado.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const dns = require("dns");

require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const express = require("express");
const jwt = require("jsonwebtoken");
const { criarPlanilha, layoutReferencia } = require("../integracaoEstoque/helpers");

const NOME_BANCO = `rebaixa_teste_acomp_${Date.now()}`;
const baseUri = process.env.MONGODB_URI;
const uri = baseUri ? baseUri.replace(/\/[^/?]*(\?|$)/, `/${NOME_BANCO}$1`) : null;
const podeRodar = !!(uri && process.env.JWT_SECRET);

const REDE = "6";
const LOJA_A = "101 - MATEUS SUPERMERCADOS S.A. MIX ITAPIPOCA - CE";
const LOJA_B = "102 - MATEUS SUPERMERCADOS S.A. MIX JUAZEIRO DO NORTE - CE";
const P1 = "500001 - IOG MORANGO 170G";
const P2 = "500002 - QUEIJO COALHO BARRA KG";
const P3 = "500003 - REQ TRAD 200G";

// [fornecedor, categoria, produto, loja, estoque, qtd30d, custo, venda R$, vlr estoque R$, dde, idade]
const linha = (produto, loja, estoque, qtd, custo, venda, vlr) =>
  ["1 - VALE MILK", "7 - LATICINIOS", produto, loja, estoque, qtd, custo, venda, vlr, 10, 5];

const RETRATO_1 = [
  linha(P1, LOJA_A, 30, 30, 2, 90, 60),       // adequada (30 dias)
  linha(P1, LOJA_B, 0, 30, 2, 90, 0),         // ruptura
  linha(P2, LOJA_A, 10, 0, 3, 0, 30),         // sem giro
  linha(P3, LOJA_A, 100, 30, 1, 45, 100),     // excesso (100 dias)
  linha(P3, LOJA_B, -0.002, 4, 1, 6, -0.002), // saldo negativo (residuo)
];
const RETRATO_2 = [
  linha(P1, LOJA_A, 6, 30, 2, 90, 12),        // baixa (6 dias)
  linha(P1, LOJA_B, 30, 30, 2, 90, 60),       // adequada
  linha(P2, LOJA_A, 10, 0, 3, 0, 30),         // sem giro
  linha(P3, LOJA_A, 50, 30, 1, 45, 50),       // alta (50 dias)
  linha(P3, LOJA_B, 5, 4, 1, 6, 5),           // alta (37,5 dias)
];

let server, base, tokenAdmin, tokenVendedor, M, retrato1, retrato2;
const pronto = () => podeRodar && M && retrato2;

async function chamar(metodo, rota, { token = tokenAdmin, query = {}, json, bin } = {}) {
  const qs = new URLSearchParams(query).toString();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  if (bin) { headers["Content-Type"] = "application/octet-stream"; body = bin; }
  const r = await fetch(`${base}${rota}${qs ? `?${qs}` : ""}`, { method: metodo, headers, body });
  const tipo = r.headers.get("content-type") || "";
  return { status: r.status, dados: tipo.includes("application/json") ? await r.json() : null };
}
const acomp = (rota, query, token) => chamar("GET", `/api/acompanhamento-estoque${rota}`, { query, token });

test.before(async () => {
  if (!podeRodar) return;
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
  try {
    await mongoose.connect(uri, { autoIndex: true, serverSelectionTimeoutMS: 20000 });
  } catch {
    return;
  }
  M = {
    Carteira: require("../../src/models/Carteira"),
    Produto: require("../../src/models/Produto"),
    EstoqueRetrato: require("../../src/models/EstoqueRetrato"),
    EstoqueRetratoLinha: require("../../src/models/EstoqueRetratoLinha"),
    EstoqueRetratoArquivo: require("../../src/models/EstoqueRetratoArquivo"),
    IntegracaoLoja: require("../../src/models/IntegracaoLoja"),
    IntegracaoProduto: require("../../src/models/IntegracaoProduto"),
    IntegracaoColuna: require("../../src/models/IntegracaoColuna"),
    IntegracaoCampo: require("../../src/models/IntegracaoCampo"),
  };
  await Promise.all(Object.values(M).map((m) => m.init()));
  await M.Carteira.create({ clienteCodigo: "1", clienteNome: "MATEUS - X", codigoRede: REDE, redeSubrede: "MIX MATEUS" });
  await M.Produto.create({ codigo: "900", codigoLivre: "900100", descricao: "IOGURTE MORANGO VALEMILK 170G" });

  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use("/api/integracao-estoque", require("../../src/routes/integracaoEstoque"));
  app.use("/api/acompanhamento-estoque", require("../../src/routes/acompanhamentoEstoque"));
  app.use(require("../../src/middlewares/errorHandler"));
  await new Promise((ok) => { server = app.listen(0, ok); });
  base = `http://127.0.0.1:${server.address().port}`;
  const id = () => new mongoose.Types.ObjectId().toString();
  tokenAdmin = jwt.sign({ id: id(), role: "admin", roles: [], nome: "Admin Teste", codigo: "A1" }, process.env.JWT_SECRET);
  tokenVendedor = jwt.sign({ id: id(), role: "vendedor", roles: [], nome: "Vendedor", codigo: "V1" }, process.env.JWT_SECRET);

  // Dois retratos pelo fluxo real da Integracao Estoque
  const confirmar = async (dados, titulo, data, nome) => {
    const bin = await criarPlanilha(layoutReferencia(dados, { titulo }));
    const r = await chamar("POST", "/api/integracao-estoque/confirmar", { query: { codigoRede: REDE, nome, dataRetrato: data }, bin });
    assert.equal(r.status, 201, JSON.stringify(r.dados));
    return r.dados.retrato.id;
  };
  retrato1 = await confirmar(RETRATO_1, "ESTOQUE 22-09", "2026-09-22", "Estoque 22-09.xlsx");
  retrato2 = await confirmar(RETRATO_2, "ESTOQUE 29-09", "2026-09-29", "Estoque 29-09.xlsx");
});

test.after(async () => {
  if (server) await new Promise((ok) => server.close(ok));
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test("acesso: so o administrador", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  assert.equal((await acomp("/redes", {}, null)).status, 401);
  assert.equal((await acomp("/redes", {}, tokenVendedor)).status, 403);
  assert.equal((await acomp("/painel", { retratoId: retrato1 }, tokenVendedor)).status, 403);
  assert.equal((await acomp("/redes")).status, 200);
});

test("redes: so as que ja tem retratos, com contagem e data do ultimo", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  const { redes } = (await acomp("/redes")).dados;
  assert.deepEqual(redes, [{ codigoRede: REDE, nome: "MIX MATEUS", retratos: 2, ultimaData: "2026-09-29" }]);
});

test("painel do 1o retrato: indicadores, status e cobertura global conferem com a conta manual", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  const r = await acomp("/painel", { retratoId: retrato1 });
  assert.equal(r.status, 200);
  const p = r.dados;
  assert.equal(p.retrato.dataRetrato, "2026-09-22");
  assert.equal(p.anterior, null);      // e o primeiro: nao ha com o que comparar
  assert.equal(p.comparacao, null);
  const k = p.kpis;
  assert.equal(k.itens, 5);
  assert.equal(k.lojas, 2);
  assert.equal(k.produtos, 3);
  assert.ok(Math.abs(k.valorEstoque - 189.998) < 1e-9);
  assert.equal(k.vendaReais, 231);
  assert.equal(k.rupturas, 1);
  assert.equal(k.negativos, 1);
  assert.equal(k.semGiro.valorEstoque, 30);
  assert.equal(k.excesso.valorEstoque, 100);
  assert.equal(k.cobertura, 32); // (60 + 0 + 100) / (2 + 2 + 1)
  const porChave = Object.fromEntries(p.status.map((s) => [s.key, s.itens]));
  assert.deepEqual(porChave, { ruptura: 1, negativo: 1, baixa: 0, adequada: 1, alta: 0, excesso: 1, sem_giro: 1, zerado: 0 });
  assert.equal(p.itensTotal, 5);
  const residuo = p.itens.find((i) => i.status === "negativo");
  assert.equal(residuo.estoque, -0.002); // sem arredondar
});

test("painel do 2o retrato compara com o anterior por padrao", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  const p = (await acomp("/painel", { retratoId: retrato2 })).dados;
  assert.equal(p.anterior.dataRetrato, "2026-09-22");
  assert.equal(p.kpis.valorEstoque, 157);
  assert.equal(p.kpis.rupturas, 0);
  const c = p.comparacao;
  assert.ok(Math.abs(c.valorEstoque.delta - (157 - 189.998)) < 1e-9);
  assert.equal(c.vendaReais.delta, 0);
  assert.equal(c.rupturas.delta, -1);
  assert.equal(c.negativos.delta, -1);
  assert.equal(c.excessoValor.delta, -100);
  assert.equal(c.semGiroValor.delta, 0);
  // rankings: ordenados por valor, com o valor do retrato anterior de cada loja/produto
  assert.deepEqual(p.lojas.map((l) => l.codigo), ["101", "102"]);
  const a = p.lojas[0];
  assert.equal(a.valorEstoque, 12 + 30 + 50);
  assert.equal(a.valorAnterior, 60 + 30 + 100);
  assert.equal(p.produtos[0].codigo, "500001"); // 12 + 60 = 72 (o maior)
  assert.equal(p.produtos[0].valorEstoque, 72);
});

test("comparar com 'nenhum', com outro retrato e com id invalido", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  assert.equal((await acomp("/painel", { retratoId: retrato2, compararCom: "nenhum" })).dados.comparacao, null);
  const com1 = (await acomp("/painel", { retratoId: retrato2, compararCom: retrato1 })).dados;
  assert.equal(com1.anterior.id, retrato1);
  assert.equal((await acomp("/painel", { retratoId: retrato2, compararCom: "000000000000000000000000" })).status, 400);
  assert.equal((await acomp("/painel", { retratoId: "000000000000000000000000" })).status, 404);
  assert.equal((await acomp("/painel", { retratoId: "nao-e-um-id" })).status, 404);
});

test("serie: um ponto por retrato, em ordem de data, com os mesmos indicadores do painel", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  const { retratos } = (await acomp("/retratos", { codigoRede: REDE })).dados;
  assert.deepEqual(retratos.map((r) => r.dataRetrato), ["2026-09-22", "2026-09-29"]);
  assert.equal(retratos[1].valorEstoque, 157);
  assert.equal(retratos[0].rupturas, 1);
  assert.equal(retratos[0].cobertura, 32);
  assert.equal((await acomp("/retratos", {})).status, 400);
});

test("nomes: sem cadastro mostra a razao social; apos cadastrar a loja passa a mostrar o nome (vinculo resolvido na leitura)", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  const antes = (await acomp("/painel", { retratoId: retrato2 })).dados;
  assert.match(antes.lojas.find((l) => l.codigo === "101").nome, /ITAPIPOCA/);
  assert.equal(antes.pendencias.lojasSemCadastro, 2);
  assert.equal(antes.pendencias.produtosNaoIdentificados, 3);

  await chamar("POST", "/api/integracao-estoque/lojas/lote", { json: { codigoRede: REDE, lojas: [{ codigo: "101", nome: "Itapipoca" }, { codigo: "102", nome: "Juazeiro do Norte" }] } });
  const produto = await M.Produto.findOne({ codigo: "900" }).lean();
  await chamar("POST", "/api/integracao-estoque/produtos/vinculos", { json: { codigoRede: REDE, vinculos: [{ codigo: "500001", produtoId: String(produto._id), metodo: "manual" }] } });

  const depois = (await acomp("/painel", { retratoId: retrato2 })).dados; // retrato ANTIGO, cadastro NOVO
  assert.equal(depois.lojas.find((l) => l.codigo === "101").nome, "Itapipoca");
  assert.equal(depois.produtos.find((p) => p.codigo === "500001").nome, "IOGURTE MORANGO VALEMILK 170G");
  assert.equal(depois.pendencias.lojasSemCadastro, 0);
  assert.equal(depois.pendencias.produtosNaoIdentificados, 2);
});

test("FANTASMA marcado depois sai do acompanhamento de TODOS os retratos (nunca entra em calculo)", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  await chamar("POST", "/api/integracao-estoque/produtos/fantasma", { json: { codigoRede: REDE, itens: [{ codigo: "500002", descricao: "QUEIJO COALHO BARRA KG" }] } });

  const p2 = (await acomp("/painel", { retratoId: retrato2 })).dados;
  assert.equal(p2.kpis.itens, 4);
  assert.equal(p2.kpis.valorEstoque, 127); // 157 - 30 do fantasma
  assert.equal(p2.kpis.semGiro.itens, 0);
  assert.ok(!p2.itens.some((i) => i.produtoCodigo === "500002"));
  assert.ok(!p2.produtos.some((x) => x.codigo === "500002"));
  assert.equal(p2.pendencias.produtosFantasmaExcluidos, 1);
  assert.ok(Math.abs(p2.comparacao.valorEstoque.anterior - 159.998) < 1e-9); // o anterior tambem perdeu o fantasma

  const { retratos } = (await acomp("/retratos", { codigoRede: REDE })).dados;
  assert.equal(retratos[1].valorEstoque, 127);
  assert.equal(retratos[0].semGiroValor, 0);
});
