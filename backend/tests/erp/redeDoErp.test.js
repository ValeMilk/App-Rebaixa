const test = require("node:test");
const assert = require("node:assert/strict");
const { ehRedeDoErp, filtroRedeErp, montarLinhaCarteira } = require("../../src/services/erpService");

// A ultima compra por rede so e consultada no ERP para redes do Lacteus (codigo numerico);
// rede criada no InfoVale ("IV1") nao existe la. Regressao: a regra chegou a barrar TODAS as redes.
test("rede do Lacteus consulta o ERP; rede do InfoVale nao", () => {
  for (const c of ["21", 125, "0050", "S77"]) assert.equal(ehRedeDoErp(c), true, `rede ${c}`);
  for (const c of ["IV1", "IV12", "", null, undefined, "21a"]) assert.equal(ehRedeDoErp(c), false, `rede ${c}`);
});

test("subclasse como rede: filtra o ERP pela subclasse; rede normal, pelo segmento", () => {
  assert.deepEqual(filtroRedeErp("21"), { coluna: "A00_ID_A16", valor: 21 });
  assert.deepEqual(filtroRedeErp("S77"), { coluna: "A00_ID_A68_SUBCLASSE", valor: 77 });
});

test("carteira: cliente sem rede mas com subclasse entra com a subclasse como rede", () => {
  const base = { clienteCodigo: 1, clienteNome: "SUPER CALEBE - LJ 01", vendedorCodigo: 5, supervisorCodigo: 9 };
  const comRede = montarLinhaCarteira({ ...base, codigoRede: 21, redeSubrede: "FRANGOLANDIA ", subrede: "FRANGO ", subclasseId: 3 });
  assert.equal(comRede.codigoRede, "21");
  assert.equal(comRede.redeSubrede, "FRANGOLANDIA ");
  assert.equal(comRede.subrede, "FRANGO");
  const semRede = montarLinhaCarteira({ ...base, codigoRede: null, redeSubrede: null, subrede: "SUPER CALEBE ", subclasseId: 77 });
  assert.equal(semRede.codigoRede, "S77");
  assert.equal(semRede.redeSubrede, "SUPER CALEBE");
  assert.equal(semRede.subrede, "SUPER CALEBE");
  const semNada = montarLinhaCarteira({ ...base, codigoRede: null, subrede: null, subclasseId: null });
  assert.equal(semNada.codigoRede, null);
  assert.equal(semNada.subrede, null);
});
