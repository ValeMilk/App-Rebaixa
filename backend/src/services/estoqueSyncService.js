const Estoque = require("../models/Estoque");
const { query, pgConfigurado } = require("./estoquePgDbService");
const { classificarPorValidade } = require("./classificadorService");

/**
 * Fonte: tabela de contagens public.ativmob_estoque no Postgres de BI (VPS), mais public.shelf.
 *
 * Regra de quais lotes valem (decidida em 02/10/2026; antes vinha da view
 * vw_ativmob_estoque_critico, que so considerava a ULTIMA VISITA do produto e por isso perdia
 * os lotes que a promotora nao recontava):
 *  - cada lote (loja + produto + validade) vale pela SUA ultima contagem nos ultimos 15 dias;
 *  - o lote sai quando vence, quando e recontado com zero, ou quando uma visita posterior
 *    registra que nao ha o produto na loja (quantidade zero sem lote);
 *  - o produto so entra se o estoque somado na loja passar do minimo (5 un; 2 para 4 codigos).
 * Demais criterios iguais aos da view.
 *
 * Uma linha por cliente+produto: cada lote e classificado pelo shelf; quantidade = soma so dos
 * lotes em giro/rebaixa (lotes ok ficam de fora), data_validade = a mais proxima entre esses
 * lotes, status = o pior. Item sem nenhum lote em giro/rebaixa nao entra (exceto sem shelf).
 * Cada linha traz `lotes` (todos os lotes do item, inclusive os "ok") com quem contou e quando.
 */
const JANELA_DIAS = 30;
const CODIGOS_LIMITE_2 = ["121035", "121135", "121235", "121835"];

const SQL_ESTOQUE = `
WITH base AS (
  -- Contagens dos ultimos ${JANELA_DIAS} dias, de lojas identificadas
  SELECT
    e.id, e.codigo_destino, e.nome_fantasia_dest, e.produto_codigo, e.produto_nome,
    COALESCE(e.quantidade, 0) AS quantidade, e.data_validade,
    e.agent_name, e.agent_code, e.event_dth, e.event_dth::date AS data_visita
  FROM public.ativmob_estoque e
  WHERE NULLIF(TRIM(e.codigo_destino), '') IS NOT NULL
    AND e.event_dth::date BETWEEN CURRENT_DATE - ${JANELA_DIAS} AND CURRENT_DATE
),
visitas AS (
  -- Ultima visita do promotor a cada loja (qualquer produto, inclusive "sem produto")
  SELECT DISTINCT ON (codigo_destino) codigo_destino,
    to_char(event_dth, 'YYYY-MM-DD"T"HH24:MI') AS visita_em, agent_name AS visita_por
  FROM base
  ORDER BY codigo_destino, event_dth DESC, id
),
sem_estoque AS (
  -- Ultima visita em que a promotora registrou que NAO havia o produto: quantidade zero sem lote
  -- (validade vazia ou nao futura). Cancela os lotes contados antes dela.
  SELECT codigo_destino, produto_codigo, MAX(data_visita) AS data_zero
  FROM base
  WHERE quantidade = 0 AND (data_validade IS NULL OR data_validade <= data_visita)
  GROUP BY codigo_destino, produto_codigo
),
ultima_do_lote AS (
  -- A ULTIMA CONTAGEM DE CADA LOTE (loja + produto + validade), e nao a ultima visita do produto:
  -- contar um lote novo nao apaga um lote antigo que nao foi recontado. No mesmo dia, vale a menor
  -- quantidade e, em empate, a contagem mais recente (mesmo criterio do relatorio da Ativmob).
  SELECT DISTINCT ON (codigo_destino, produto_codigo, data_validade)
    codigo_destino, nome_fantasia_dest, produto_codigo, produto_nome, quantidade, data_validade,
    agent_name, agent_code, data_visita,
    -- texto, sem fuso: e a hora de relogio em que a contagem foi feita
    to_char(event_dth, 'YYYY-MM-DD"T"HH24:MI') AS contado_em
  FROM base
  WHERE data_validade IS NOT NULL
  ORDER BY codigo_destino, produto_codigo, data_validade, data_visita DESC, quantidade, event_dth DESC, id
),
vigentes AS (
  -- O lote sai quando: venceu, foi recontado com zero, ou houve visita posterior sem o produto
  SELECT u.*,
    SUM(u.quantidade) OVER (PARTITION BY u.codigo_destino, u.produto_codigo) AS estoque_total,
    MAX(u.data_visita) OVER (PARTITION BY u.codigo_destino, u.produto_codigo) AS ultima_visita
  FROM ultima_do_lote u
  LEFT JOIN sem_estoque z ON z.codigo_destino = u.codigo_destino AND z.produto_codigo = u.produto_codigo
  WHERE u.data_validade > CURRENT_DATE
    AND u.quantidade > 0
    AND (z.data_zero IS NULL OR u.data_visita >= z.data_zero)
),
lotes AS (
  SELECT
    v.codigo_destino, v.nome_fantasia_dest, v.produto_codigo, v.produto_nome,
    v.quantidade, v.data_validade, s.shelf_dias AS shelf,
    -- Regra por lote: >= 73% do shelf consumido = rebaixa (3); >= 45% = giro (2); ok (1); sem shelf (0)
    CASE WHEN COALESCE(s.shelf_dias, 0) <= 0 THEN 0
         WHEN s.shelf_dias - (v.data_validade - CURRENT_DATE) >= ROUND(s.shelf_dias * 0.73) THEN 3
         WHEN s.shelf_dias - (v.data_validade - CURRENT_DATE) >= ROUND(s.shelf_dias * 0.45) THEN 2
         ELSE 1 END AS peso,
    v.agent_name, v.agent_code, v.contado_em,
    (v.data_visita = v.ultima_visita) AS na_ultima_visita
  FROM vigentes v
  LEFT JOIN public.shelf s ON TRIM(s.produto_codigo) = TRIM(v.produto_codigo::text)
  -- So produtos com estoque relevante na loja: mais de 5 unidades (2 para os itens de caixa)
  WHERE v.estoque_total > CASE WHEN v.produto_codigo::text IN (${CODIGOS_LIMITE_2.map((c) => `'${c}'`).join(", ")}) THEN 2 ELSE 5 END
),
agg AS (
  SELECT
    codigo_destino, MAX(nome_fantasia_dest) AS nome_fantasia_dest,
    produto_codigo, MAX(produto_nome) AS produto_nome, MAX(shelf) AS shelf,
    MAX(peso) AS peso_max,
    SUM(quantidade)    FILTER (WHERE peso >= 2) AS qtd_acao,
    MIN(data_validade) FILTER (WHERE peso >= 2) AS validade_acao,
    SUM(quantidade)    AS qtd_total,
    MIN(data_validade) AS validade_min,
    json_agg(json_build_object(
      'dataValidade', to_char(data_validade, 'YYYY-MM-DD'),
      'quantidade', quantidade,
      'peso', peso,
      'agente', agent_name,
      'agenteCodigo', agent_code,
      'contadoEm', contado_em,
      'naUltimaVisita', na_ultima_visita
    ) ORDER BY data_validade) AS lotes
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
  CASE peso_max WHEN 3 THEN 'rebaixa' WHEN 2 THEN 'giro' ELSE 'sem_shelf' END AS status_shelf,
  peso_max, lotes, v.visita_em, v.visita_por
FROM sel
LEFT JOIN visitas v USING (codigo_destino)
ORDER BY data_validade, codigo_destino, produto_codigo;
`;

const STATUS_POR_PESO = { 3: "rebaixa", 2: "giro", 1: "ok", 0: "sem_shelf" };

function montarChave(clienteCodigo, produtoCodigo) {
  return `${clienteCodigo}|${produtoCodigo}`;
}

/**
 * Lotes do item como serao gravados. Entra na soma: lote em giro/rebaixa quando o item tem algum;
 * no item sem shelf (peso maximo 0), todos entram.
 */
function montarLotes(lotesBrutos, pesoMax) {
  const temAcao = Number(pesoMax) >= 2;
  return (Array.isArray(lotesBrutos) ? lotesBrutos : []).map((l) => {
    const peso = Number(l.peso) || 0;
    return {
      dataValidade: l.dataValidade ? new Date(`${l.dataValidade}T00:00:00.000Z`) : null,
      quantidade: Number(l.quantidade) || 0,
      status: STATUS_POR_PESO[peso] || "sem_shelf",
      entraNaSoma: temAcao ? peso >= 2 : true,
      agente: l.agente ? String(l.agente).trim() : null,
      agenteCodigo: l.agenteCodigo != null ? String(l.agenteCodigo).trim() : null,
      contadoEm: l.contadoEm || null, // "AAAA-MM-DDTHH:MM", hora de relogio da contagem
      // false = o lote veio de uma visita anterior e nao foi recontado na ultima visita do produto
      naUltimaVisita: l.naUltimaVisita !== false,
    };
  });
}

/** Linha da consulta -> documento do espelho. Funcao pura (testada em tests/estoque). */
function montarDoc(l) {
  const dataValidade = l.data_validade ? new Date(l.data_validade) : null;
  const { diasParaVencer, classificacao } = classificarPorValidade(dataValidade);
  const clienteCodigo = String(l.codigo_destino || "");
  const produtoCodigo = l.produto_codigo != null ? String(l.produto_codigo) : "";

  const lotes = montarLotes(l.lotes, l.peso_max);
  const usados = lotes.filter((x) => x.entraNaSoma);
  // Contagem mais recente entre os lotes que formam a quantidade
  const ultima = usados.reduce((m, x) => (x.contadoEm && (!m || x.contadoEm > m.contadoEm) ? x : m), null);

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
    lotes,
    lotesNaSoma: usados.length,
    contadoPor: ultima ? ultima.agente : null,
    contadoPorCodigo: ultima ? ultima.agenteCodigo : null,
    contadoEm: ultima ? ultima.contadoEm : null,
    ultimaVisitaEm: l.visita_em || null,
    ultimaVisitaPor: l.visita_por ? String(l.visita_por).trim() : null,
  };
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

  const docs = linhas.map(montarDoc);

  const ops = docs.map((d) => ({
    updateOne: {
      filter: { chave: d.chave },
      // `raw` deixou de ser gravado (ninguem le); o $unset limpa o que ficou de sincronizacoes antigas
      update: { $set: d, $unset: { raw: "" } },
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

module.exports = { sincronizarEstoque, SQL_ESTOQUE, montarDoc, montarLotes };
