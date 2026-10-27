const test = require("node:test");
const assert = require("node:assert/strict");
const { instalarModelosFalsos } = require("./helpers");

// Modelos falsos ANTES de carregar o service
const modelos = instalarModelosFalsos({
  configs: [
    {
      codigoRede: "26", margemOperacional: 20, piso: "p3",
      margensPorLoja: [{ clienteCodigo: "1001", margem: 25 }, { clienteCodigo: "1003", margem: 0 }],
      margensPorCategoria: [{ categoria: "QUEIJOS", margem: 30 }],
    },
    { codigoRede: "30", margemOperacional: null, piso: "minimo", margensPorLoja: [], margensPorCategoria: [{ categoria: "IOGURTES", margem: 12.5 }] },
  ],
  custos: [
    { codigoRede: "26", versao: 2, ativa: false, linhas: [{ clienteCodigo: "1001", produtoCodigo: "474835", custoMedio: 99 }] },
    { codigoRede: "26", versao: 3, ativa: true, linhas: [{ clienteCodigo: "1001", produtoCodigo: "474835", produtoCodigoErp: "000474835", custoMedio: 18.9 }] },
  ],
});
const svc = require("../../src/services/margensRedeService");

test("margem da loja vence categoria e rede; custo medio vem da versao ATIVA; piso da config", async () => {
  const r = await svc.obterMargemECusto({ codigoRede: "26", clienteCodigo: "1001", produtoCodigo: "474835", categoria: "QUEIJOS" });
  assert.deepEqual(r, { margem: 25, origemMargem: "loja", custoMedio: 18.9, custoMedioVersao: 3, piso: "p3" });
});

test("margem 0 na loja e um valor valido (nao cai para a categoria)", async () => {
  const r = await svc.obterMargemECusto({ codigoRede: "26", clienteCodigo: "1003", produtoCodigo: "X", categoria: "QUEIJOS" });
  assert.equal(r.margem, 0);
  assert.equal(r.origemMargem, "loja");
  assert.equal(r.custoMedio, null);
  assert.equal(r.custoMedioVersao, null);
});

test("sem margem de loja: categoria (comparacao sem caixa/espacos) e depois a margem operacional", async () => {
  const cat = await svc.obterMargemECusto({ codigoRede: "26", clienteCodigo: "1002", produtoCodigo: "474835", categoria: " queijos " });
  assert.equal(cat.margem, 30);
  assert.equal(cat.origemMargem, "categoria");
  assert.equal(cat.custoMedio, null, "loja 1002 nao tem custo na versao ativa");

  const rede = await svc.obterMargemECusto({ codigoRede: "26", clienteCodigo: "1002", produtoCodigo: "474835", categoria: "IOGURTES" });
  assert.equal(rede.margem, 20);
  assert.equal(rede.origemMargem, "rede");
});

test("custo medio tambem e encontrado pelo codigo ERP do produto", async () => {
  const r = await svc.obterMargemECusto({ codigoRede: "26", clienteCodigo: "1001", produtoCodigo: "000474835", categoria: null });
  assert.equal(r.custoMedio, 18.9);
  assert.equal(r.custoMedioVersao, 3);
});

test("rede sem margem operacional e categoria sem cadastro: margem null; rede sem config: tudo null e piso minimo", async () => {
  const semOperacional = await svc.obterMargemECusto({ codigoRede: "30", clienteCodigo: "5", produtoCodigo: "1", categoria: "QUEIJOS" });
  assert.deepEqual(semOperacional, { margem: null, origemMargem: null, custoMedio: null, custoMedioVersao: null, piso: "minimo" });
  const comCategoria = await svc.obterMargemECusto({ codigoRede: "30", clienteCodigo: "5", produtoCodigo: "1", categoria: "IOGURTES" });
  assert.equal(comCategoria.margem, 12.5);

  const semConfig = await svc.obterMargemECusto({ codigoRede: "99", clienteCodigo: "1", produtoCodigo: "1", categoria: "X" });
  assert.deepEqual(semConfig, { margem: null, origemMargem: null, custoMedio: null, custoMedioVersao: null, piso: "minimo" });

  const semRede = await svc.obterMargemECusto({});
  assert.deepEqual(semRede, { margem: null, origemMargem: null, custoMedio: null, custoMedioVersao: null, piso: "minimo" });
});

test("cache por rede: varias chamadas = uma leitura; limparCache forca nova leitura e reflete a mudanca", async () => {
  svc.limparCache();
  const antesCfg = modelos.ConfigRede.contagem.findOne || 0;
  const antesCm = modelos.CustoMedioRede.contagem.findOne || 0;
  await Promise.all([
    svc.obterMargemECusto({ codigoRede: "26", clienteCodigo: "1001", produtoCodigo: "474835" }),
    svc.obterMargemECusto({ codigoRede: "26", clienteCodigo: "1002", produtoCodigo: "474835" }),
    svc.obterMargemECusto({ codigoRede: "26", clienteCodigo: "1003", produtoCodigo: "474835" }),
  ]);
  await svc.obterMargemECusto({ codigoRede: "26", clienteCodigo: "1001", produtoCodigo: "474835" });
  assert.equal(modelos.ConfigRede.contagem.findOne - antesCfg, 1, "ConfigRede lida uma vez");
  assert.equal(modelos.CustoMedioRede.contagem.findOne - antesCm, 1, "CustoMedioRede lida uma vez");

  // muda a config no "banco": sem limpar o cache, o valor antigo continua; depois de limpar, o novo
  modelos.ConfigRede.dados[0].margemOperacional = 22;
  const velho = await svc.obterMargemECusto({ codigoRede: "26", clienteCodigo: "1002", produtoCodigo: "474835", categoria: "IOGURTES" });
  assert.equal(velho.margem, 20);
  svc.limparCache("26");
  const novo = await svc.obterMargemECusto({ codigoRede: "26", clienteCodigo: "1002", produtoCodigo: "474835", categoria: "IOGURTES" });
  assert.equal(novo.margem, 22);
  assert.equal(modelos.ConfigRede.contagem.findOne - antesCfg, 2);
});
