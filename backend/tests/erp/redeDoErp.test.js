const test = require("node:test");
const assert = require("node:assert/strict");
const { ehRedeDoErp } = require("../../src/services/erpService");

// A ultima compra por rede so e consultada no ERP para redes do Lacteus (codigo numerico);
// rede criada no InfoVale ("IV1") nao existe la. Regressao: a regra chegou a barrar TODAS as redes.
test("rede do Lacteus consulta o ERP; rede do InfoVale nao", () => {
  for (const c of ["21", 125, "0050"]) assert.equal(ehRedeDoErp(c), true, `rede ${c}`);
  for (const c of ["IV1", "IV12", "", null, undefined, "21a"]) assert.equal(ehRedeDoErp(c), false, `rede ${c}`);
});
