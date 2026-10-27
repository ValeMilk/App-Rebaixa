const test = require("node:test");
const assert = require("node:assert/strict");
const { instalarModelosFalsos, criarPlanilha } = require("./helpers");

const CARTEIRA = [
  { clienteCodigo: "1001", clienteNome: "MIX ITAPIPOCA", codigoRede: "26", redeSubrede: "MIX MATEUS" },
  { clienteCodigo: "1002", clienteNome: "MIX JUAZEIRO", codigoRede: "26", redeSubrede: "MIX MATEUS" },
  { clienteCodigo: "2001", clienteNome: "OUTRA LOJA", codigoRede: "40", redeSubrede: "OUTRA REDE" },
];
const PRODUTOS = [
  { codigo: "000474835", codigoLivre: "474835", descricao: "QUEIJO COALHO VALE MILK BARRA KG", categoria: "QUEIJOS" },
  { codigo: "000500001", codigoLivre: "500001", descricao: "IOG MORANGO 170G", categoria: "IOGURTES" },
  { codigo: "000500002", codigoLivre: "500002", descricao: "IOGURTE NATURAL 170G", categoria: "IOGURTES" },
  { codigo: "000500003", codigoLivre: null, descricao: "REQUEIJAO 200G", categoria: "REQUEIJAO" },
  { codigo: "000500004", codigoLivre: "500004", descricao: "MANTEIGA 200G", categoria: "MANTEIGA" },
  { codigo: "000500005", codigoLivre: "500005", descricao: "MANTEIGA 200G", categoria: "MANTEIGA" }, // descricao repetida: ambigua
];
const modelos = instalarModelosFalsos({
  carteira: CARTEIRA,
  produtos: PRODUTOS,
  lojasRede: [
    { codigoRede: "26", codigo: "L7", clienteCodigo: "1002" },
    { codigoRede: "26", codigo: "L8", clienteCodigo: null }, // cadastrada na integracao mas sem vinculo com o Lacteus
  ],
  vinculos: [
    { codigoRede: "26", valor: "ZZZ-1", produtoCodigo: "000500001", fantasma: false },
    { codigoRede: "26", valor: "FANT", produtoCodigo: null, fantasma: true },
  ],
  responsaveis: [{ codigoRede: "26", supervisorCodigo: "JEF", supervisorNome: "Jefferson" }],
});
const svc = require("../../src/services/margensRedeService");

// Cabecalho na 3a linha, colunas fora da ordem "natural", nomes variados
const CABECALHO = ["Custo Médio Unit. R$", "Descrição do Produto", "Cód. Loja", "Código", "Nome da Loja"];
const DADOS = [
  [18.9, "QUEIJO COALHO VALE MILK BARRA KG", 1001, 474835, "Itapipoca"],   // loja Lacteus direto, produto por codigoLivre
  [2.123456, "IOG MORANGO 170G", "L7", "ZZZ-1", "Juazeiro"],              // loja pelo codigo da rede, produto por vinculo
  [3.4, "Iogurte natural 170g", 1001, null, null],                         // produto por descricao (normalizada)
  ["1.234,567", "REQUEIJAO 200G", "0001001", "000500003", null],           // loja sem zeros a esquerda, produto por codigo ERP, custo pt-BR
  [5, "nada a ver", 1001, "X9", null],                                     // produto nao reconhecido
  [7, "QUEIJO COALHO VALE MILK BARRA KG", 9999, 474835, null],             // loja nao reconhecida
  [7.5, "IOG MORANGO 170G", "L8", 500001, null],                           // loja da rede sem vinculo
  [8, "MANTEIGA 200G", 1002, null, null],                                  // descricao ambigua
  [9, "IOG MORANGO 170G", 1002, "FANT", null],                             // fantasma
  ["", "IOG MORANGO 170G", 1001, 500001, null],                            // custo vazio
  [],                                                                      // linha em branco
  [19.1, "QUEIJO COALHO VALE MILK BARRA KG", 1001, 474835, null],          // loja+produto repetidos
];
const MATRIZ = [["CUSTO MÉDIO MIX MATEUS - OUTUBRO"], [], CABECALHO, ...DADOS];

test("campoDoCabecalho: nomes variados, com acento e pontuacao", () => {
  const f = svc.campoDoCabecalho;
  for (const h of ["Loja", "cód loja", "Codigo Loja", "FILIAL", "Cód. da Filial", "Cliente", "Código do Cliente"]) assert.equal(f(h), "loja", h);
  for (const h of ["Produto", "Cód Produto", "codigo", "SKU", "Item", "Cód. do Item", "Código Interno"]) assert.equal(f(h), "produto", h);
  for (const h of ["Descrição", "Descricao do Produto", "Nome do Produto", "Desc. Item"]) assert.equal(f(h), "descricao", h);
  for (const h of ["Custo Médio", "custo medio", "Custo", "Custo Médio Unit. R$", "CUSTO MÉDIO UNITÁRIO", "Custo Líquido"]) assert.equal(f(h), "custo", h);
  for (const h of ["Nome da Loja", "Razão Social"]) assert.equal(f(h), "loja_nome", h);
  assert.equal(f("Estoque"), null);
  assert.equal(f("CNPJ"), null);
  assert.equal(f(""), null);
});

test("cabecalho fora da primeira linha e colunas em qualquer ordem", () => {
  const l = svc.lerPlanilhaCustoMedio(MATRIZ);
  assert.equal(l.linhaCabecalho, 3);
  assert.equal(l.bloqueada, false);
  assert.deepEqual(l.colunas.map((c) => c.campo), ["custo", "descricao", "loja", "produto", "loja_nome"]);
  assert.equal(l.totalLinhas, DADOS.length);
  assert.equal(l.linhas.length + l.descartadas.length, DADOS.length, "conservacao");
  assert.deepEqual(l.descartadas.map((d) => [d.linha, d.motivo]), [[13, "custo médio vazio"], [14, "linha em branco"]]);
});

test("sem coluna de custo ou de loja: leitura bloqueada com os obrigatorios ausentes", () => {
  const semCusto = svc.lerPlanilhaCustoMedio([["Loja", "Produto", "Estoque"], [1, 2, 3]]);
  assert.equal(semCusto.bloqueada, true);
  assert.ok(semCusto.obrigatoriosAusentes.some((o) => o.chave === "custo"));
  const semProduto = svc.lerPlanilhaCustoMedio([["Loja", "Custo"], [1, 2]]);
  assert.equal(semProduto.bloqueada, true);
  assert.ok(semProduto.obrigatoriosAusentes.some((o) => o.chave === "produto"));
  const vazia = svc.lerPlanilhaCustoMedio([[], []]);
  assert.equal(vazia.semCabecalho, true);
});

test("resolucao: loja Lacteus direto ou codigo da rede; produto por codigoLivre, codigo ERP, vinculo ou descricao; motivos; sem arredondar", () => {
  const leitura = svc.lerPlanilhaCustoMedio(MATRIZ);
  const r = svc.resolverLinhasCustoMedio(leitura.linhas, {
    lojasLacteus: CARTEIRA.filter((c) => c.codigoRede === "26"),
    lojasRede: modelos.IntegracaoLoja.dados,
    catalogo: PRODUTOS,
    vinculos: modelos.IntegracaoProduto.dados,
  });
  assert.equal(r.validas.length, 4);
  assert.deepEqual(
    r.validas.map((v) => [v.linha, v.clienteCodigo, v.produtoCodigo, v.produtoCodigoErp, v.custoMedio, v.metodo]),
    [
      [4, "1001", "474835", "000474835", 18.9, "codigoLivre"],
      [5, "1002", "500001", "000500001", 2.123456, "vinculo"],
      [6, "1001", "500002", "000500002", 3.4, "descricao"],
      [7, "1001", "000500003", "000500003", 1234.567, "codigoErp"],
    ]
  );
  const motivos = Object.fromEntries(r.descartadas.map((d) => [d.linha, d.motivo]));
  assert.match(motivos[8], /produto não reconhecido: X9/);
  assert.match(motivos[9], /loja não reconhecida: 9999/);
  assert.match(motivos[10], /L8 cadastrada na Integração Estoque sem vínculo/);
  assert.match(motivos[11], /mais de um produto/);
  assert.match(motivos[12], /fantasma/);
  assert.match(motivos[15], /repetidos .*linha 4/);
  assert.equal(r.lojas, 2);
  assert.equal(r.produtos, 4);
  assert.deepEqual(r.lojasNaoReconhecidas.map((l) => l.codigo), ["9999", "L8"]);
  assert.deepEqual(r.produtosNaoReconhecidos.map((p) => p.codigo || p.descricao), ["X9", "MANTEIGA 200G", "FANT"]);
});

test("analisarCustoMedio le o .xlsx gerado com exceljs e monta o resumo; importar grava versao, desativa a anterior e barra o mesmo hash (409)", async () => {
  const buffer = await criarPlanilha(MATRIZ);
  const previa = await svc.analisarCustoMedio({ codigoRede: "26", buffer, nomeArquivo: "custo.xlsx" });
  assert.equal(previa.jaImportado, null);
  assert.equal(previa.cabecalho.linha, 3);
  assert.deepEqual(previa.resumo, { totalLinhas: 12, validas: 4, descartadas: 8, lojas: 2, lojasNaoReconhecidas: 2, produtos: 4, produtosNaoReconhecidos: 3 });
  assert.equal(previa.resumo.validas + previa.resumo.descartadas, previa.resumo.totalLinhas, "conservacao");
  assert.equal(previa.descartadasTotal, 8);
  assert.deepEqual(previa.descartadas.map((d) => d.linha), [8, 9, 10, 11, 12, 13, 14, 15]);
  assert.equal(previa.podeConfirmar, true);

  const user = { id: "u1", nome: "Jefferson", codigo: "JEF", role: "supervisor" };
  const v1 = await svc.importarCustoMedio({ codigoRede: "26", buffer, nomeArquivo: "custo.xlsx", user });
  assert.equal(v1.versao.versao, 1);
  assert.equal(v1.versao.ativa, true);
  assert.equal(v1.resumo.validas, 4);
  const gravado = modelos.CustoMedioRede.dados[0];
  assert.equal(gravado.hashArquivo.length, 64);
  assert.ok(Buffer.isBuffer(gravado.arquivo) && gravado.arquivo.length === buffer.length, "original guardado");
  assert.equal(gravado.linhas[1].custoMedio, 2.123456, "valor nao arredondado");
  assert.equal(gravado.linhas[3].custoMedio, 1234.567);

  // mesmo arquivo de novo: previa avisa e importar recusa com 409 dizendo quando e por quem
  const previa2 = await svc.analisarCustoMedio({ codigoRede: "26", buffer, nomeArquivo: "custo.xlsx" });
  assert.equal(previa2.jaImportado.versao, 1);
  assert.equal(previa2.podeConfirmar, false);
  await assert.rejects(svc.importarCustoMedio({ codigoRede: "26", buffer, nomeArquivo: "custo.xlsx", user }), (err) => {
    assert.equal(err.status, 409);
    assert.match(err.publicMessage, /ja foi importado em .* por Jefferson \(versao 1\)/);
    assert.equal(err.extra.jaImportado.versao, 1);
    return true;
  });

  // arquivo diferente: versao 2 ativa, versao 1 desativada; a precificacao passa a ler a nova
  const buffer2 = await criarPlanilha([CABECALHO, [21.5, "QUEIJO COALHO VALE MILK BARRA KG", 1001, 474835, null]]);
  const v2 = await svc.importarCustoMedio({ codigoRede: "26", buffer: buffer2, nomeArquivo: "custo2.xlsx", user });
  assert.equal(v2.versao.versao, 2);
  assert.equal(modelos.CustoMedioRede.dados.find((d) => d.versao === 1).ativa, false);
  assert.equal(modelos.CustoMedioRede.dados.find((d) => d.versao === 2).ativa, true);
  const r = await svc.obterMargemECusto({ codigoRede: "26", clienteCodigo: "1001", produtoCodigo: "474835" });
  assert.equal(r.custoMedio, 21.5);
  assert.equal(r.custoMedioVersao, 2);

  const versoes = await svc.listarVersoes("26");
  assert.deepEqual(versoes.map((v) => [v.versao, v.ativa, v.linhas]), [[2, true, 1], [1, false, 4]]);
  assert.ok(!("arquivo" in versoes[0]) && !("linhas" in modelos.CustoMedioRede.dados[0] === false), "sem Buffer na listagem");
});

test("importar sem nenhuma linha reconhecida e recusado (422); arquivo sem cabecalho tambem", async () => {
  const user = { id: "u1", nome: "Admin", role: "admin" };
  const nada = await criarPlanilha([CABECALHO, [1, "x", 9999, "X9", null]]);
  await assert.rejects(svc.importarCustoMedio({ codigoRede: "26", buffer: nada, nomeArquivo: "n.xlsx", user }), (e) => e.status === 422);
  const semCab = await criarPlanilha([["a", "b"], [1, 2]]);
  await assert.rejects(svc.importarCustoMedio({ codigoRede: "26", buffer: semCab, nomeArquivo: "s.xlsx", user }), (e) => e.status === 422);
  await assert.rejects(svc.analisarCustoMedio({ codigoRede: "77", buffer: nada, nomeArquivo: "n.xlsx" }), (e) => e.status === 404);
});

test("podeAnexar: admin sempre; supervisor so na rede em que e responsavel", async () => {
  assert.equal(await svc.podeAnexar({ role: "admin" }, "26"), true);
  assert.equal(await svc.podeAnexar({ role: "supervisor", codigo: "JEF" }, "26"), true);
  assert.equal(await svc.podeAnexar({ role: "supervisor", codigo: "JEF" }, "40"), false);
  assert.equal(await svc.podeAnexar({ role: "supervisor", codigo: "OUTRO" }, "26"), false);
  assert.equal(await svc.podeAnexar(null, "26"), false);
});
