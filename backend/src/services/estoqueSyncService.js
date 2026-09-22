const Estoque = require("../models/Estoque");
const { query, pgConfigurado } = require("./estoquePgDbService");
const { classificarPorValidade } = require("./classificadorService");

/**
 * Fonte: view public.vw_ativmob_estoque_critico no Postgres de BI (VPS) —
 * ja aplica a definicao de negocio de "critico" (ultima visita nos ultimos
 * 15 dias, limite de quantidade variavel por produto, nao vencido). O app
 * nao re-filtra por cima, confia integralmente no que a view devolve.
 * Uma linha por cliente+produto: quantidade = estoque total somando todos
 * os lotes criticos daquele produto no cliente, data_validade = a validade
 * mais proxima entre eles (a mais urgente).
 */
const SQL_ESTOQUE = `
SELECT
    codigo_destino,
    MAX(nome_fantasia_dest) AS nome_fantasia_dest,
    produto_codigo,
    MAX(produto_nome) AS produto_nome,
    MAX(estoque_total) AS quantidade,
    MIN(data_validade) AS data_validade
FROM public.vw_ativmob_estoque_critico
GROUP BY codigo_destino, produto_codigo
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
