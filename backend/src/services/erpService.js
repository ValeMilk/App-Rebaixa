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
    AND (seg.A16_DESC NOT LIKE '%INATIVO%' OR seg.A16_DESC IS NULL)
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
        A16.A16_ID           AS codigoRede,
        a16.A16_DESC         AS rede,
        ROW_NUMBER() OVER (
            PARTITION BY m00.M00_ID_A00, m01.M01_ID_E02
            ORDER BY m00.M00_ENTSAI DESC
        ) AS rn
    FROM dbo.M01 WITH (NOLOCK)
    INNER JOIN dbo.M00 WITH (NOLOCK) ON m01.M01_ID_M00 = m00.M00_ID
    INNER JOIN dbo.E02 WITH (NOLOCK) ON m01.M01_ID_E02 = e02.E02_ID
    INNER JOIN dbo.A00 WITH (NOLOCK) ON m00.M00_ID_A00 = a00.A00_ID
    LEFT  JOIN dbo.E29 WITH (NOLOCK) ON e02.E02_ID_E29 = e29.E29_ID
    LEFT  JOIN dbo.A16 WITH (NOLOCK) ON a00.A00_ID_A16 = a16.A16_ID
    WHERE m00.M00_ENTSAI IS NOT NULL
      AND m00.M00_STATUS = 'N'
      AND m00.M00_ID_A00 = @clienteCodigo
      AND e02.E02_LIVRE  = @produtoCodigo
      AND m00.M00_ID_A76 IN (38, 39, 45, 46, 1134)
)
SELECT TOP 1
    clienteCodigo,
    produtoCodigo,
    precoUltimaCompra,
    dataUltimaCompra,
    subcategoria,
    codigoRede,
    rede
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
 * Retorna a ultima compra MAIS RECENTE de qualquer loja de uma rede para um produto.
 * Filtra diretamente por A00_ID_A16 no ERP — sem depender do MongoDB Carteira.
 */
async function buscarUltimaCompraRede(codigoRede, produtoCodigo) {
  if (!erpConfigurado()) return null;
  if (!codigoRede || !produtoCodigo) return null;
  const { getPool } = require("./erpDbService");
  const sql = require("mssql");
  const pool = await getPool();

  console.log(`[buscarUltimaCompraRede] codigoRede=${codigoRede} produtoCodigo=${produtoCodigo}`);

  const req = pool.request();
  req.input("codigoRede",    sql.Int, Number(codigoRede));
  req.input("produtoCodigo", sql.VarChar(50), String(produtoCodigo));

  const query = `
WITH UltimaCompra AS (
    SELECT
        m00.M00_ID_A00       AS clienteCodigo,
        e02.E02_LIVRE        AS produtoCodigo,
        m01.M01_PRECOU       AS precoUltimaCompra,
        m00.M00_ENTSAI       AS dataUltimaCompra,
        e29.E29_DESC         AS subcategoria,
        A16.A16_ID           AS codigoRede,
        a16.A16_DESC         AS rede,
        ROW_NUMBER() OVER (
            PARTITION BY m00.M00_ID_A00
            ORDER BY m00.M00_ENTSAI DESC
        ) AS rn
    FROM dbo.M01 WITH (NOLOCK)
    INNER JOIN dbo.M00 WITH (NOLOCK) ON m01.M01_ID_M00 = m00.M00_ID
    INNER JOIN dbo.E02 WITH (NOLOCK) ON m01.M01_ID_E02 = e02.E02_ID
    INNER JOIN dbo.A00 WITH (NOLOCK) ON m00.M00_ID_A00 = a00.A00_ID
    LEFT  JOIN dbo.E29 WITH (NOLOCK) ON e02.E02_ID_E29 = e29.E29_ID
    LEFT  JOIN dbo.A16 WITH (NOLOCK) ON a00.A00_ID_A16 = a16.A16_ID
    WHERE m00.M00_ENTSAI IS NOT NULL
      AND m00.M00_STATUS = 'N'
      AND a00.A00_ID_A16 = @codigoRede
      AND e02.E02_LIVRE  = @produtoCodigo
      AND m00.M00_ID_A76 IN (38, 39, 45, 46, 1134)
)
SELECT TOP 1
    clienteCodigo,
    produtoCodigo,
    precoUltimaCompra,
    dataUltimaCompra,
    subcategoria,
    codigoRede,
    rede
FROM UltimaCompra
WHERE rn = 1
ORDER BY dataUltimaCompra DESC;
`;
  const result = await req.query(query);
  return result.recordset[0] || null;
}

/**
 * Busca ultima compra de MÚLTIPLOS produtos de uma rede em uma única query.
 * Muito mais eficiente que chamar buscarUltimaCompraRede() várias vezes.
 */
async function buscarUltimaCompraRedeBatch(codigoRede, produtosCodigos) {
  if (!erpConfigurado()) return {};
  if (!codigoRede || !Array.isArray(produtosCodigos) || produtosCodigos.length === 0) return {};
  
  const { getPool } = require("./erpDbService");
  const sql = require("mssql");
  const pool = await getPool();

  // Limita a 500 produtos por segurança
  const codigos = produtosCodigos.slice(0, 500).map(c => String(c));
  
  console.log(`[buscarUltimaCompraRedeBatch] codigoRede=${codigoRede} produtos=${codigos.length}`);

  const req = pool.request();
  req.input("codigoRede", sql.Int, Number(codigoRede));
  
  // Monta placeholders para IN clause
  const placeholders = codigos.map((_, i) => `@prod${i}`).join(',');
  codigos.forEach((cod, i) => {
    req.input(`prod${i}`, sql.VarChar(50), cod);
  });

  const query = `
WITH UltimaCompra AS (
    SELECT
        e02.E02_LIVRE        AS produtoCodigo,
        m01.M01_PRECOU       AS precoUltimaCompra,
        m00.M00_ENTSAI       AS dataUltimaCompra,
        ROW_NUMBER() OVER (
            PARTITION BY e02.E02_LIVRE
            ORDER BY m00.M00_ENTSAI DESC
        ) AS rn
    FROM dbo.M01 WITH (NOLOCK)
    INNER JOIN dbo.M00 WITH (NOLOCK) ON m01.M01_ID_M00 = m00.M00_ID
    INNER JOIN dbo.E02 WITH (NOLOCK) ON m01.M01_ID_E02 = e02.E02_ID
    INNER JOIN dbo.A00 WITH (NOLOCK) ON m00.M00_ID_A00 = a00.A00_ID
    WHERE m00.M00_ENTSAI IS NOT NULL
      AND m00.M00_STATUS = 'N'
      AND a00.A00_ID_A16 = @codigoRede
      AND e02.E02_LIVRE IN (${placeholders})
      AND m00.M00_ID_A76 IN (38, 39, 45, 46, 1134)
)
SELECT
    produtoCodigo,
    precoUltimaCompra,
    dataUltimaCompra
FROM UltimaCompra
WHERE rn = 1;
`;

  const result = await req.query(query);
  
  // Transforma array em objeto { produtoCodigo: { preco, data } }
  const map = {};
  result.recordset.forEach(r => {
    map[r.produtoCodigo] = {
      preco: Number(r.precoUltimaCompra) || 0,
      data: r.dataUltimaCompra
    };
  });
  
  return map;
}

module.exports = {
  buscarCarteiraDoErp,
  sincronizarCarteira,
  buscarProdutosDoErp,
  buscarUltimaCompra,
  buscarUltimaCompraRede,
  buscarUltimaCompraRedeBatch,
};

