const test = require("node:test");
const assert = require("node:assert/strict");

const { montarCompra, SQL_COMPRAS_90D, DIAS_COMPRAS } = require("../../src/services/comprasRecentesService");

test("montarCompra: codigos aparados e como texto, numeros convertidos, chave cliente|produto", () => {
  const em = new Date("2099-01-01T00:00:00.000Z");
  const d = montarCompra({
    clienteCodigo: 10752, produtoCodigo: "187001   ", produto: "IOGURTE ", ultimaCompraEm: "2099-09-20T00:00:00.000Z",
    qtd90d: "48", notas90d: 2, ultimoPreco: "7.3300",
  }, em);
  assert.equal(d.chave, "10752|187001");
  assert.equal(d.clienteCodigo, "10752");
  assert.equal(d.produtoCodigo, "187001");
  assert.equal(d.produto, "IOGURTE");
  assert.equal(d.ultimaCompraEm.toISOString(), "2099-09-20T00:00:00.000Z");
  assert.equal(d.qtd90d, 48);
  assert.equal(d.notas90d, 2);
  assert.equal(d.ultimoPreco, 7.33);
  assert.equal(d.sincronizadoEm, em);
  const vazio = montarCompra({ clienteCodigo: null, produtoCodigo: null });
  assert.equal(vazio.clienteCodigo, "");
  assert.equal(vazio.ultimaCompraEm, null);
  assert.equal(vazio.ultimoPreco, null);
});

test("SQL das compras: 90 dias, mesmos filtros da ultima compra, agregado por loja x E02_LIVRE", () => {
  assert.equal(DIAS_COMPRAS, 90);
  assert.match(SQL_COMPRAS_90D, /DATEADD\(DAY, -90, CAST\(GETDATE\(\) AS DATE\)\)/);
  assert.match(SQL_COMPRAS_90D, /M00_STATUS = 'N'/);
  assert.match(SQL_COMPRAS_90D, /M01_STATUS = 'N'/);
  assert.match(SQL_COMPRAS_90D, /M00_ID_A76 IN \(38, 39, 45, 46, 1134\)/);
  assert.match(SQL_COMPRAS_90D, /E02_TIPO = '04'/);
  assert.match(SQL_COMPRAS_90D, /PARTITION BY m00\.M00_ID_A00, RTRIM\(e02\.E02_LIVRE\)/);
  assert.match(SQL_COMPRAS_90D, /COUNT\(DISTINCT notaId\)/);
  assert.match(SQL_COMPRAS_90D, /WITH \(NOLOCK\)/);
  assert.doesNotMatch(SQL_COMPRAS_90D, /TRY_CONVERT/);
  assert.doesNotMatch(SQL_COMPRAS_90D, /\$\{/);
});
