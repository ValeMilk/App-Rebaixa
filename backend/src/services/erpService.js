/**
 * Servico do ERP — SQL Server acessivel a partir da VPS (72.61.62.17).
 * Implementa busca da carteira de clientes e do catalogo de produtos.
 */

const Carteira = require("../models/Carteira");
const { query, erpConfigurado } = require("./erpDbService");

// ---------------------------------------------------------------------------
// Carteira de clientes
// ---------------------------------------------------------------------------

const SQL_CARTEIRA = `
SELECT
    c.A00_ID          AS clienteCodigo,
    c.A00_FANTASIA    AS clienteNome,
    c.A00_ID_VEND     AS vendedorCodigo,
    v.A00_FANTASIA    AS vendedorNome,
    c.A00_ID_VEND_2   AS supervisorCodigo,
    s.A00_FANTASIA    AS supervisorNome,
    c.A00_ID_A16      AS codigoRede,
    seg.A16_DESC      AS redeSubrede
FROM dbo.A00 c
INNER JOIN dbo.A14 a   ON c.A00_ID_A14 = a.A14_ID
INNER JOIN dbo.A02 b   ON c.A00_ID_A02 = b.A02_ID
LEFT  JOIN dbo.A00 v   ON c.A00_ID_VEND   = v.A00_ID
LEFT  JOIN dbo.A00 s   ON c.A00_ID_VEND_2 = s.A00_ID
LEFT  JOIN dbo.A16 seg ON c.A00_ID_A16    = seg.A16_ID
WHERE
    c.A00_EN_CL = 1
    AND a.A14_DESC NOT IN (
        '999 - L80-INDUSTRIA',
        '700 - L81 - REMESSA VENDA',
        '142 - L82-PARACURU-LICITAÇÃO',
        '147 - L82-PARAIPABA-LICITAÇÃO',
        '149 - L82-SGA-LICITAÇÃO',
        '000 - L82-EXTRA ROTA'
    )
`;

async function buscarCarteiraDoErp() {
  if (!erpConfigurado()) return [];
  return query(SQL_CARTEIRA);
}

async function sincronizarCarteira() {
  if (!erpConfigurado()) {
    return { atualizados: 0, total: 0, observacao: "ERP nao configurado — preencha as variaveis ERP_* no .env" };
  }

  const linhas = await buscarCarteiraDoErp();
  if (!linhas.length) {
    return { atualizados: 0, total: 0, observacao: "Nenhum registro retornado pelo ERP" };
  }

  const ops = linhas.map((l) => ({
    updateOne: {
      filter: {
        clienteCodigo: String(l.clienteCodigo),
        vendedorCodigo: String(l.vendedorCodigo || ""),
      },
      update: {
        $set: {
          clienteCodigo:    String(l.clienteCodigo),
          clienteNome:      l.clienteNome     || "",
          vendedorCodigo:   String(l.vendedorCodigo  || ""),
          vendedorNome:     l.vendedorNome    || "",
          supervisorCodigo: String(l.supervisorCodigo || ""),
          supervisorNome:   l.supervisorNome  || "",
          codigoRede:       l.codigoRede ? String(l.codigoRede) : null,
          redeSubrede:      l.redeSubrede    || null,
          sincronizadoEm:   new Date(),
        },
      },
      upsert: true,
    },
  }));

  const r = await Carteira.bulkWrite(ops, { ordered: false });
  return {
    atualizados: (r.modifiedCount || 0) + (r.upsertedCount || 0),
    total: linhas.length,
  };
}

// ---------------------------------------------------------------------------
// Catalogo de produtos / tabela de precos
// ---------------------------------------------------------------------------

const SQL_PRODUTOS = `
-- Created by GitHub Copilot in SSMS - review carefully before executing
SELECT
    E02_ID            AS codigo,
    E02_LIVRE         AS codigoLivre,
    E02_DESC          AS descricao,
    E29.e29_desc      AS subcategoria,
    E02_PRECO         AS precoTabela,
    E02_PRECO_02      AS precoMinimo,
    E02_PRECO_03      AS precoPromo,
    E02_CUSTO_lIVRE   AS custo,
    E23.E23_DESC      AS categoria
    
FROM dbo.E02 WITH (NOLOCK)
LEFT JOIN dbo.E23 WITH (NOLOCK) ON E02.E02_ID_E23 = E23.E23_ID
LEFT JOIN dbo.E29 WITH (NOLOCK) ON E02.E02_ID_E29 = E29.E29_ID
WHERE
    E02_TIPO = '04'
    AND E02_ID <> '58'
    AND (
        E02_DESC IS NULL
        OR (
            E02_DESC NOT LIKE '%(INATIVO)%'
            AND E02_DESC NOT LIKE '%(INATIVADO)%'
            AND E02_DESC NOT LIKE '%(PASTEURIZADO)%'
        )
    )
ORDER BY E02_ID ASC
`;

async function buscarProdutosDoErp() {
  if (!erpConfigurado()) return [];
  return query(SQL_PRODUTOS);
}

// ---------------------------------------------------------------------------
// Ultima compra (preco e data) de um produto por um cliente
// ---------------------------------------------------------------------------

const SQL_ULTIMA_COMPRA = `
-- Created by GitHub Copilot in SSMS - review carefully before executing
WITH UltimaCompra AS (
    SELECT
        m00.M00_ID_A00       AS clienteCodigo,
        e02.E02_LIVRE        AS produtoCodigo,
        m01.M01_PRECOU       AS precoUltimaCompra,
        m00.M00_ENTSAI       AS dataUltimaCompra,
        e29.E29_DESC         AS subcategoria,
        ROW_NUMBER() OVER (
            PARTITION BY m00.M00_ID_A00, m01.M01_ID_E02
            ORDER BY m00.M00_ENTSAI DESC
        ) AS rn
    FROM dbo.M01 WITH (NOLOCK)
    INNER JOIN dbo.M00 WITH (NOLOCK) ON m01.M01_ID_M00 = m00.M00_ID
    INNER JOIN dbo.E02 WITH (NOLOCK) ON m01.M01_ID_E02 = e02.E02_ID
    LEFT JOIN dbo.E29 WITH (NOLOCK) ON e02.E02_ID_E29 = e29.E29_ID
    WHERE m00.M00_ENTSAI IS NOT NULL
      AND m00.M00_STATUS = 'N'
      AND m00.M00_ID_A00 = @clienteCodigo
      AND e02.E02_LIVRE  = @produtoCodigo
)
SELECT TOP 1
    clienteCodigo,
    produtoCodigo,
    precoUltimaCompra,
    dataUltimaCompra,
    subcategoria
FROM UltimaCompra
WHERE rn = 1;
`;

async function buscarUltimaCompra(clienteCodigo, produtoCodigo) {
  if (!erpConfigurado()) return null;
  const { getPool } = require("./erpDbService");
  const sql = require("mssql");
  const pool = await getPool();
  const result = await pool.request()
    .input("clienteCodigo", sql.VarChar(50), String(clienteCodigo))
    .input("produtoCodigo", sql.VarChar(50), String(produtoCodigo))
    .query(SQL_ULTIMA_COMPRA);
  return result.recordset[0] || null;
}

/**
 * Retorna a ultima compra MAIS RECENTE entre varios clientes (de uma rede) para um produto.
 * Util para a visao consolidada por rede.
 */
async function buscarUltimaCompraRede(clientesCodigos, produtoCodigo) {
  if (!erpConfigurado()) return null;
  if (!Array.isArray(clientesCodigos) || clientesCodigos.length === 0) return null;
  const { getPool } = require("./erpDbService");
  const sql = require("mssql");
  const pool = await getPool();

  // Constroi a lista de parametros dinamicamente para evitar SQL injection
  const req = pool.request();
  req.input("produtoCodigo", sql.VarChar(50), String(produtoCodigo));
  const paramNames = clientesCodigos.map((c, i) => {
    const name = `c${i}`;
    req.input(name, sql.VarChar(50), String(c));
    return `@${name}`;
  });

  const query = `
WITH UltimaCompra AS (
    SELECT
        m00.M00_ID_A00       AS clienteCodigo,
        e02.E02_LIVRE        AS produtoCodigo,
        m01.M01_PRECOU       AS precoUltimaCompra,
        m00.M00_ENTSAI       AS dataUltimaCompra,
        e29.E29_DESC         AS subcategoria,
        ROW_NUMBER() OVER (
            PARTITION BY m00.M00_ID_A00
            ORDER BY m00.M00_ENTSAI DESC
        ) AS rn
    FROM dbo.M01 WITH (NOLOCK)
    INNER JOIN dbo.M00 WITH (NOLOCK) ON m01.M01_ID_M00 = m00.M00_ID
    INNER JOIN dbo.E02 WITH (NOLOCK) ON m01.M01_ID_E02 = e02.E02_ID
    LEFT  JOIN dbo.E29 WITH (NOLOCK) ON e02.E02_ID_E29 = e29.E29_ID
    WHERE m00.M00_ENTSAI IS NOT NULL
      AND m00.M00_STATUS = 'N'
      AND m00.M00_ID_A00 IN (${paramNames.join(",")})
      AND e02.E02_LIVRE  = @produtoCodigo
)
SELECT TOP 1
    clienteCodigo,
    produtoCodigo,
    precoUltimaCompra,
    dataUltimaCompra,
    subcategoria
FROM UltimaCompra
WHERE rn = 1
ORDER BY dataUltimaCompra DESC;
`;
  const result = await req.query(query);
  return result.recordset[0] || null;
}

module.exports = {
  buscarCarteiraDoErp,
  sincronizarCarteira,
  buscarProdutosDoErp,
  buscarUltimaCompra,
  buscarUltimaCompraRede,
};

