const test = require("node:test");
const assert = require("node:assert/strict");

// O controller carrega modelos do Mongoose (sem conectar) e os servicos; aqui so as funcoes puras.
process.env.JWT_SECRET = process.env.JWT_SECRET || "teste";
const { statusInicial, ocultarMargens, CAMPOS_MARGEM } = require("../../src/controllers/solicitacaoController");

test("status inicial v2.0: vendedor sempre passa pelo supervisor; supervisor encerra quando nao exige diretoria", () => {
  assert.equal(statusInicial("vendedor", false), "pendente_supervisor");
  assert.equal(statusInicial("vendedor", true), "pendente_supervisor");
  assert.equal(statusInicial("supervisor", false), "aprovado_final");
  assert.equal(statusInicial("supervisor", true), "aprovado_supervisor");
  assert.equal(statusInicial("diretoria", true), "aprovado_final");
  assert.equal(statusInicial("admin", true), "aprovado_final");
});

test("ocultarMargens tira sellout, margens e valor recebido dos itens e o motivo da escalada", () => {
  const sol = {
    status: "pendente_supervisor",
    itens: [{ produto: "X", precoOferta: 3.5, precoPDV: 4, sellout: 0.36, margemPDV: 27.5, margemOferta: 27.4, valorRecebido: 2.39, precoLiquido: 2.755, precoOfertaTravado: true, selloutOrigem: "automatico" }],
    aprovacao: { exigeDiretoria: true, motivoEscalada: "Valor recebido R$ 2,39 abaixo..." },
    ajustes: [{ antes: { precoOferta: 3.5, sellout: 0.36 }, depois: { precoOferta: 3.4, sellout: 0.5 } }],
  };
  const r = ocultarMargens(sol);
  for (const c of CAMPOS_MARGEM) assert.equal(c in r.itens[0], false, `campo ${c} deveria sumir`);
  assert.equal(r.itens[0].precoOferta, 3.5);
  assert.equal(r.itens[0].precoLiquido, 2.755, "preco liquido continua visivel ao vendedor");
  assert.equal(r.itens[0].precoOfertaTravado, true);
  assert.deepEqual(r.aprovacao, { exigeDiretoria: true });
  assert.equal("sellout" in r.ajustes[0].antes, false);
  assert.equal(r.ajustes[0].depois.precoOferta, 3.4);
  assert.equal(r.margensOcultas, true);
  // o original nao e mutado
  assert.equal(sol.itens[0].sellout, 0.36);
});
