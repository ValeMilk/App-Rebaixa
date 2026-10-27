const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calcularPrecoLiquido,
  escolherPrecoOferta,
  calcularSelloutAutomatico,
  calcularSelloutSugeridoPDV,
  calcularMargens,
  calcularValorRecebido,
  avaliarEscalada,
  escolherPiso,
  recalcularItem,
} = require("../../src/services/precificacaoService");

test("preco liquido = ultima compra x (1 - desconto): exemplo da spec (9,40 e 6% -> 8,84)", () => {
  assert.equal(calcularPrecoLiquido(9.4, 6), 8.836);
  assert.equal(Math.round(calcularPrecoLiquido(9.4, 6) * 100) / 100, 8.84);
  assert.equal(calcularPrecoLiquido(2.9, 0), 2.9);
  assert.equal(calcularPrecoLiquido(2.9, null), 2.9);
  assert.equal(calcularPrecoLiquido(null, 5), null);
  assert.equal(calcularPrecoLiquido(0, 5), null);
});

test("preco da oferta: rede trava (P#3 na rebaixa, P#2 na oferta); item so preenche; nada = livre", () => {
  const rede = { p1: 2.5, p2: 2.3, p3: 2.1 };
  const item = { precoP2: 2.7, precoP3: 2.4 };
  assert.deepEqual(escolherPrecoOferta({ tipo: "rebaixa", rede, item }), { valor: 2.1, origem: "rede", travado: true, rotulo: "Preço da rede (P#3)" });
  assert.deepEqual(escolherPrecoOferta({ tipo: "oferta_interna", rede, item }), { valor: 2.3, origem: "rede", travado: true, rotulo: "Preço da rede (P#2)" });
  // rede sem P#3 cadastrado -> item, editavel
  assert.deepEqual(escolherPrecoOferta({ tipo: "rebaixa", rede: { p1: 2.5, p2: 0, p3: 0 }, item }), { valor: 2.4, origem: "item", travado: false, rotulo: "Preço do item (P#3)" });
  assert.deepEqual(escolherPrecoOferta({ tipo: "rebaixa", rede: null, item: { precoP2: 2.7, precoP3: 0 } }), { valor: null, origem: null, travado: false, rotulo: null });
});

test("sellout automatico = custo da rede - oferta x (1 - margem); nunca negativo", () => {
  // custo medio 2,40, oferta 2,10, margem 20% -> 2,40 - 1,68 = 0,72
  assert.equal(calcularSelloutAutomatico({ precoOferta: 2.1, margemRede: 20, custoRede: 2.4 }), 0.72);
  // oferta alta o bastante para a rede manter a margem sem sellout
  assert.equal(calcularSelloutAutomatico({ precoOferta: 4, margemRede: 20, custoRede: 2.4 }), 0);
  assert.equal(calcularSelloutAutomatico({ precoOferta: 2.1, margemRede: null, custoRede: 2.4 }), null);
  assert.equal(calcularSelloutAutomatico({ precoOferta: 2.1, margemRede: 20, custoRede: null }), null);
});

test("sellout sugerido pela margem do PDV (regra antiga) e margens do formulario", () => {
  // UC 2,90, PDV 4,00 (margem 27,5%), oferta 3,50 -> sellout = 2,90 - 3,50 x 0,725 = 0,3625 -> 0,36
  assert.equal(calcularSelloutSugeridoPDV({ precoUC: 2.9, precoPDV: 4, precoOferta: 3.5 }), 0.36);
  assert.equal(calcularSelloutSugeridoPDV({ precoUC: 2.9, precoPDV: 4, precoOferta: 4.5 }), null);
  assert.deepEqual(calcularMargens({ precoPDV: 4, precoOferta: 3.5, sellout: 0.36, precoUC: 2.9 }), { margemPDV: 27.5, margemOferta: 27.4 });
  assert.deepEqual(calcularMargens({ precoPDV: 4, precoOferta: 3.5, sellout: 0, precoUC: null }), { margemPDV: null, margemOferta: null });
});

test("valor recebido = preco liquido - sellout", () => {
  assert.equal(calcularValorRecebido({ precoLiquido: 8.836, sellout: 0.5 }), 8.336);
  assert.equal(calcularValorRecebido({ precoLiquido: 8.836, sellout: null }), 8.836);
  assert.equal(calcularValorRecebido({ precoLiquido: null, sellout: 1 }), null);
});

test("escalada: preco da rede dispensa a diretoria; abaixo do piso sobe; sem dados sobe por seguranca", () => {
  assert.equal(avaliarEscalada({ precoOfertaOrigem: "rede", valorRecebido: 1, precoPiso: 2 }).exigeDiretoria, false);
  assert.equal(avaliarEscalada({ precoOfertaOrigem: "vendedor", valorRecebido: 2.5, precoPiso: 2 }).exigeDiretoria, false);
  assert.equal(avaliarEscalada({ precoOfertaOrigem: "vendedor", valorRecebido: 2, precoPiso: 2 }).exigeDiretoria, false);
  const abaixo = avaliarEscalada({ precoOfertaOrigem: "vendedor", valorRecebido: 1.9, precoPiso: 2, pisoTipo: "minimo" });
  assert.equal(abaixo.exigeDiretoria, true);
  assert.match(abaixo.motivo, /abaixo do preço mínimo/);
  assert.equal(avaliarEscalada({ precoOfertaOrigem: "item", valorRecebido: null, precoPiso: 2 }).exigeDiretoria, true);
  assert.equal(avaliarEscalada({ precoOfertaOrigem: "item", valorRecebido: 2.5, precoPiso: null }).exigeDiretoria, true);
});

test("piso: minimo do item por padrao; P#3 da rede (ou do item) quando a rede configura assim", () => {
  const item = { precoMinimo: 2, precoP3: 2.4 };
  assert.deepEqual(escolherPiso({ pisoTipo: "minimo", item, rede: { p3: 2.1 } }), { tipo: "minimo", valor: 2 });
  assert.deepEqual(escolherPiso({ pisoTipo: "p3", item, rede: { p3: 2.1 } }), { tipo: "p3", valor: 2.1 });
  assert.deepEqual(escolherPiso({ pisoTipo: "p3", item, rede: null }), { tipo: "p3", valor: 2.4 });
  assert.deepEqual(escolherPiso({ pisoTipo: "minimo", item: { precoMinimo: 0 }, rede: null }), { tipo: "minimo", valor: null });
});

test("recalcularItem preenche preco liquido, margens e valor recebido a partir do formulario", () => {
  const it = recalcularItem({ precoUltimaCompra: 2.9, descontoContratoPercentual: 5, precoPDV: 4, precoOferta: 3.5, sellout: 0.36 });
  assert.equal(it.precoLiquido, 2.755);
  assert.equal(it.margemPDV, 27.5);
  assert.equal(it.margemOferta, 27.4);
  assert.equal(it.valorRecebido, 2.395);
  // sem ultima compra: nada derivado
  const vazio = recalcularItem({ precoPDV: 4, precoOferta: 3.5, sellout: 0 });
  assert.equal(vazio.precoLiquido, null);
  assert.equal(vazio.valorRecebido, null);
  assert.equal(vazio.margemPDV, null);
});
