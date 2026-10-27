const ItemLoja = require("../models/ItemLoja");
const Ruptura = require("../models/Ruptura");
const CompraRecente = require("../models/CompraRecente");
const Carteira = require("../models/Carteira");
const { query, pgConfigurado } = require("./estoquePgDbService");
const { classificarPorValidade } = require("./classificadorService");
const { DIAS_SEM_RECONTAGEM } = require("./estoqueSyncService");

/**
 * Visao do vendedor (v2.0, fase 1a): monta ItemLoja e Ruptura a partir do Ativmob (BI) + CompraRecente.
 *
 * A consulta reaproveita as CTEs do SQL_ESTOQUE (estoqueSyncService) — mesma janela de 30 dias, mesma
 * "ultima contagem de cada lote", mesma regra de saida do lote (vencido / zerado / visita posterior sem
 * o produto / nao reencontrado em DIAS_SEM_RECONTAGEM dias) e mesmo peso por shelf (45% giro, 73%
 * rebaixa) — mas NAO descarta nada: todo lote contado nos ultimos 30 dias volta com `vigente` e
 * `motivoSaida`, e todo produto contado volta com a sua ULTIMA contagem (qualquer quantidade, inclusive
 * zero e sem validade) e o `em_ruptura` do evento. A ruptura vem do evento, nao do lote: 1.067 dos
 * 5.052 eventos "zero + ruptura" dos ultimos 30 dias nao tem data_validade (conferido em 27/10/2026).
 *
 * A classificacao (situacao, soma, validade) fica em JS, na funcao pura classificarItem, testada em
 * tests/visao. A skill docs/skills/vencimentos-estoque replica a regra do Painel: ao mudar limites aqui,
 * conferir la tambem.
 */
const JANELA_DIAS = 30;
const DIAS_CONTAGEM_ANTIGA = 180; // ate onde procurar a ultima contagem de um item sem contagem em 30 dias
const CODIGOS_LIMITE_2 = ["121035", "121135", "121235", "121835"];
const STATUS_POR_PESO = { 3: "rebaixa", 2: "giro", 1: "ok", 0: "sem_shelf" };
const MOTIVOS_SAIDA = ["vencido", "zerado", "nao_reencontrado"];

const SQL_VISAO = `
WITH base AS (
  -- Contagens dos ultimos ${JANELA_DIAS} dias, de lojas identificadas (codigo Lacteus da loja)
  SELECT
    e.id,
    TRIM(e.codigo_destino::text) AS codigo_destino,
    e.nome_fantasia_dest,
    TRIM(e.produto_codigo::text) AS produto_codigo,
    e.produto_nome,
    COALESCE(e.quantidade, 0) AS quantidade,
    e.data_validade,
    (UPPER(TRIM(COALESCE(e.em_ruptura::text, ''))) = 'SIM') AS em_ruptura,
    e.agent_name, e.agent_code, e.event_dth,
    e.event_dth::date AS data_visita,
    -- texto, sem fuso: e a hora de relogio em que a contagem foi feita
    to_char(e.event_dth, 'YYYY-MM-DD"T"HH24:MI') AS contado_em
  FROM public.ativmob_estoque e
  WHERE NULLIF(TRIM(e.codigo_destino::text), '') IS NOT NULL
    AND e.event_dth::date BETWEEN CURRENT_DATE - ${JANELA_DIAS} AND CURRENT_DATE
),
visitas AS (
  -- Ultima visita do promotor a cada loja (qualquer produto, inclusive "sem produto")
  SELECT DISTINCT ON (codigo_destino) codigo_destino,
    contado_em AS visita_em, agent_name AS visita_por, data_visita AS visita_data
  FROM base
  ORDER BY codigo_destino, event_dth DESC, id
),
ultimo_dia AS (
  -- Dia da ultima contagem de cada produto na loja (qualquer quantidade, com ou sem validade)
  SELECT codigo_destino, produto_codigo, MAX(data_visita) AS data_ultima
  FROM base
  GROUP BY codigo_destino, produto_codigo
),
ultima AS (
  -- A ULTIMA contagem do produto na loja: o que foi contado nesse dia (um registro por lote, com a
  -- menor quantidade em caso de repeticao), ruptura se algum registro do dia marcou em_ruptura = SIM,
  -- quem contou / quando = registro mais recente do dia
  SELECT x.codigo_destino, x.produto_codigo,
    SUM(x.quantidade)   AS ultima_qtd,
    BOOL_OR(x.em_ruptura) AS ultima_ruptura,
    MAX(x.contado_em)   AS ultima_contado_em,
    (ARRAY_AGG(x.agent_name ORDER BY x.event_dth DESC, x.id DESC))[1] AS ultima_agente,
    (ARRAY_AGG(x.agent_code ORDER BY x.event_dth DESC, x.id DESC))[1] AS ultima_agente_codigo,
    MAX(x.nome_fantasia_dest) AS nome_fantasia_dest,
    MAX(x.produto_nome)       AS produto_nome
  FROM (
    SELECT DISTINCT ON (b.codigo_destino, b.produto_codigo, b.data_validade) b.*
    FROM base b
    JOIN ultimo_dia d ON d.codigo_destino = b.codigo_destino AND d.produto_codigo = b.produto_codigo AND d.data_ultima = b.data_visita
    ORDER BY b.codigo_destino, b.produto_codigo, b.data_validade, b.quantidade, b.event_dth DESC, b.id
  ) x
  GROUP BY x.codigo_destino, x.produto_codigo
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
  -- A ULTIMA CONTAGEM DE CADA LOTE (loja + produto + validade). No mesmo dia, vale a menor quantidade
  -- e, em empate, a contagem mais recente (mesmo criterio do relatorio da Ativmob e do SQL_ESTOQUE).
  SELECT DISTINCT ON (codigo_destino, produto_codigo, data_validade)
    codigo_destino, produto_codigo, quantidade, data_validade, agent_name, agent_code, data_visita, contado_em
  FROM base
  WHERE data_validade IS NOT NULL
  ORDER BY codigo_destino, produto_codigo, data_validade, data_visita DESC, quantidade, event_dth DESC, id
),
lotes AS (
  -- Nada e descartado: cada lote sai com o motivo (ou NULL = vigente), o peso e o % do shelf
  SELECT u.*,
    s.shelf_dias AS shelf,
    -- Regra por lote: >= 73% do shelf consumido = rebaixa (3); >= 45% = giro (2); ok (1); sem shelf (0)
    CASE WHEN COALESCE(s.shelf_dias, 0) <= 0 THEN 0
         WHEN s.shelf_dias - (u.data_validade - CURRENT_DATE) >= ROUND(s.shelf_dias * 0.73) THEN 3
         WHEN s.shelf_dias - (u.data_validade - CURRENT_DATE) >= ROUND(s.shelf_dias * 0.45) THEN 2
         ELSE 1 END AS peso,
    -- pct limitado a [0,1]: validade mais longa que o shelf (dado inconsistente) daria negativo
    CASE WHEN COALESCE(s.shelf_dias, 0) <= 0 THEN NULL
         ELSE ROUND(GREATEST(0, LEAST(1, (s.shelf_dias - (u.data_validade - CURRENT_DATE))::numeric / s.shelf_dias)), 4) END AS pct_shelf,
    -- Saida do lote: venceu; recontado com zero ou visita posterior sem o produto; loja visitada mais de
    -- ${DIAS_SEM_RECONTAGEM} dias depois da contagem dele (nao foi reencontrado)
    CASE WHEN u.data_validade <= CURRENT_DATE THEN 'vencido'
         WHEN u.quantidade <= 0 OR (z.data_zero IS NOT NULL AND u.data_visita < z.data_zero) THEN 'zerado'
         WHEN (lv.visita_data - u.data_visita) > ${DIAS_SEM_RECONTAGEM} THEN 'nao_reencontrado'
         ELSE NULL END AS motivo_saida,
    (u.data_visita = d.data_ultima) AS na_ultima_visita,
    (lv.visita_data - u.data_visita) AS dias_desde_contagem
  FROM ultima_do_lote u
  JOIN visitas lv ON lv.codigo_destino = u.codigo_destino
  JOIN ultimo_dia d ON d.codigo_destino = u.codigo_destino AND d.produto_codigo = u.produto_codigo
  LEFT JOIN sem_estoque z ON z.codigo_destino = u.codigo_destino AND z.produto_codigo = u.produto_codigo
  LEFT JOIN public.shelf s ON TRIM(s.produto_codigo::text) = u.produto_codigo
),
lotes_agg AS (
  SELECT codigo_destino, produto_codigo, MAX(shelf) AS shelf,
    json_agg(json_build_object(
      'dataValidade', to_char(data_validade, 'YYYY-MM-DD'),
      'quantidade', quantidade,
      'peso', peso,
      'pctShelf', pct_shelf,
      'vigente', (motivo_saida IS NULL),
      'motivoSaida', motivo_saida,
      'agente', agent_name,
      'agenteCodigo', agent_code,
      'contadoEm', contado_em,
      'naUltimaVisita', na_ultima_visita,
      'diasDesdeContagem', dias_desde_contagem
    ) ORDER BY data_validade) AS lotes
  FROM lotes
  GROUP BY codigo_destino, produto_codigo
)
SELECT
  u.codigo_destino, u.nome_fantasia_dest, u.produto_codigo, u.produto_nome,
  la.shelf, COALESCE(la.lotes, '[]'::json) AS lotes,
  u.ultima_qtd, u.ultima_ruptura, u.ultima_contado_em, u.ultima_agente, u.ultima_agente_codigo,
  v.visita_em, v.visita_por
FROM ultima u
LEFT JOIN lotes_agg la ON la.codigo_destino = u.codigo_destino AND la.produto_codigo = u.produto_codigo
LEFT JOIN visitas v ON v.codigo_destino = u.codigo_destino
ORDER BY u.codigo_destino, u.produto_codigo;
`;

/**
 * Ultima contagem ANTES da janela de 30 dias, por loja x produto (ate ${DIAS_CONTAGEM_ANTIGA} dias): so
 * para mostrar "Nao contado · ultima contagem dd/mm" em vez de "nunca contado".
 */
const SQL_CONTAGEM_ANTIGA = `
SELECT
  TRIM(e.codigo_destino::text) AS codigo_destino,
  TRIM(e.produto_codigo::text) AS produto_codigo,
  to_char(MAX(e.event_dth), 'YYYY-MM-DD"T"HH24:MI') AS contado_em
FROM public.ativmob_estoque e
WHERE NULLIF(TRIM(e.codigo_destino::text), '') IS NOT NULL
  AND e.event_dth::date BETWEEN CURRENT_DATE - ${DIAS_CONTAGEM_ANTIGA} AND CURRENT_DATE - ${JANELA_DIAS + 1}
GROUP BY 1, 2;
`;

function montarChave(clienteCodigo, produtoCodigo) {
  return `${clienteCodigo}|${produtoCodigo}`;
}

function paraData(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00.000Z`) : null;
}

/** Lote como veio da consulta -> lote do ItemLoja (status pelo peso; entraNaSoma e decidido no item). */
function normalizarLote(l) {
  const peso = Number(l.peso) || 0;
  const motivoSaida = MOTIVOS_SAIDA.includes(l.motivoSaida) ? l.motivoSaida : null;
  return {
    dataValidade: paraData(l.dataValidade),
    quantidade: Number(l.quantidade) || 0,
    status: STATUS_POR_PESO[peso] || "sem_shelf",
    peso,
    pctShelf: l.pctShelf != null ? Number(l.pctShelf) : null,
    vigente: motivoSaida == null && l.vigente !== false,
    motivoSaida,
    entraNaSoma: false,
    agente: l.agente ? String(l.agente).trim() : null,
    agenteCodigo: l.agenteCodigo != null ? String(l.agenteCodigo).trim() : null,
    contadoEm: l.contadoEm || null,
    naUltimaVisita: l.naUltimaVisita !== false,
  };
}

/**
 * Classifica um loja x produto. Funcao pura (testada em tests/visao/classificarItem.test.js).
 *
 * @param {object} p
 * @param {Array}  p.lotes          lotes dos ultimos 30 dias como a consulta devolve (peso, vigente, motivoSaida...)
 * @param {object} p.ultima         ultima contagem do produto: { quantidade, emRuptura, contadoEm, agente, agenteCodigo } ou null
 * @param {object} p.compra         CompraRecente do par ou null
 * @param {number} p.shelf          shelf em dias (0 = sem cadastro)
 * @param {string} p.produtoCodigo  para o minimo de 2 un dos quatro codigos de caixa
 * @param {object} p.contagemAntiga { contadoEm } anterior a janela de 30 dias (so para "nao_contado"), ou null
 *
 * situacao (cabecalho de ItemLoja.js):
 *  - ruptura / zerado        : ultima contagem zero, com / sem em_ruptura = SIM (vence qualquer lote antigo:
 *                              a contagem mais recente diz que nao ha o produto)
 *  - rebaixa/giro/ok/sem_shelf: pior status entre os lotes vigentes
 *  - nao_reencontrado        : tem lote em 30 dias, nenhum vigente, algum saiu por nao reencontrado
 *                              (todos vencidos/zerados com ultima contagem > 0 = "zerado", lote encerrado)
 *  - sem_shelf               : contagem > 0 sem nenhum lote (sem validade): a quantidade contada fica como total
 *  - nao_contado             : sem contagem nos ultimos 30 dias (comprou em 90 dias)
 * quantidade = soma dos lotes vigentes em giro/rebaixa (todos, quando nenhum esta em acao), como no Painel.
 */
function classificarItem({ lotes = [], ultima = null, compra = null, shelf = 0, produtoCodigo = "", contagemAntiga = null } = {}) {
  const ls = (Array.isArray(lotes) ? lotes : []).map(normalizarLote);
  const vigentes = ls.filter((l) => l.vigente);
  const pesoMax = vigentes.reduce((m, l) => Math.max(m, l.peso), -1);
  const temAcao = pesoMax >= 2;
  for (const l of ls) l.entraNaSoma = l.vigente && (temAcao ? l.peso >= 2 : true);
  const usados = ls.filter((l) => l.entraNaSoma);

  let quantidadeTotal = vigentes.reduce((s, l) => s + l.quantidade, 0);
  let quantidade = usados.reduce((s, l) => s + l.quantidade, 0);
  let dataValidade = usados.reduce((m, l) => (l.dataValidade && (!m || l.dataValidade < m) ? l.dataValidade : m), null);
  let pctShelf = usados.reduce((m, l) => (l.pctShelf != null && (m == null || l.pctShelf > m) ? l.pctShelf : m), null);

  const ultimaQtd = ultima && ultima.quantidade != null ? Number(ultima.quantidade) || 0 : null;
  const comprou90d = !!(compra && (compra.ultimaCompraEm || Number(compra.qtd90d) > 0));

  let situacao;
  if (ultima && ultimaQtd === 0) {
    situacao = ultima.emRuptura ? "ruptura" : "zerado";
  } else if (vigentes.length) {
    situacao = STATUS_POR_PESO[pesoMax] || "sem_shelf";
  } else if (ls.length) {
    situacao = ls.some((l) => l.motivoSaida === "nao_reencontrado") ? "nao_reencontrado" : "zerado";
  } else if (ultima && ultimaQtd > 0) {
    // contado sem validade: ha produto, mas nenhum lote para classificar pelo shelf
    situacao = "sem_shelf";
    quantidade = ultimaQtd;
    quantidadeTotal = ultimaQtd;
  } else {
    situacao = "nao_contado";
  }

  const { diasParaVencer } = classificarPorValidade(dataValidade);
  const minimo = CODIGOS_LIMITE_2.includes(String(produtoCodigo)) ? 2 : 5;

  const lotesDoc = ls.map(({ peso, ...resto }) => resto);

  return {
    situacao,
    quantidade,
    quantidadeTotal,
    dataValidade,
    diasParaVencer,
    shelf: Number(shelf) || 0,
    pctShelf,
    abaixoMinimo: quantidadeTotal <= minimo,
    lotes: lotesDoc,
    ultimaContagemEm: ultima ? ultima.contadoEm || null : contagemAntiga ? contagemAntiga.contadoEm || null : null,
    ultimaContagemPor: ultima ? (ultima.agente ? String(ultima.agente).trim() : null) : null,
    ultimaContagemPorCodigo: ultima ? (ultima.agenteCodigo != null ? String(ultima.agenteCodigo).trim() : null) : null,
    ultimaContagemQtd: ultimaQtd,
    emRuptura: situacao === "ruptura",
    comprou90d,
    ultimaCompraEm: compra && compra.ultimaCompraEm ? new Date(compra.ultimaCompraEm) : null,
    qtd90d: compra ? Number(compra.qtd90d) || 0 : 0,
  };
}

/** Linha da consulta -> { ultima, lotes, shelf, nomes, visita } ja tipados. */
function lerLinhaBi(l) {
  return {
    clienteCodigo: String(l.codigo_destino || "").trim(),
    produtoCodigo: l.produto_codigo != null ? String(l.produto_codigo).trim() : "",
    cliente: l.nome_fantasia_dest ? String(l.nome_fantasia_dest).trim() : "",
    produto: l.produto_nome ? String(l.produto_nome).trim() : "",
    shelf: Number(l.shelf) || 0,
    lotes: Array.isArray(l.lotes) ? l.lotes : [],
    ultima: {
      quantidade: Number(l.ultima_qtd) || 0,
      emRuptura: l.ultima_ruptura === true || String(l.ultima_ruptura).toLowerCase() === "true",
      contadoEm: l.ultima_contado_em || null,
      agente: l.ultima_agente || null,
      agenteCodigo: l.ultima_agente_codigo,
    },
    ultimaVisitaEm: l.visita_em || null,
    ultimaVisitaPor: l.visita_por ? String(l.visita_por).trim() : null,
  };
}

/**
 * Rupturas ativas que uma contagem posterior com quantidade > 0 resolveu. Funcao pura.
 * @param {Array} ativas       documentos Ruptura com ativa = true
 * @param {Map}   itensPorPar  "cliente|produto" -> item classificado (ultimaContagemEm, ultimaContagemQtd)
 * @returns {Array<{ _id, resolvidaEm, resolvidaQtd }>}
 */
function rupturasResolvidas(ativas, itensPorPar) {
  const out = [];
  for (const r of ativas || []) {
    const it = itensPorPar.get(montarChave(r.clienteCodigo, r.produtoCodigo));
    if (!it || !it.ultimaContagemEm || it.ultimaContagemQtd == null) continue;
    if (it.ultimaContagemEm > r.contadoEm && Number(it.ultimaContagemQtd) > 0) {
      out.push({ _id: r._id, resolvidaEm: it.ultimaContagemEm, resolvidaQtd: Number(it.ultimaContagemQtd) });
    }
  }
  return out;
}

/**
 * Sincroniza a visao do vendedor: Carteira (so lojas da carteira entram) + BI (contagens de 30 dias)
 * + CompraRecente (compras de 90 dias) -> ItemLoja (um por loja x produto) e Ruptura.
 */
async function sincronizarVisaoLojas() {
  if (!pgConfigurado()) {
    return { itens: 0, observacao: "Postgres nao configurado — preencha PG_* no .env" };
  }
  const inicio = new Date();

  // (a) Carteira: mapa clienteCodigo -> rede/vendedor/supervisor. Loja fora da carteira e ignorada.
  const carteira = new Map();
  const linhasCarteira = await Carteira.find({}, "clienteCodigo clienteNome codigoRede redeSubrede subrede vendedorCodigo supervisorCodigo origem").lean();
  for (const c of linhasCarteira) {
    const cod = String(c.clienteCodigo || "").trim();
    if (!cod) continue;
    const atual = carteira.get(cod);
    // prefere a linha do Lacteus quando a mesma loja tambem esta numa rede criada no InfoVale
    if (!atual || (atual.origem === "infovale" && c.origem !== "infovale")) carteira.set(cod, c);
  }
  if (!carteira.size) {
    return { itens: 0, observacao: "Carteira vazia: sincronize a carteira antes da visao das lojas" };
  }

  // (b) BI: contagens dos ultimos 30 dias, sem descartar nada
  const linhasBi = await query(SQL_VISAO);
  const antigas = new Map();
  try {
    for (const r of await query(SQL_CONTAGEM_ANTIGA)) {
      antigas.set(montarChave(String(r.codigo_destino || "").trim(), String(r.produto_codigo || "").trim()), r.contado_em || null);
    }
  } catch (err) {
    console.error("[visaoLojas] contagens antigas indisponiveis (segue sem a data da ultima contagem):", err.message);
  }

  // (c) Compras dos ultimos 90 dias
  const compras = await CompraRecente.find({}, "chave clienteCodigo produtoCodigo produto ultimaCompraEm ultimoPreco qtd90d notas90d").lean();

  // (d) Uniao loja x produto
  const pares = new Map(); // chave -> { bi, compra }
  for (const l of linhasBi) {
    const bi = lerLinhaBi(l);
    if (!bi.clienteCodigo || !bi.produtoCodigo) continue;
    pares.set(montarChave(bi.clienteCodigo, bi.produtoCodigo), { bi, compra: null });
  }
  for (const c of compras) {
    const chave = montarChave(String(c.clienteCodigo).trim(), String(c.produtoCodigo).trim());
    const p = pares.get(chave);
    if (p) p.compra = c;
    else pares.set(chave, { bi: null, compra: c });
  }

  // Ultima visita por loja (vem nas linhas do BI; itens so de compra herdam a da loja)
  const visitas = new Map();
  for (const { bi } of pares.values()) {
    if (bi && bi.ultimaVisitaEm && !visitas.has(bi.clienteCodigo)) visitas.set(bi.clienteCodigo, { em: bi.ultimaVisitaEm, por: bi.ultimaVisitaPor });
  }

  const docs = [];
  const porSituacao = {};
  let foraDaCarteira = 0;
  for (const [chave, { bi, compra }] of pares) {
    const clienteCodigo = bi ? bi.clienteCodigo : String(compra.clienteCodigo).trim();
    const produtoCodigo = bi ? bi.produtoCodigo : String(compra.produtoCodigo).trim();
    const cart = carteira.get(clienteCodigo);
    if (!cart) { foraDaCarteira++; continue; }

    const cls = classificarItem({
      lotes: bi ? bi.lotes : [],
      ultima: bi ? bi.ultima : null,
      compra,
      shelf: bi ? bi.shelf : 0,
      produtoCodigo,
      contagemAntiga: !bi && antigas.has(chave) ? { contadoEm: antigas.get(chave) } : null,
    });
    const visita = visitas.get(clienteCodigo) || null;
    docs.push({
      chave,
      clienteCodigo,
      cliente: (bi && bi.cliente) || cart.clienteNome || "",
      produtoCodigo,
      produto: (bi && bi.produto) || (compra && compra.produto) || "",
      codigoRede: cart.codigoRede || null,
      redeSubrede: cart.redeSubrede || null,
      subrede: cart.subrede || null,
      vendedorCodigo: cart.vendedorCodigo || null,
      supervisorCodigo: cart.supervisorCodigo || null,
      ...cls,
      ultimaVisitaEm: visita ? visita.em : null,
      ultimaVisitaPor: visita ? visita.por : null,
      sincronizadoEm: inicio,
    });
    porSituacao[cls.situacao] = (porSituacao[cls.situacao] || 0) + 1;
  }

  // (e) Espelho: upsert por chave em lotes de 1000 e remocao do que nao voltou
  let upserts = 0;
  for (let i = 0; i < docs.length; i += 1000) {
    const ops = docs.slice(i, i + 1000).map((d) => ({
      updateOne: { filter: { chave: d.chave }, update: { $set: d }, upsert: true },
    }));
    const r = await ItemLoja.bulkWrite(ops, { ordered: false });
    upserts += (r.upsertedCount || 0) + (r.modifiedCount || 0);
  }
  const del = await ItemLoja.deleteMany({ sincronizadoEm: { $lt: inicio } });

  // (f) Rupturas: abre para cada item em ruptura (uma por loja x produto enquanto durar) e fecha as que
  // receberam contagem posterior com quantidade > 0
  const ativas = await Ruptura.find({ ativa: true }).lean();
  const ativaPorPar = new Set(ativas.map((r) => montarChave(r.clienteCodigo, r.produtoCodigo)));
  const abrir = [];
  for (const d of docs) {
    if (d.situacao !== "ruptura" || !d.ultimaContagemEm) continue;
    const par = montarChave(d.clienteCodigo, d.produtoCodigo);
    if (ativaPorPar.has(par)) continue; // ja aberta: mantem a original (e o "pedido feito" dela)
    abrir.push({
      updateOne: {
        filter: { chave: `${par}|${d.ultimaContagemEm}` },
        update: {
          $set: {
            clienteCodigo: d.clienteCodigo, cliente: d.cliente, produtoCodigo: d.produtoCodigo, produto: d.produto,
            codigoRede: d.codigoRede, redeSubrede: d.redeSubrede, vendedorCodigo: d.vendedorCodigo, supervisorCodigo: d.supervisorCodigo,
            contadoEm: d.ultimaContagemEm, contadoPor: d.ultimaContagemPor, contadoPorCodigo: d.ultimaContagemPorCodigo,
            ativa: true, resolvidaEm: null, resolvidaQtd: null,
          },
        },
        upsert: true,
      },
    });
  }
  let abertas = 0;
  for (let i = 0; i < abrir.length; i += 1000) {
    const r = await Ruptura.bulkWrite(abrir.slice(i, i + 1000), { ordered: false });
    abertas += r.upsertedCount || 0;
  }

  const itensPorPar = new Map(docs.map((d) => [montarChave(d.clienteCodigo, d.produtoCodigo), d]));
  const resolver = rupturasResolvidas(ativas, itensPorPar);
  if (resolver.length) {
    await Ruptura.bulkWrite(resolver.map((r) => ({
      updateOne: { filter: { _id: r._id }, update: { $set: { ativa: false, resolvidaEm: r.resolvidaEm, resolvidaQtd: r.resolvidaQtd } } },
    })), { ordered: false });
  }

  return {
    lojas: new Set(docs.map((d) => d.clienteCodigo)).size,
    itens: docs.length,
    contagensBi: linhasBi.length,
    comprasLidas: compras.length,
    foraDaCarteira,
    upserts,
    removidos: del.deletedCount || 0,
    porSituacao,
    rupturas: { abertas, resolvidas: resolver.length, ativas: ativas.length - resolver.length + abertas },
  };
}

module.exports = {
  sincronizarVisaoLojas,
  classificarItem,
  rupturasResolvidas,
  lerLinhaBi,
  normalizarLote,
  montarChave,
  SQL_VISAO,
  SQL_CONTAGEM_ANTIGA,
  JANELA_DIAS,
  DIAS_SEM_RECONTAGEM,
  CODIGOS_LIMITE_2,
};
