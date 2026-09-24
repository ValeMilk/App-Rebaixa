const Estoque = require("../models/Estoque");
const { query, pgConfigurado } = require("./estoquePgDbService");
const { classificarPorValidade } = require("./classificadorService");

/**
 * Fonte: view public.vw_ativmob_estoque_critico no Postgres de BI (VPS) —
 * ja aplica a definicao de negocio de "critico" (ultima visita nos ultimos
 * 15 dias, limite de quantidade variavel por produto, nao vencido). O app
 * nao re-filtra por cima, confia integralmente no que a view devolve.
 * Uma linha por cliente+produto: cada lote (validade) e classificado pelo
 * shelf; quantidade = soma so dos lotes em giro/rebaixa (lotes ok ficam de
 * fora), data_validade = a mais proxima entre esses lotes, status = o pior.
 * Item sem nenhum lote em giro/rebaixa nao entra (exceto sem shelf).
 */
const SQL_ESTOQUE = `
WITH lotes AS (
  SELECT
    codigo_destino, nome_fantasia_dest, produto_codigo, produto_nome,
    COALESCE(quantidade, 0) AS quantidade, data_validade, shelf_dias AS shelf,
    -- Regra por lote: >= 73% do shelf consumido = rebaixa (3); >= 45% = giro (2); ok (1); sem shelf (0)
    CASE WHEN COALESCE(shelf_dias, 0) <= 0 THEN 0
         WHEN shelf_dias - (data_validade - CURRENT_DATE) >= ROUND(shelf_dias * 0.73) THEN 3
         WHEN shelf_dias - (data_validade - CURRENT_DATE) >= ROUND(shelf_dias * 0.45) THEN 2
         ELSE 1 END AS peso
  FROM public.vw_ativmob_estoque_critico
),
agg AS (
  SELECT
    codigo_destino, MAX(nome_fantasia_dest) AS nome_fantasia_dest,
    produto_codigo, MAX(produto_nome) AS produto_nome, MAX(shelf) AS shelf,
    MAX(peso) AS peso_max,
    SUM(quantidade)    FILTER (WHERE peso >= 2) AS qtd_acao,
    MIN(data_validade) FILTER (WHERE peso >= 2) AS validade_acao,
    SUM(quantidade)    AS qtd_total,
    MIN(data_validade) AS validade_min
  FROM lotes
  GROUP BY codigo_destino, produto_codigo
),
sel AS (
  -- So lotes em giro/rebaixa entram na soma; item sem nenhum deles sai (exceto sem shelf)
  SELECT *,
    CASE WHEN peso_max >= 2 THEN qtd_acao      ELSE qtd_total    END AS quantidade,
    CASE WHEN peso_max >= 2 THEN validade_acao ELSE validade_min END AS data_validade
  FROM agg
  WHERE peso_max >= 2 OR peso_max = 0
)
SELECT
  codigo_destino, nome_fantasia_dest, produto_codigo, produto_nome,
  quantidade, data_validade, shelf,
  -- pct limitado a [0,1]: validade mais longa que o shelf (dado inconsistente) daria negativo
  CASE WHEN COALESCE(shelf, 0) <= 0 THEN NULL
       ELSE ROUND(GREATEST(0, LEAST(1, (shelf - (data_validade - CURRENT_DATE))::numeric / shelf)), 4) END AS pct_shelf,
  CASE peso_max WHEN 3 THEN 'rebaixa' WHEN 2 THEN 'giro' ELSE 'sem_shelf' END AS status_shelf
FROM sel
ORDER BY data_validade, codigo_destino, produto_codigo;
`;

function montarChave(clienteCodigo, produtoCodigo) {
  return `${clienteCodigo}|${produtoCodigo}`;
}

/**
 * Sincroniza estoque critico a partir da view do Postgres de BI.
 * Espelha o resultado no Mongo: grava/atualiza por chave (upsert) e apaga
 * o que nao apareceu mais nesta rodada — a view recalcula "critico" do
 * zero a cada consulta, entao o que sai dela deixou de ser critico.
 */
async function sincronizarEstoque() {
  if (!pgConfigurado()) {
    return { eventosBaixados: 0, upserts: 0, observacao: "Postgres nao configurado — preencha PG_* no .env" };
  }

  const linhas = await query(SQL_ESTOQUE);
  if (!linhas.length) {
    return { eventosBaixados: 0, upserts: 0, removidos: 0 };
  }

  const docs = linhas.map((l) => {
    const dataValidade = l.data_validade ? new Date(l.data_validade) : null;
    const { diasParaVencer, classificacao } = classificarPorValidade(dataValidade);
    const clienteCodigo = String(l.codigo_destino || "");
    const produtoCodigo = l.produto_codigo != null ? String(l.produto_codigo) : "";

    return {
      chave: montarChave(clienteCodigo, produtoCodigo),
      cliente: l.nome_fantasia_dest || "",
      clienteCodigo,
      produto: l.produto_nome || "",
      produtoCodigo,
      quantidade: Number(l.quantidade) || 0,
      dataValidade,
      diasParaVencer,
      classificacao,
      shelf: Number(l.shelf) || 0,
      pctShelf: l.pct_shelf != null ? Number(l.pct_shelf) : null,
      statusShelf: l.status_shelf || "sem_shelf",
      raw: l,
    };
  });

  const ops = docs.map((d) => ({
    updateOne: {
      filter: { chave: d.chave },
      update: { $set: d },
      upsert: true,
    },
  }));

  let upserts = 0;
  for (let i = 0; i < ops.length; i += 1000) {
    const r = await Estoque.bulkWrite(ops.slice(i, i + 1000), { ordered: false });
    upserts += (r.upsertedCount || 0) + (r.modifiedCount || 0);
  }

  const chavesAtuais = docs.map((d) => d.chave);
  const del = await Estoque.deleteMany({ chave: { $nin: chavesAtuais } });

  return { eventosBaixados: linhas.length, upserts, removidos: del.deletedCount || 0 };
}

module.exports = { sincronizarEstoque };
