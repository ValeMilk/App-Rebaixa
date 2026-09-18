const Estoque = require("../models/Estoque");
const { query, pgConfigurado } = require("./estoquePgDbService");
const { classificarPorValidade } = require("./classificadorService");

/**
 * Fonte: Postgres de BI na VPS (tabela public.ativmob_estoque) — espelho das
 * mesmas colunas que a API da ATIVMOB expunha via evento (event_id, event_dth,
 * agent_name, em_ruptura, link_rastreamento etc, com o antigo form_json ja
 * achatado em colunas). So traz produtos ainda nao vencidos (data_validade > hoje).
 */
const SQL_ESTOQUE = `
SELECT
    event_id,
    event_dth,
    codigo_destino,
    nome_fantasia_dest,
    agent_name,
    produto_nome,
    produto_codigo,
    quantidade,
    data_validade,
    em_ruptura,
    link_rastreamento
FROM public.ativmob_estoque
WHERE data_validade > CURRENT_DATE;
`;

/**
 * Sincroniza estoque/validade a partir do Postgres de BI.
 * Mesma estrategia de antes (upsert por eventId, em lotes) — a fonte mudou
 * (Postgres em vez da API REST da ATIVMOB), mas o formato/semantica dos
 * dados e o mesmo: um documento por leitura/evento, historico preservado.
 * A tela de Estoque (estoqueController) ja pega so a leitura mais recente
 * por (clienteCodigo, produto) na hora de exibir.
 */
async function sincronizarEstoque() {
  if (!pgConfigurado()) {
    return { eventosBaixados: 0, upserts: 0, observacao: "Postgres nao configurado — preencha PG_* no .env" };
  }

  const linhas = await query(SQL_ESTOQUE);
  if (!linhas.length) {
    return { eventosBaixados: 0, upserts: 0 };
  }

  const docs = linhas.map((l) => {
    const dataValidade = l.data_validade ? new Date(l.data_validade) : null;
    const { diasParaVencer, classificacao } = classificarPorValidade(dataValidade);

    return {
      eventId: String(l.event_id),
      eventDth: l.event_dth ? new Date(l.event_dth) : new Date(),
      cliente: l.nome_fantasia_dest || "",
      clienteCodigo: String(l.codigo_destino || ""),
      promotor: l.agent_name || "",
      produto: l.produto_nome || "",
      produtoCodigo: l.produto_codigo != null ? String(l.produto_codigo) : null,
      quantidade: Number(l.quantidade) || 0,
      dataValidade,
      ruptura: String(l.em_ruptura || "").toUpperCase().includes("SIM"),
      diasParaVencer,
      classificacao,
      linkRastreamento: l.link_rastreamento || null,
      raw: l,
    };
  });

  const ops = docs.map((d) => ({
    updateOne: {
      filter: { eventId: d.eventId },
      update: { $set: d },
      upsert: true,
    },
  }));

  // Bulk em lotes de 1000 para evitar payloads enormes.
  let upserts = 0;
  for (let i = 0; i < ops.length; i += 1000) {
    const r = await Estoque.bulkWrite(ops.slice(i, i + 1000), { ordered: false });
    upserts += (r.upsertedCount || 0) + (r.modifiedCount || 0);
  }

  return { eventosBaixados: linhas.length, upserts };
}

module.exports = { sincronizarEstoque };
