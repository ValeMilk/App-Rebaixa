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
    s.A00_FANTASIA    AS supervisorNome
FROM A00 c
INNER JOIN A14 a  ON c.A00_ID_A14 = a.A14_ID
INNER JOIN A02 b  ON c.A00_ID_A02 = b.A02_ID
LEFT  JOIN A00 v  ON c.A00_ID_VEND   = v.A00_ID
LEFT  JOIN A00 s  ON c.A00_ID_VEND_2 = s.A00_ID
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
          clienteCodigo:   String(l.clienteCodigo),
          clienteNome:     l.clienteNome     || "",
          vendedorCodigo:  String(l.vendedorCodigo  || ""),
          vendedorNome:    l.vendedorNome    || "",
          supervisorCodigo: String(l.supervisorCodigo || ""),
          supervisorNome:  l.supervisorNome  || "",
          sincronizadoEm:  new Date(),
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
SELECT
    E02_ID            AS codigo,
    E02_LIVRE         AS codigoLivre,
    E02_DESC          AS descricao,
    E02_PRECO         AS precoTabela,
    E02_PRECO_02      AS precoMinimo,
    E02_PRECO_03      AS precoPromo,
    E02_CUSTO_LIVRE   AS custo,
    E23.E23_DESC      AS categoria
FROM dbo.E02 WITH (NOLOCK)
LEFT JOIN dbo.E23 WITH (NOLOCK) ON E02.E02_ID_E23 = E23.E23_ID
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

module.exports = {
  buscarCarteiraDoErp,
  sincronizarCarteira,
  buscarProdutosDoErp,
};

