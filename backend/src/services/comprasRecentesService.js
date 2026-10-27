const CompraRecente = require("../models/CompraRecente");
const { query, erpConfigurado } = require("./erpDbService");

/**
 * Compras dos ultimos 90 dias por loja x produto (Lacteus) -> CompraRecente (v2.0, fase 1a).
 *
 * Uma consulta so, com TODAS as lojas (sem filtro de cliente), agregada por M00_ID_A00 x RTRIM(E02_LIVRE):
 * mesmas operacoes e filtros da "ultima compra" (erpService): notas M00 com status 'N' e operacao
 * (A76) 38/39/45/46/1134, itens M01 com status 'N', produto do tipo '04'. A data e M00_ENTSAI.
 * Volume medido em 27/10/2026: 1.133 lojas, 20.711 pares, ~1 s.
 *
 * O preco gravado e o da ULTIMA nota (ROW_NUMBER por par, nota mais recente primeiro). Nivel de
 * compatibilidade 100 do SQL Server: nada de TRY_CONVERT/DATETRUNC.
 */
const DIAS_COMPRAS = 90;

const SQL_COMPRAS_90D = `
WITH Itens AS (
    SELECT
        m00.M00_ID            AS notaId,
        m00.M00_ID_A00        AS clienteCodigo,
        RTRIM(e02.E02_LIVRE)  AS produtoCodigo,
        e02.E02_DESC          AS produto,
        m00.M00_ENTSAI        AS dataNota,
        m01.M01_QTD           AS qtd,
        m01.M01_PRECOU        AS precoUnit,
        ROW_NUMBER() OVER (
            PARTITION BY m00.M00_ID_A00, RTRIM(e02.E02_LIVRE)
            ORDER BY m00.M00_ENTSAI DESC, m00.M00_ID DESC
        ) AS rn
    FROM dbo.M01 m01 WITH (NOLOCK)
    INNER JOIN dbo.M00 m00 WITH (NOLOCK) ON m01.M01_ID_M00 = m00.M00_ID
    INNER JOIN dbo.E02 e02 WITH (NOLOCK) ON m01.M01_ID_E02 = e02.E02_ID
    WHERE m00.M00_ENTSAI IS NOT NULL
      AND m00.M00_ENTSAI >= DATEADD(DAY, -${DIAS_COMPRAS}, CAST(GETDATE() AS DATE))
      AND m00.M00_STATUS = 'N'
      AND m01.M01_STATUS = 'N'
      AND m00.M00_ID_A76 IN (38, 39, 45, 46, 1134)
      AND e02.E02_TIPO = '04'
      AND NULLIF(RTRIM(e02.E02_LIVRE), '') IS NOT NULL
)
SELECT
    clienteCodigo,
    produtoCodigo,
    MAX(produto)                                   AS produto,
    MAX(dataNota)                                  AS ultimaCompraEm,
    SUM(qtd)                                       AS qtd90d,
    COUNT(DISTINCT notaId)                         AS notas90d,
    MAX(CASE WHEN rn = 1 THEN precoUnit END)       AS ultimoPreco
FROM Itens
GROUP BY clienteCodigo, produtoCodigo
`;

function montarChave(clienteCodigo, produtoCodigo) {
  return `${clienteCodigo}|${produtoCodigo}`;
}

/** Linha do Lacteus -> documento CompraRecente. Funcao pura (testada em tests/visao). */
function montarCompra(l, sincronizadoEm = new Date()) {
  const clienteCodigo = String(l.clienteCodigo != null ? l.clienteCodigo : "").trim();
  const produtoCodigo = String(l.produtoCodigo != null ? l.produtoCodigo : "").trim();
  return {
    chave: montarChave(clienteCodigo, produtoCodigo),
    clienteCodigo,
    produtoCodigo,
    produto: l.produto ? String(l.produto).trim() : "",
    ultimaCompraEm: l.ultimaCompraEm ? new Date(l.ultimaCompraEm) : null,
    ultimoPreco: l.ultimoPreco != null ? Number(l.ultimoPreco) : null,
    qtd90d: Number(l.qtd90d) || 0,
    notas90d: Number(l.notas90d) || 0,
    sincronizadoEm,
  };
}

/**
 * Espelha no Mongo as compras dos ultimos 90 dias: upsert por chave "cliente|produto" e remocao
 * do que nao voltou nesta rodada. Devolve { lojas, pares, removidos }.
 */
async function sincronizarComprasRecentes() {
  if (!erpConfigurado()) {
    return { lojas: 0, pares: 0, removidos: 0, observacao: "ERP nao configurado — preencha as variaveis ERP_* no .env" };
  }

  const linhas = await query(SQL_COMPRAS_90D);
  if (!linhas.length) {
    return { lojas: 0, pares: 0, removidos: 0, observacao: "Nenhuma compra nos ultimos 90 dias retornada pelo Lacteus" };
  }

  const agora = new Date();
  const docs = linhas.map((l) => montarCompra(l, agora)).filter((d) => d.clienteCodigo && d.produtoCodigo);

  const ops = docs.map((d) => ({
    updateOne: { filter: { chave: d.chave }, update: { $set: d }, upsert: true },
  }));
  for (let i = 0; i < ops.length; i += 1000) {
    await CompraRecente.bulkWrite(ops.slice(i, i + 1000), { ordered: false });
  }

  // O que nao foi tocado nesta rodada saiu da janela de 90 dias
  const del = await CompraRecente.deleteMany({ sincronizadoEm: { $lt: agora } });

  const lojas = new Set(docs.map((d) => d.clienteCodigo)).size;
  return { lojas, pares: docs.length, removidos: del.deletedCount || 0 };
}

module.exports = { sincronizarComprasRecentes, SQL_COMPRAS_90D, DIAS_COMPRAS, montarCompra, montarChave };
