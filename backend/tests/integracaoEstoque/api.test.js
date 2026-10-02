/**
 * Teste ponta a ponta da Integracao Estoque contra um banco DESCARTAVEL: usa a mesma conexao do
 * .env, mas com outro nome de banco, e apaga tudo no fim. Se nao houver MONGODB_URI/JWT_SECRET
 * ou o banco nao responder, o arquivo e pulado (nao quebra quem roda sem acesso).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const dns = require("dns");

require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const express = require("express");
const jwt = require("jsonwebtoken");

const { criarPlanilha, layoutReferencia, dado, CABECALHO, LOJA_A, LOJA_B } = require("./helpers");

const NOME_BANCO = `rebaixa_teste_integracao_${Date.now()}`;
const baseUri = process.env.MONGODB_URI;
const uri = baseUri ? baseUri.replace(/\/[^/?]*(\?|$)/, `/${NOME_BANCO}$1`) : null;
const podeRodar = !!(uri && process.env.JWT_SECRET);

let server;
let base;
let tokenAdmin;
let tokenVendedor;
let M; // modelos

const REDE = "6";
const COALHO_REAL = "474835 - QUEIJO COALHO MINAS BARRA KG";
const COALHO_FANTASMA = "474836 - QUEIJO COALHO BARRA KG";
const IOG_170 = "500001 - IOG MORANGO 170G";
const IOG_900_EXATO = "600002 - IOGURTE MORANGO VALEMILK 900G";

const DADOS = [
  dado(COALHO_REAL, LOJA_A, 12.5, 30, 18.9, 700.123, 236.25),
  dado(COALHO_REAL, LOJA_B, 3, 10, 18.9, 200, 56.7),
  dado(COALHO_FANTASMA, LOJA_A, 0, 0, 0, 0, 0),
  dado(IOG_170, LOJA_A, -0.002, 4, 2.1, 8.4, 7353.27792),
  dado(IOG_170, LOJA_B, 20, 40, 2.1, 84, 42),
  dado(IOG_900_EXATO, LOJA_A, 5, 5, 9, 45, 45),
  [],                                       // linha em branco (descartada)
  dado("500009 - SEM LOJA", null, 1, 1, 1, 1, 1), // sem loja (descartada)
];

let _bufExtra;
async function bufferComExtra() {
  if (!_bufExtra) {
    const cab = [...CABECALHO, "Estoque em Trânsito"];
    _bufExtra = await planilhaPadrao(DADOS.map((l, i) => (l.length ? [...l, 100 + i] : l)), { cabecalho: cab });
  }
  return _bufExtra;
}

async function planilhaPadrao(dados = DADOS, opcoes) {
  return criarPlanilha(layoutReferencia(dados, opcoes));
}

async function chamar(metodo, rota, { token = tokenAdmin, query = {}, json, bin } = {}) {
  const qs = new URLSearchParams(query).toString();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  if (bin) { headers["Content-Type"] = "application/octet-stream"; body = bin; }
  const r = await fetch(`${base}/api/integracao-estoque${rota}${qs ? `?${qs}` : ""}`, { method: metodo, headers, body });
  const tipo = r.headers.get("content-type") || "";
  const dados = tipo.includes("application/json") ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { status: r.status, dados, headers: r.headers };
}

const ler = (buf, nome = "Estoque VM 22-09.xlsx") => chamar("POST", "/ler", { query: { codigoRede: REDE, nome }, bin: buf });
const confirmar = (buf, data = "2026-09-22", nome = "Estoque VM 22-09.xlsx") =>
  chamar("POST", "/confirmar", { query: { codigoRede: REDE, nome, dataRetrato: data }, bin: buf });

test.before(async () => {
  if (!podeRodar) return;
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
  try {
    await mongoose.connect(uri, { autoIndex: true, serverSelectionTimeoutMS: 20000 });
  } catch {
    return; // sem acesso ao banco: os testes se pulam
  }
  M = {
    Carteira: require("../../src/models/Carteira"),
    Produto: require("../../src/models/Produto"),
    EstoqueRetrato: require("../../src/models/EstoqueRetrato"),
    EstoqueRetratoLinha: require("../../src/models/EstoqueRetratoLinha"),
    IntegracaoProduto: require("../../src/models/IntegracaoProduto"),
    IntegracaoLoja: require("../../src/models/IntegracaoLoja"),
    IntegracaoCampo: require("../../src/models/IntegracaoCampo"),
    IntegracaoColuna: require("../../src/models/IntegracaoColuna"),
    EstoqueRetratoArquivo: require("../../src/models/EstoqueRetratoArquivo"),
  };
  await Promise.all(Object.values(M).map((m) => m.init()));

  await M.Carteira.create({ clienteCodigo: "1", clienteNome: "MATEUS - X", codigoRede: REDE, redeSubrede: "MIX MATEUS " });
  await M.Produto.create([
    { codigo: "900", codigoLivre: "900100", descricao: "QUEIJO COALHO BARRA VALEMILK KG" },
    { codigo: "901", codigoLivre: "901100", descricao: "IOGURTE MORANGO VALEMILK 170G" },
    { codigo: "902", codigoLivre: "902100", descricao: "IOGURTE WHEY MORANGO VALEMILK 170G" },
    { codigo: "903", codigoLivre: "903100", descricao: "IOGURTE MORANGO VALEMILK 900G" },
  ]);

  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use("/api/integracao-estoque", require("../../src/routes/integracaoEstoque"));
  app.use(require("../../src/middlewares/errorHandler"));
  await new Promise((ok) => { server = app.listen(0, ok); });
  base = `http://127.0.0.1:${server.address().port}`;
  tokenAdmin = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: "admin", roles: [], nome: "Admin Teste", codigo: "A1" }, process.env.JWT_SECRET);
  tokenVendedor = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: "vendedor", roles: [], nome: "Vendedor", codigo: "V1" }, process.env.JWT_SECRET);
});

test.after(async () => {
  if (server) await new Promise((ok) => server.close(ok));
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

const pular = () => !podeRodar || !M;

test("acesso: so o administrador (sem token 401, vendedor 403)", { skip: false }, async (t) => {
  if (pular()) return t.skip("sem banco de teste");
  assert.equal((await chamar("GET", "/clientes", { token: null })).status, 401);
  assert.equal((await chamar("GET", "/clientes", { token: tokenVendedor })).status, 403);
  const ok = await chamar("GET", "/clientes");
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.dados.clientes, [{ codigoRede: REDE, nome: "MIX MATEUS" }]);
});

test("cadastro VAZIO: o arquivo inteiro cai em nao identificados, com nomes sugeridos plausiveis", async (t) => {
  if (pular()) return t.skip("sem banco de teste");
  const r = await ler(await planilhaPadrao());
  assert.equal(r.status, 200);
  const a = r.dados;
  assert.equal(a.resumo.linhasValidas, 6);
  assert.equal(a.resumo.linhasDescartadas, 2);
  assert.equal(a.resumo.linhasValidas + a.resumo.linhasDescartadas, a.resumo.totalLinhasArquivo);
  assert.equal(a.resumo.lojasNoArquivo, 2);
  assert.equal(a.resumo.lojasReconhecidas, 0);
  assert.equal(a.lojasNaoIdentificadas.length, 2);
  assert.deepEqual(a.lojasNaoIdentificadas.map((l) => l.nomeSugerido).sort(), ["Itapipoca", "Juazeiro do Norte"]);
  assert.equal(a.dataInferida.data, "2026-09-22");
  assert.equal(a.cabecalho.linha, 3);
  assert.equal(a.podeConfirmar, true);
  assert.equal(a.jaImportado, null);
  // o nome exato e unico ja e reconhecido sozinho; os demais viram pendencia
  assert.equal(a.resumo.produtosNoArquivo, 4);
  assert.equal(a.resumo.produtosReconhecidos, 1);
  assert.equal(a.resumo.produtosPendentes, 3);
});

test("TRAVA DE LOTE: o codigo real e o fantasma apontam para o mesmo item e NENHUM vem pre-marcado", async (t) => {
  if (pular()) return t.skip("sem banco de teste");
  const a = (await ler(await planilhaPadrao())).dados;
  const real = a.produtosPendentes.find((p) => p.codigo === "474835");
  const fantasma = a.produtosPendentes.find((p) => p.codigo === "474836");
  assert.equal(real.sugestoes[0].descricao, "QUEIJO COALHO BARRA VALEMILK KG");
  assert.equal(fantasma.sugestoes[0].descricao, "QUEIJO COALHO BARRA VALEMILK KG");
  assert.ok(fantasma.sugestoes[0].pontuacao > real.sugestoes[0].pontuacao); // o fantasma pontua MAIS
  assert.equal(real.preSelecionado, null);
  assert.equal(fantasma.preSelecionado, null);
  assert.equal(fantasma.motivoSemPreSelecao, "outro codigo tambem aponta para este item");
  // um nome sem ambiguidade vem pre-marcado
  const iog = a.produtosPendentes.find((p) => p.codigo === "500001");
  assert.equal(iog.sugestoes[0].descricao, "IOGURTE MORANGO VALEMILK 170G");
  assert.equal(iog.preSelecionado, iog.sugestoes[0].produtoId);
});

test("campo obrigatorio ausente bloqueia a gravacao com mensagem clara, sem derrubar o processo", async (t) => {
  if (pular()) return t.skip("sem banco de teste");
  const cab = CABECALHO.filter((c) => c !== "Produto");
  const dados = DADOS.map((l) => (l.length ? l.filter((_, i) => i !== 2) : l));
  const buf = await planilhaPadrao(dados, { cabecalho: cab });
  const previa = (await ler(buf)).dados;
  assert.equal(previa.bloqueada, true);
  assert.equal(previa.podeConfirmar, false);
  assert.deepEqual(previa.obrigatoriosAusentes.map((o) => o.rotulo), ["Produto"]);
  const c = await confirmar(buf);
  assert.equal(c.status, 422);
  assert.match(c.dados.error, /Faltam colunas obrigatorias: Produto/);
  assert.equal(await M.EstoqueRetrato.countDocuments(), 0);
});

test("cadastro em lote de lojas (nomes editados) passa a reconhecer as lojas", async (t) => {
  if (pular()) return t.skip("sem banco de teste");
  const a = (await ler(await planilhaPadrao())).dados;
  const r = await chamar("POST", "/lojas/lote", {
    json: { codigoRede: REDE, lojas: a.lojasNaoIdentificadas.map((l) => ({ codigo: l.codigo, nome: l.nomeSugerido, razaoSocial: l.razaoSocial })) },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(r.dados, { criadas: 2, jaExistiam: 0 });
  const de_novo = await chamar("POST", "/lojas/lote", { json: { codigoRede: REDE, lojas: [{ codigo: "101", nome: "Outro nome" }] } });
  assert.deepEqual(de_novo.dados, { criadas: 0, jaExistiam: 1 }); // nunca sobrescreve
  const b = (await ler(await planilhaPadrao())).dados;
  assert.equal(b.resumo.lojasReconhecidas, 2);
  assert.equal(b.lojasNaoIdentificadas.length, 0);
  assert.equal((await chamar("POST", "/lojas/lote", { json: { codigoRede: REDE, lojas: [{ codigo: "9", nome: "  " }] } })).status, 400);
});

test("produto FANTASMA marcado uma vez nao volta como pendencia nem ao reimportar", async (t) => {
  if (pular()) return t.skip("sem banco de teste");
  const f = await chamar("POST", "/produtos/fantasma", { json: { codigoRede: REDE, itens: [{ codigo: "474836", descricao: "QUEIJO COALHO BARRA KG" }] } });
  assert.deepEqual(f.dados, { marcados: 1 });
  for (let i = 0; i < 2; i++) { // reimportando de novo
    const a = (await ler(await planilhaPadrao())).dados;
    assert.equal(a.resumo.produtosFantasma, 1);
    assert.ok(!a.produtosPendentes.some((p) => p.codigo === "474836"));
  }
  // sem o fantasma competindo, o codigo real deixa de ter a pre-selecao travada
  const a = (await ler(await planilhaPadrao())).dados;
  const real = a.produtosPendentes.find((p) => p.codigo === "474835");
  assert.equal(real.preSelecionado, real.sugestoes[0].produtoId);
});

test("vinculos: confirma so o que foi enviado; produto inexistente e rejeitado", async (t) => {
  if (pular()) return t.skip("sem banco de teste");
  const a = (await ler(await planilhaPadrao())).dados;
  const real = a.produtosPendentes.find((p) => p.codigo === "474835");
  const r = await chamar("POST", "/produtos/vinculos", {
    json: { codigoRede: REDE, vinculos: [{ codigo: "474835", descricao: real.descricao, produtoId: real.sugestoes[0].produtoId, metodo: "sugestao_confirmada", pontuacao: real.sugestoes[0].pontuacao }] },
  });
  assert.deepEqual(r.dados, { vinculados: 1 });
  const id = await M.IntegracaoProduto.findOne({ codigoRede: REDE, valor: "474835" }).lean();
  assert.equal(id.metodo, "sugestao_confirmada");
  assert.equal(id.fantasma, false);
  assert.ok(id.pontuacao > 0.8);
  const ruim = await chamar("POST", "/produtos/vinculos", { json: { codigoRede: REDE, vinculos: [{ codigo: "x", produtoId: new mongoose.Types.ObjectId().toString() }] } });
  assert.equal(ruim.status, 400);
  const b = (await ler(await planilhaPadrao())).dados;
  assert.equal(b.resumo.produtosReconhecidos, 2);
  assert.equal(b.resumo.produtosPendentes, 1); // so o IOG 170G
});

test("busca manual no catalogo", async (t) => {
  if (pular()) return t.skip("sem banco de teste");
  const r = await chamar("GET", "/produtos/buscar", { query: { q: "whey" } });
  assert.equal(r.dados.produtos.length, 1);
  assert.equal(r.dados.produtos[0].descricao, "IOGURTE WHEY MORANGO VALEMILK 170G");
  assert.equal((await chamar("GET", "/produtos/buscar", { query: { q: "a" } })).dados.produtos.length, 0);
});

test("coluna nova vira campo personalizado (extras) sem migracao de banco", async (t) => {
  if (pular()) return t.skip("sem banco de teste");
  const buf = await bufferComExtra();
  const a = (await ler(buf)).dados;
  const nova = a.colunas.find((c) => c.status === "nova");
  assert.equal(nova.cabecalhoOriginal, "Estoque em Trânsito");

  const colide = await chamar("POST", "/colunas", { json: { codigoRede: REDE, decisoes: [{ cabecalhoOriginal: "Estoque em Trânsito", acao: "criar", rotulo: "Estoque atual" }] } });
  assert.equal(colide.status, 400); // chave de campo do sistema nao pode ser reutilizada

  const ok = await chamar("POST", "/colunas", { json: { codigoRede: REDE, decisoes: [{ cabecalhoOriginal: "Estoque em Trânsito", acao: "criar", rotulo: "Estoque em trânsito", tipoValor: "numero" }] } });
  assert.equal(ok.status, 200);
  const b = (await ler(buf)).dados;
  assert.equal(b.colunas.find((c) => c.cabecalhoOriginal === "Estoque em Trânsito").status, "reconhecida");
  assert.equal(b.camposPersonalizados[0].chave, "estoque_em_transito");

  // associar a outro campo atualiza o sinonimo em vez de duplicar
  const reassoc = await chamar("POST", "/colunas", { json: { codigoRede: REDE, decisoes: [{ cabecalhoOriginal: "Estoque em Trânsito", acao: "ignorar" }] } });
  assert.equal(reassoc.status, 200);
  assert.equal(await M.IntegracaoColuna.countDocuments({ codigoRede: REDE, cabecalhoNormalizado: "estoque em transito" }), 1);
  const c = (await ler(buf)).dados;
  assert.equal(c.colunas.find((x) => x.cabecalhoOriginal === "Estoque em Trânsito").status, "ignorada");
  // volta para o campo personalizado para o proximo teste gravar os extras
  await chamar("POST", "/colunas", { json: { codigoRede: REDE, decisoes: [{ cabecalhoOriginal: "Estoque em Trânsito", acao: "associar", campo: "estoque_em_transito" }] } });
});

test("confirmar grava o retrato imutavel, sem arredondar, com extras, arquivo original e conservacao", async (t) => {
  if (pular()) return t.skip("sem banco de teste");
  const buf = await bufferComExtra();

  assert.equal((await confirmar(buf, "22/09/2026")).status, 400); // data fora do formato
  assert.equal((await confirmar(buf, "2026-02-31")).status, 400); // data impossivel

  const c = await confirmar(buf);
  assert.equal(c.status, 201);
  assert.equal(c.dados.jaExistia, false);
  const r = c.dados.retrato;
  assert.equal(r.dataRetrato, "2026-09-22");
  assert.equal(r.linhasValidas + r.linhasDescartadas, r.totalLinhasArquivo);
  assert.equal(r.linhasValidas, 6);
  assert.equal(r.lojasNoArquivo, 2);
  assert.equal(r.lojasReconhecidas, 2);
  assert.equal(r.produtosFantasma, 1);
  assert.equal(r.importadoPorNome, "Admin Teste");

  const linhas = await M.EstoqueRetratoLinha.find({ retratoId: r.id }).sort({ linha: 1 }).lean();
  assert.equal(linhas.length, 6);
  const residuo = linhas.find((l) => l.estoqueAtual === -0.002);
  assert.ok(residuo, "o residuo -0.002 deve ficar como veio");
  assert.equal(residuo.valorEstoqueReais, 7353.27792);
  assert.equal(residuo.extras.estoque_em_transito, 103);
  assert.ok(residuo.lojaId, "loja resolvida na gravacao");
  // pendente (IOG 170G ainda nao vinculado): grava mesmo assim, sem produto — o bruto nunca espera o cadastro
  assert.equal(residuo.produtoId, null);
  assert.equal(residuo.fantasma, false);
  const coalho = linhas.find((l) => l.produtoCodigo === "474835");
  assert.ok(coalho.produtoId, "vinculado por sugestao confirmada");
  const exato = linhas.find((l) => l.produtoCodigo === "600002");
  assert.ok(exato.produtoId, "reconhecido por nome exato");
  assert.equal((await M.IntegracaoProduto.findOne({ codigoRede: REDE, valor: "600002" }).lean()).metodo, "nome_exato");
  const fantasma = linhas.find((l) => l.produtoCodigo === "474836");
  assert.equal(fantasma.fantasma, true);
  assert.equal(fantasma.produtoId, null);
  assert.equal(linhas[0].linha, 4); // 1-indexada como no Excel

  const ret = await M.EstoqueRetrato.findById(r.id).lean();
  assert.equal(ret.dataRetrato.toISOString(), "2026-09-22T00:00:00.000Z"); // dia, sem hora
  assert.equal(ret.mapeamentoColunas.length, 12);
  assert.equal(ret.descartadas.length, 2);
  const somaValor = linhas.reduce((s, l) => s + l.valorEstoqueReais, 0);
  assert.ok(Math.abs(somaValor - ret.valorTotalEstoque) < 1e-9);
});

test("reenviar o MESMO arquivo nao duplica: devolve o retrato que ja existe", async (t) => {
  if (pular()) return t.skip("sem banco de teste");
  const buf = await bufferComExtra();
  const de_novo = await confirmar(buf, "2026-09-23", "outro nome.xlsx");
  assert.equal(de_novo.status, 200);
  assert.equal(de_novo.dados.jaExistia, true);
  assert.equal(de_novo.dados.retrato.dataRetrato, "2026-09-22"); // a primeira data, nao a nova
  assert.equal(await M.EstoqueRetrato.countDocuments(), 1);
  assert.equal(await M.EstoqueRetratoLinha.countDocuments(), 6);
  const previa = (await ler(buf)).dados;
  assert.equal(previa.jaImportado.dataRetrato, "2026-09-22");
  assert.equal(previa.jaImportado.importadoPorNome, "Admin Teste");
});

test("lista de retratos e download do arquivo original (bytes identicos)", async (t) => {
  if (pular()) return t.skip("sem banco de teste");
  const lista = await chamar("GET", "/retratos", { query: { codigoRede: REDE } });
  assert.equal(lista.dados.retratos.length, 1);
  assert.equal(lista.dados.retratos[0].nomeArquivo, "Estoque VM 22-09.xlsx");
  assert.equal(lista.dados.retratos[0].mapeamentoColunas, undefined); // lista leve
  const original = await bufferComExtra();
  const baixado = await chamar("GET", `/retratos/${lista.dados.retratos[0].id}/arquivo`);
  assert.equal(baixado.status, 200);
  assert.match(baixado.headers.get("content-disposition"), /attachment; filename\*=UTF-8''Estoque%20VM%2022-09\.xlsx/);
  assert.ok(Buffer.compare(baixado.dados, original) === 0, "o arquivo guardado e byte a byte o enviado");
  assert.equal((await chamar("GET", "/retratos/000000000000000000000000/arquivo")).status, 404);
  assert.equal((await chamar("GET", "/retratos/nao-e-um-id/arquivo")).status, 404);
});

test("corpo sem arquivo e arquivo invalido devolvem 400 amigavel", async (t) => {
  if (pular()) return t.skip("sem banco de teste");
  assert.equal((await chamar("POST", "/ler", { query: { codigoRede: REDE }, json: { a: 1 } })).status, 400);
  const lixo = await ler(Buffer.from("isto nao e um xlsx"));
  assert.equal(lixo.status, 400);
  assert.match(lixo.dados.error, /xlsx/);
  const semRede = await chamar("POST", "/ler", { query: { codigoRede: "999999" }, bin: await planilhaPadrao() });
  assert.equal(semRede.status, 400);
});
