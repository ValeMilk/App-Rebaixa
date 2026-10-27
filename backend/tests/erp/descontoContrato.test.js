const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

// Stub do erpDbService ANTES de carregar o erpService: pool falso que grava os parametros
// recebidos e devolve o recordset configurado em cada teste. Nenhum teste toca o ERP.
const fake = { inputs: [], sqls: [], recordset: [], falhar: false };
const fakePool = {
  request() {
    const req = {
      input(nome, _tipo, valor) { fake.inputs.push([nome, valor]); return req; },
      async query(sql) {
        fake.sqls.push(sql);
        if (fake.falhar) throw new Error("ERP fora do ar");
        return { recordset: fake.recordset };
      },
    };
    return req;
  },
};
const dbPath = require.resolve(path.join("..", "..", "src", "services", "erpDbService.js"));
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { erpConfigurado: () => true, getPool: async () => fakePool, query: async () => [] },
};
const { buscarDescontosContrato, anexarDescontoContrato } = require("../../src/services/erpService");

function reset() { fake.inputs = []; fake.sqls = []; fake.recordset = []; fake.falhar = false; }

test("buscarDescontosContrato: pares vazios nao consultam o ERP", async () => {
  reset();
  const m = await buscarDescontosContrato([]);
  assert.equal(m.size, 0);
  assert.equal(fake.sqls.length, 0);
});

test("buscarDescontosContrato: deduplica clientes/produtos, apara chaves e fica com o maior percentual", async () => {
  reset();
  fake.recordset = [
    { clienteCodigo: 10, produtoCodigo: "121035   ", percentual: 5, tipo: "Contrato Categoria" },
    { clienteCodigo: 10, produtoCodigo: "121035   ", percentual: 8, tipo: "Contrato Produto" }, // E02_LIVRE repetido
    { clienteCodigo: 10, produtoCodigo: "999", percentual: 0, tipo: null },
  ];
  const m = await buscarDescontosContrato([
    { clienteCodigo: "10", produtoCodigo: "121035" },
    { clienteCodigo: 10, produtoCodigo: "121035 " }, // repetido
    { clienteCodigo: "10", produtoCodigo: "999" },
  ]);
  assert.equal(fake.sqls.length, 1, "uma consulta so");
  // 1 cliente e 2 produtos distintos viram @c0, @p0, @p1
  assert.deepEqual(fake.inputs, [["c0", "10"], ["p0", "121035"], ["p1", "999"]]);
  assert.deepEqual(m.get("10|121035"), { percentual: 8, tipo: "Contrato Produto" });
  assert.deepEqual(m.get("10|999"), { percentual: 0, tipo: null });
  // regra de prioridade e contrato vigente estao no SQL
  const sql = fake.sqls[0];
  for (const trecho of ["A24_ID_E02", "A24_ID_E01", "A16_REM_DESC_VALOR", "A23_ATIVO", "A23_DT_FIM", "ROW_NUMBER()", "ORDER BY prioridade, origem, perc DESC"]) {
    assert.ok(sql.includes(trecho), `SQL deve conter ${trecho}`);
  }
});

test("buscarDescontosContrato: mais de 150 pares sao fatiados em varias consultas", async () => {
  reset();
  const pares = Array.from({ length: 301 }, (_, i) => ({ clienteCodigo: String(i), produtoCodigo: "1" }));
  await buscarDescontosContrato(pares);
  assert.equal(fake.sqls.length, 3);
});

test("anexarDescontoContrato: preco com desconto = ultima compra x (1 - pct/100); tipo so quando pct > 0", async () => {
  reset();
  fake.recordset = [
    { clienteCodigo: 10, produtoCodigo: "A", percentual: 10, tipo: "Contrato Produto" },
    { clienteCodigo: 10, produtoCodigo: "B", percentual: 0, tipo: null },
    { clienteCodigo: 11, produtoCodigo: "C", percentual: 2.5, tipo: "Rede" },
  ];
  const linhas = [
    { clienteCodigo: 10, produtoCodigo: "A  ", precoUltimaCompra: 10 },
    { clienteCodigo: "10", produtoCodigo: "B", precoUltimaCompra: 7.33 },
    { clienteCodigo: 11, produtoCodigo: "C", precoUltimaCompra: 4 },
    { clienteCodigo: 12, produtoCodigo: "D", precoUltimaCompra: 1 }, // nao veio no recordset
    null,                                                             // ultima compra nao encontrada
  ];
  const [a, b, c, d, n] = await anexarDescontoContrato(linhas);
  assert.equal(a.precoUltimaCompra, 10, "campos originais preservados");
  assert.deepEqual([a.descontoContratoPercentual, a.descontoContratoTipo, a.precoUltimaCompraComDesconto], [10, "Contrato Produto", 9]);
  assert.deepEqual([b.descontoContratoPercentual, b.descontoContratoTipo, b.precoUltimaCompraComDesconto], [0, null, 7.33]);
  assert.deepEqual([c.descontoContratoPercentual, c.descontoContratoTipo, c.precoUltimaCompraComDesconto], [2.5, "Rede", 3.9]);
  assert.deepEqual([d.descontoContratoPercentual, d.descontoContratoTipo, d.precoUltimaCompraComDesconto], [null, null, null]);
  assert.equal(n, null);
});

test("anexarDescontoContrato: falha no ERP nao derruba a ultima compra", async () => {
  reset();
  fake.falhar = true;
  const [r] = await anexarDescontoContrato([{ clienteCodigo: 1, produtoCodigo: "X", precoUltimaCompra: 5 }]);
  assert.equal(r.precoUltimaCompra, 5);
  assert.equal(r.descontoContratoPercentual, null);
  assert.equal(r.precoUltimaCompraComDesconto, null);
});
