/**
 * Servico do ERP Esigma — segundo SQL Server, separado do Lacteus.
 * Implementa busca da carteira de clientes e do catalogo de produtos.
 */

const CarteiraEsigma = require("../models/CarteiraEsigma");
const ProdutoEsigma = require("../models/ProdutoEsigma");
const { query, esigmaConfigurado } = require("./esigmaDbService");

// ---------------------------------------------------------------------------
// Carteira de clientes
// ---------------------------------------------------------------------------

const SQL_CARTEIRA_ESIGMA = `
SELECT
    c.CodCliente,
    c.ClienteFantasia,
    c.CodRota,
    sf.Funcionario AS Supervisor,
    fv.Funcionario AS Vendedor
FROM Cliente c

LEFT JOIN Rota r
    ON r.CodRota = c.CodRota

LEFT JOIN AreaVenda av
    ON av.CodAreaVenda = r.CodAreaVenda

LEFT JOIN AreaSupervisao asv
    ON asv.CodAreaSupervisao = av.CodAreaSupervisao

LEFT JOIN Funcionario sf
    ON sf.CodFuncionario = asv.CodSupervisor

LEFT JOIN Funcionario fv
    ON fv.CodFuncionario = av.CodVendedor

WHERE
    c.ECliente = 1
    AND c.Ativo = 1
    AND c.AtivoAuto = 1
    and c.CodRota not in (382,385,386)
    AND c.UnidGestora IN (
        71,
        1071,
        1082,
        72,
        172,
        79,
        1083,
        73,
        74,
        75
    )

    AND COALESCE(
        NULLIF(LTRIM(RTRIM(c.CGC)), ''),
        NULLIF(LTRIM(RTRIM(c.CPF)), '')
    ) IS NOT NULL

    AND r.CodAreaVenda IN (
        7,
        8,
        9,
        16,
        17,
        18,
        19
    )

ORDER BY
    c.ClienteFantasia;
`;

async function buscarCarteiraDoEsigma() {
  if (!esigmaConfigurado()) return [];
  return query(SQL_CARTEIRA_ESIGMA);
}

async function sincronizarCarteiraEsigma() {
  if (!esigmaConfigurado()) {
    return { atualizados: 0, total: 0, observacao: "Esigma nao configurado — preencha as variaveis ERP_*2 no .env" };
  }

  const linhas = await buscarCarteiraDoEsigma();
  if (!linhas.length) {
    return { atualizados: 0, total: 0, observacao: "Nenhum registro retornado pelo Esigma" };
  }

  // Limpar coleção antes de sincronizar para evitar duplicatas e conflitos de índice
  await CarteiraEsigma.deleteMany({});

  const docs = linhas.map((l) => ({
    clienteCodigo:    String(l.CodCliente),
    clienteNome:      l.ClienteFantasia || "",
    codRota:          l.CodRota != null ? String(l.CodRota) : null,
    supervisorCodigo: null, // CodFuncionario ainda nao vem na query — adicionar quando disponivel
    supervisorNome:   l.Supervisor || "",
    vendedorCodigo:   null,
    vendedorNome:     l.Vendedor || "",
    sincronizadoEm:   new Date(),
  }));

  const r = await CarteiraEsigma.insertMany(docs);
  return {
    atualizados: r.length,
    total: linhas.length,
  };
}

// ---------------------------------------------------------------------------
// Catalogo de produtos
// ---------------------------------------------------------------------------

const SQL_PRODUTOS_ESIGMA = `
SELECT
    m.CodMaterial,
    m.Material,
    m.Especificacao AS Categoria,
    m.Especificacao AS Subcategoria
FROM dbo.Material m

LEFT JOIN dbo.ViewMaterialPreco v
    ON v.CodMaterial = m.CodMaterial

LEFT JOIN dbo.TabelaPreco t
    ON t.CodTabelaPreco = v.CodTabelaPreco

WHERE m.CodMaterial IN (
    410, 411, 412, 413, 414, 416,
    420, 421, 422, 423, 424, 426,
    590, 591, 50801, 50821
)
AND m.Ativo = 1
AND t.Ativa = 1
AND t.Descricao = 'TABELA 70 (REDE)';
`;

async function buscarProdutosDoEsigma() {
  if (!esigmaConfigurado()) return [];
  return query(SQL_PRODUTOS_ESIGMA);
}

async function sincronizarProdutosEsigma() {
  if (!esigmaConfigurado()) {
    return { atualizados: 0, total: 0, observacao: "Esigma nao configurado — preencha as variaveis ERP_*2 no .env" };
  }

  const linhas = await buscarProdutosDoEsigma();
  if (!linhas.length) {
    return { atualizados: 0, total: 0, observacao: "Nenhum produto retornado pelo Esigma" };
  }

  const ops = linhas.map((l) => ({
    updateOne: {
      filter: { codigo: String(l.CodMaterial) },
      update: {
        $set: {
          codigo:         String(l.CodMaterial),
          descricao:      l.Material || "",
          categoria:      l.Categoria || null,
          subcategoria:   l.Subcategoria || null,
          ativo:          true,
          sincronizadoEm: new Date(),
        },
      },
      upsert: true,
    },
  }));

  let atualizados = 0;
  for (let i = 0; i < ops.length; i += 500) {
    const r = await ProdutoEsigma.bulkWrite(ops.slice(i, i + 500), { ordered: false });
    atualizados += (r.modifiedCount || 0) + (r.upsertedCount || 0);
  }

  return { atualizados, total: linhas.length };
}

module.exports = {
  buscarCarteiraDoEsigma,
  sincronizarCarteiraEsigma,
  buscarProdutosDoEsigma,
  sincronizarProdutosEsigma,
};
