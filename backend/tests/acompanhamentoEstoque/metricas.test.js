const test = require("node:test");
const assert = require("node:assert/strict");

const {
  STATUS, coberturaDias, classificar, enriquecer, coberturaGlobal, kpis, variacao, comparar, agrupar,
} = require("../../src/services/acompanhamentoEstoque/metricas");

// Linha de analise a partir de (estoque, qtd30d, custo)
const linha = (estoque, qtd, custo = 2, extra = {}) =>
  enriquecer({
    linha: 4, lojaCodigo: "101", lojaNome: "Itapipoca", produtoCodigo: "1", produtoNome: "IOGURTE",
    categoria: "Iogurtes", estoqueAtual: estoque, qtdVendida: qtd, vendaReais: qtd * 3, valorEstoqueReais: estoque * custo,
    custoMedioUnitario: custo, ...extra,
  });

test("coberturaDias: estoque / venda diaria; nulo sem estoque positivo ou sem venda", () => {
  assert.equal(coberturaDias(30, 30), 30);   // 1 un/dia, 30 em estoque
  assert.equal(coberturaDias(15, 60), 7.5);  // 2 un/dia
  assert.equal(coberturaDias(0, 30), null);
  assert.equal(coberturaDias(-3, 30), null);
  assert.equal(coberturaDias(10, 0), null);
  assert.equal(coberturaDias(10, -5), null); // devolucao nao e venda
});

test("classificar: limites exatos de cada faixa (7, 30 e 60 dias)", () => {
  assert.equal(classificar(7, 30), "baixa");       // 7 dias: ainda baixa
  assert.equal(classificar(7.01, 30), "adequada");
  assert.equal(classificar(30, 30), "adequada");   // 30 dias: ainda adequada
  assert.equal(classificar(30.01, 30), "alta");
  assert.equal(classificar(60, 30), "alta");       // 60 dias: ainda alta
  assert.equal(classificar(60.01, 30), "excesso");
});

test("classificar: saldo negativo, ruptura, zerado e sem giro", () => {
  assert.equal(classificar(-0.002, 4), "negativo"); // o residuo NAO vira zero
  assert.equal(classificar(-3, 0), "negativo");
  assert.equal(classificar(0, 5), "ruptura");
  assert.equal(classificar(0, 0), "zerado");
  assert.equal(classificar(10, 0), "sem_giro");
  assert.equal(classificar(10, -2), "sem_giro");
});

test("todo status devolvido por classificar existe na lista de status", () => {
  const chaves = new Set(STATUS.map((s) => s.key));
  for (const [e, q] of [[-1, 1], [0, 1], [0, 0], [5, 0], [1, 30], [20, 30], [45, 30], [90, 30]]) {
    assert.ok(chaves.has(classificar(e, q)), `${e}/${q}`);
  }
});

test("enriquecer: venda diaria derivada de 30 dias, sem arredondar", () => {
  const l = linha(10, 60);
  assert.equal(l.vendaDiaria, 2);
  assert.equal(l.cobertura, 5);
  assert.equal(l.status, "baixa");
  assert.equal(linha(-0.002, 0).estoque, -0.002);
  assert.equal(enriquecer({ estoqueAtual: 1, qtdVendida: 0, valorEstoqueReais: 2, vendaReais: 0 }).categoria, "Sem categoria");
});

test("coberturaGlobal: ruptura entra so no denominador; saldo negativo e linha sem custo ficam de fora", () => {
  const ls = [
    linha(30, 30, 2),   // estoque a custo 60, venda diaria a custo 2
    linha(0, 30, 4),    // ruptura: 0 no numerador, 4 no denominador
    linha(-5, 30, 100), // negativo: ignorada
    linha(10, 30, null, { custoMedioUnitario: null }), // sem custo: ignorada
    linha(50, 0, 3),    // sem venda: nao entra
  ];
  assert.equal(coberturaGlobal(ls), 60 / 6);
  assert.equal(coberturaGlobal([linha(10, 0)]), null);
});

test("kpis: totais, distribuicao por status e estoque parado/excesso", () => {
  const ls = [
    linha(30, 30, 2),         // adequada, valor 60, venda 90
    linha(0, 30, 2),          // ruptura, valor 0
    linha(10, 0, 2),          // sem giro, valor 20
    linha(100, 30, 1),        // excesso, valor 100
    linha(-0.002, 4, 2),      // negativo
  ];
  const k = kpis(ls);
  assert.equal(k.itens, 5);
  assert.equal(k.rupturas, 1);
  assert.equal(k.negativos, 1);
  assert.equal(k.semGiro.itens, 1);
  assert.equal(k.semGiro.valorEstoque, 20);
  assert.equal(k.excesso.itens, 1);
  assert.equal(k.excesso.valorEstoque, 100);
  assert.equal(k.valorEstoque, 60 + 0 + 20 + 100 + -0.004);
  assert.equal(k.vendaReais, 90 + 90 + 0 + 90 + 12);
  assert.equal(k.vendaDiariaReais, k.vendaReais / 30);
  assert.equal(Object.values(k.porStatus).reduce((s, x) => s + x.itens, 0), 5); // cada linha em um status so
  assert.equal(kpis([]).itens, 0);
  assert.equal(kpis([]).cobertura, null);
});

test("variacao e comparar", () => {
  assert.deepEqual(variacao(120, 100), { atual: 120, anterior: 100, delta: 20, pct: 20 });
  assert.deepEqual(variacao(80, 100), { atual: 80, anterior: 100, delta: -20, pct: -20 });
  assert.equal(variacao(5, 0).pct, null);          // sem base de comparacao
  assert.equal(variacao(null, 3).delta, null);
  const a = kpis([linha(30, 30, 2), linha(0, 30, 2)]);
  const b = kpis([linha(30, 30, 2)]);
  const c = comparar(a, b);
  assert.equal(c.rupturas.delta, 1);
  assert.equal(c.valorEstoque.delta, 0);
  assert.equal(comparar(a, null), null);
});

test("agrupar: indicadores por loja", () => {
  const ls = [
    linha(30, 30, 2, { lojaCodigo: "101", lojaNome: "A" }),
    linha(0, 30, 2, { lojaCodigo: "101", lojaNome: "A" }),
    linha(10, 0, 2, { lojaCodigo: "102", lojaNome: "B" }),
  ];
  const g = agrupar(ls, (l) => l.lojaCodigo, (l) => ({ codigo: l.lojaCodigo, nome: l.lojaNome }));
  const a = g.find((x) => x.codigo === "101");
  const b = g.find((x) => x.codigo === "102");
  assert.equal(a.itens, 2);
  assert.equal(a.rupturas, 1);
  assert.equal(b.semGiroItens, 1);
  assert.equal(b.semGiroValor, 20);
});
