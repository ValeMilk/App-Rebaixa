const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizarCabecalho, chaveDeCampoPersonalizado, separarCodigoDescricao, paraNumero,
} = require("../../src/services/integracaoEstoque/texto");
const { regrasVazias, acharCabecalho, mapearColunas, resolverCampo } = require("../../src/services/integracaoEstoque/colunas");
const { lerPlanilha, inferirData, extrairDataDoTexto } = require("../../src/services/integracaoEstoque/leitura");
const { criarPlanilha, layoutReferencia, dado, CABECALHO, LOJA_A, LOJA_B } = require("./helpers");

const HOJE = new Date(2026, 9, 2); // 02/10/2026

// ── Texto e numeros ─────────────────────────────────────────────────────────────

test("normalizarCabecalho: minusculas, sem acento, preserva $ e %", () => {
  assert.equal(normalizarCabecalho("Custo Médio Unit. R$"), "custo medio unit r$");
  assert.equal(normalizarCabecalho("  Venda   R$ "), "venda r$");
  assert.notEqual(normalizarCabecalho("Venda R$"), normalizarCabecalho("Venda"));
  assert.equal(normalizarCabecalho("Margem %"), "margem %");
});

test("chaveDeCampoPersonalizado", () => {
  assert.equal(chaveDeCampoPersonalizado("Estoque em Trânsito R$"), "estoque_em_transito");
  assert.equal(chaveDeCampoPersonalizado("Estoque em trânsito"), "estoque_em_transito");
});

test("separarCodigoDescricao: so o primeiro ' - ' separa", () => {
  assert.deepEqual(separarCodigoDescricao("474835 - QUEIJO COALHO VALE MILK BARRA KG"),
    { codigo: "474835", descricao: "QUEIJO COALHO VALE MILK BARRA KG" });
  assert.deepEqual(separarCodigoDescricao("12 - IOGURTE - MORANGO"), { codigo: "12", descricao: "IOGURTE - MORANGO" });
  assert.deepEqual(separarCodigoDescricao(null), { codigo: null, descricao: null });
  assert.equal(separarCodigoDescricao(474835).codigo, "474835");
});

test("paraNumero: nativo, pt-BR, vazio e invalido; nada e arredondado", () => {
  assert.deepEqual(paraNumero(-0.002), { vazio: false, ok: true, valor: -0.002 });
  assert.equal(paraNumero(7353.27792).valor, 7353.27792);
  assert.equal(paraNumero("1.234,56").valor, 1234.56);
  assert.equal(paraNumero("12,5").valor, 12.5);
  assert.equal(paraNumero("R$ 3,40").valor, 3.4);
  assert.equal(paraNumero("").vazio, true);
  assert.equal(paraNumero(null).vazio, true);
  assert.equal(paraNumero("abc").ok, false);
});

// ── Cabecalho e colunas ─────────────────────────────────────────────────────────

test("acharCabecalho: pula titulo e linha vazia; exige o minimo de colunas", () => {
  const m = layoutReferencia([]);
  assert.equal(acharCabecalho(m, regrasVazias()).indice, 2);
  assert.equal(acharCabecalho([["ESTOQUE 22-09"], ["Produto", "Filial"]], regrasVazias()), null); // so 2 reconhecidas
});

test("acharCabecalho: empate fica com a PRIMEIRA linha", () => {
  const m = [["Produto", "Filial", "Estoque Atual"], ["Produto", "Filial", "Estoque Atual"]];
  assert.equal(acharCabecalho(m, regrasVazias()).indice, 0);
});

test("mapearColunas: campo repetido marca a segunda como DUPLICADA; vazio entre colunas e ignorado", () => {
  const { colunas } = mapearColunas(["Produto", "Filial", "", "Estoque Atual", "Estoque"], regrasVazias());
  assert.equal(colunas.length, 4);
  assert.equal(colunas[2].status, "reconhecida"); // "Estoque Atual"
  assert.equal(colunas[3].status, "duplicada");   // "Estoque" aponta para o mesmo campo
});

test("resolverCampo: o sinonimo do cliente vence o de fabrica; 'ignorar' tambem", () => {
  const regras = regrasVazias();
  regras.colunas.set("estoque", { campo: "idade_dias", ignorar: false });
  regras.colunas.set("dde", { campo: null, ignorar: true });
  assert.equal(resolverCampo("estoque", regras).campo, "idade_dias");
  assert.equal(resolverCampo("dde", regras).ignorar, true);
  assert.equal(resolverCampo("estoque atual", regras).origem, "fabrica");
  assert.equal(resolverCampo("coluna misteriosa", regras).campo, null);
});

// ── Leitura do arquivo (checklist de aceite) ────────────────────────────────────

const DADOS = [
  dado("474835 - QUEIJO COALHO VALE MILK BARRA KG", LOJA_A, 12.5, 30, 18.9, 700.123, 236.25),
  dado("500001 - IOG MORANGO 170G", LOJA_A, -3, 0, 2.1, 0, -6.3),
  dado("500001 - IOG MORANGO 170G", LOJA_B, -0.002, 4, 2.1, 8.4, 7353.27792),
];

test("leitura na ordem original: valores batem e nada e arredondado", async () => {
  const buf = await criarPlanilha(layoutReferencia(DADOS));
  const r = await lerPlanilha({ buffer: buf, nomeArquivo: "Estoque VM 22-09.xlsx", regras: regrasVazias(), hoje: HOJE });
  assert.equal(r.linhaCabecalho, 3);
  assert.equal(r.titulo, "ESTOQUE 22-09");
  assert.equal(r.obrigatoriosAusentes.length, 0);
  assert.equal(r.validas.length, 3);
  assert.equal(r.descartadas.length, 0);
  assert.equal(r.validas[0].linha, 4); // 1-indexada como no Excel
  assert.equal(r.validas[0].produtoCodigo, "474835");
  assert.equal(r.validas[0].lojaCodigo, "101");
  assert.equal(r.validas[1].estoqueAtual, -3);       // negativo preservado
  assert.equal(r.validas[2].estoqueAtual, -0.002);   // residuo de granel preservado
  assert.equal(r.validas[2].valorEstoqueReais, 7353.27792);
  const soma = r.validas.reduce((s, l) => s + l.valorEstoqueReais, 0);
  assert.ok(Math.abs(soma - (236.25 - 6.3 + 7353.27792)) < 1e-9);
});

test("colunas em outra ordem leem exatamente os mesmos valores (leitura por nome, nao por posicao)", async () => {
  const ordem = [8, 4, 2, 0, 10, 3, 9, 6, 1, 5, 7];
  const embaralha = (l) => ordem.map((i) => l[i]);
  const original = await lerPlanilha({
    buffer: await criarPlanilha(layoutReferencia(DADOS)), nomeArquivo: "a.xlsx", regras: regrasVazias(), hoje: HOJE,
  });
  const trocada = await lerPlanilha({
    buffer: await criarPlanilha(layoutReferencia(DADOS.map(embaralha), { cabecalho: embaralha(CABECALHO) })),
    nomeArquivo: "a.xlsx", regras: regrasVazias(), hoje: HOJE,
  });
  assert.deepEqual(trocada.validas, original.validas);
});

test("informativo vazio vira null (nao zero); obrigatorio vazio vira 0", async () => {
  const linha = ["", "", "9 - X PRODUTO", "1 - LOJA TESTE", null, null, null, null, null, null, null];
  const r = await lerPlanilha({ buffer: await criarPlanilha(layoutReferencia([linha])), nomeArquivo: "a.xlsx", regras: regrasVazias(), hoje: HOJE });
  const l = r.validas[0];
  assert.equal(l.estoqueAtual, 0);
  assert.equal(l.vendaReais, 0);
  assert.equal(l.custoMedioUnitario, null);
  assert.equal(l.ddeInformado, null);
  assert.equal(l.idadeDias, null);
});

test("linhas sem produto/loja/em branco sao DESCARTADAS com motivo e a conservacao fecha", async () => {
  const dados = [
    ...DADOS,
    [],                                                           // em branco
    dado(null, LOJA_A, 1, 1, 1, 1, 1),                            // sem produto
    dado("500002 - OUTRO", null, 1, 1, 1, 1, 1),                  // sem loja
    ["", "", "", "", "", "", "", "", "TOTAL", 99, ""],            // rodape sem produto nem loja
  ];
  const r = await lerPlanilha({ buffer: await criarPlanilha(layoutReferencia(dados)), nomeArquivo: "a.xlsx", regras: regrasVazias(), hoje: HOJE });
  assert.equal(r.validas.length, 3);
  assert.equal(r.descartadas.length, 4);
  assert.equal(r.validas.length + r.descartadas.length, r.totalLinhasDado);
  const motivos = r.descartadas.map((d) => d.motivo);
  assert.ok(motivos.includes("linha em branco"));
  assert.ok(motivos.includes("sem produto"));
  assert.ok(motivos.includes("sem loja"));
  assert.ok(motivos.includes("sem produto e sem loja"));
  assert.ok(r.descartadas.every((d) => Number.isInteger(d.linha) && d.linha >= 4));
});

test("valor numerico invalido descarta a linha com motivo explicito (nunca corrige em silencio)", async () => {
  const ruim = dado("500003 - X", LOJA_A, "abc", 1, 1, 1, 1);
  const r = await lerPlanilha({ buffer: await criarPlanilha(layoutReferencia([ruim, ...DADOS])), nomeArquivo: "a.xlsx", regras: regrasVazias(), hoje: HOJE });
  assert.equal(r.descartadas.length, 1);
  assert.match(r.descartadas[0].motivo, /valor invalido em "Estoque atual"/);
  assert.equal(r.validas.length + r.descartadas.length, r.totalLinhasDado);
});

test("coluna extra desconhecida aparece como NOVA e vira campo personalizado em extras apos confirmada", async () => {
  const cab = [...CABECALHO, "Estoque em Trânsito"];
  const dados = DADOS.map((l, i) => [...l, 10 * (i + 1)]);
  const buf = await criarPlanilha(layoutReferencia(dados, { cabecalho: cab }));

  const sem = await lerPlanilha({ buffer: buf, nomeArquivo: "a.xlsx", regras: regrasVazias(), hoje: HOJE });
  const nova = sem.colunas.find((c) => c.status === "nova");
  assert.equal(nova.cabecalhoOriginal, "Estoque em Trânsito");
  assert.deepEqual(sem.validas[0].extras, {});

  const regras = regrasVazias();
  regras.campos.set("estoque_em_transito", { chave: "estoque_em_transito", rotulo: "Estoque em trânsito", tipoValor: "numero" });
  regras.colunas.set(normalizarCabecalho("Estoque em Trânsito"), { campo: "estoque_em_transito", ignorar: false });
  const com = await lerPlanilha({ buffer: buf, nomeArquivo: "a.xlsx", regras, hoje: HOJE });
  assert.equal(com.colunas.find((c) => c.cabecalhoOriginal === "Estoque em Trânsito").status, "reconhecida");
  assert.deepEqual(com.validas.map((l) => l.extras.estoque_em_transito), [10, 20, 30]);
});

test("sem a coluna de produto: bloqueia com a lista do que falta, sem derrubar o processo", async () => {
  const cab = CABECALHO.filter((c) => c !== "Produto");
  const dados = DADOS.map((l) => l.filter((_, i) => i !== 2));
  const r = await lerPlanilha({ buffer: await criarPlanilha(layoutReferencia(dados, { cabecalho: cab })), nomeArquivo: "a.xlsx", regras: regrasVazias(), hoje: HOJE });
  assert.equal(r.leituraBloqueada, true);
  assert.deepEqual(r.obrigatoriosAusentes.map((o) => o.chave), ["produto"]);
  assert.equal(r.validas.length, 0);
});

test("cabecalho irreconhecivel: nao ha cabecalho identificavel, mas a linha mais cheia vira candidata", async () => {
  const m = [["Relatorio"], [], ["Cod Prod", "Cod Loja", "Saldo", "Vendas"], ["1", "2", "3", "4"]];
  const r = await lerPlanilha({ buffer: await criarPlanilha(m), nomeArquivo: "a.xlsx", regras: regrasVazias(), hoje: HOJE });
  assert.equal(r.cabecalhoIncerto, true);
  assert.equal(r.linhaCabecalho, 3);
  assert.equal(r.leituraBloqueada, true);
  assert.ok(r.colunas.every((c) => c.status === "nova"));
});

test("arquivo invalido devolve erro 400 amigavel", async () => {
  await assert.rejects(lerPlanilha({ buffer: Buffer.from("isto nao e um xlsx"), nomeArquivo: "a.xlsx", regras: regrasVazias(), hoje: HOJE }),
    (e) => e.status === 400);
});

// ── Data do retrato ─────────────────────────────────────────────────────────────

test("inferirData: titulo, depois nome do arquivo", () => {
  assert.equal(inferirData({ titulo: "ESTOQUE 22-09", nomeArquivo: "x.xlsx", hoje: HOJE }).data, "2026-09-22");
  const arq = inferirData({ titulo: null, nomeArquivo: "Estoque km cacau 22-09.xlsx", hoje: HOJE });
  assert.equal(arq.data, "2026-09-22");
  assert.equal(arq.fonte, "arquivo");
  assert.equal(inferirData({ titulo: null, nomeArquivo: "Estoque VM 31-08.xlsx", hoje: HOJE }).data, "2026-08-31");
  assert.equal(inferirData({ titulo: "sem data", nomeArquivo: "sem_data.xlsx", hoje: HOJE }), null);
});

test("inferirData: aceita DD/MM, DD.MM e ano de 2 ou 4 digitos; ano explicito nao e 'inferido'", () => {
  assert.equal(inferirData({ titulo: "Estoque 01/10", nomeArquivo: "", hoje: HOJE }).data, "2026-10-01");
  assert.equal(inferirData({ titulo: "Estoque 05.10.24", nomeArquivo: "", hoje: HOJE }).data, "2024-10-05");
  const com = inferirData({ titulo: "Estoque 05-10-2025", nomeArquivo: "", hoje: HOJE });
  assert.equal(com.data, "2025-10-05");
  assert.equal(com.anoInferido, false);
  assert.equal(inferirData({ titulo: "2026-09-22", nomeArquivo: "", hoje: HOJE }).data, "2026-09-22");
});

test("inferirData: 31-12 lido em janeiro e dezembro do ANO PASSADO (nunca do que vem)", () => {
  const janeiro = new Date(2026, 0, 5);
  assert.equal(inferirData({ titulo: "ESTOQUE 31-12", nomeArquivo: "", hoje: janeiro }).data, "2025-12-31");
  assert.equal(inferirData({ titulo: "ESTOQUE 02-01", nomeArquivo: "", hoje: janeiro }).data, "2026-01-02");
});

test("extrairDataDoTexto ignora datas impossiveis", () => {
  assert.equal(extrairDataDoTexto("lote 45-13"), null);
  assert.equal(extrairDataDoTexto("31-02"), null);
});
