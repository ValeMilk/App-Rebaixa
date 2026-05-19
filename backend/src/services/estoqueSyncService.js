const Estoque = require("../models/Estoque");
const { buscarEventosEstoque } = require("./ativmobService");
const { eventosParaEstoque } = require("./classificadorService");

/**
 * Sincroniza eventos da ATIVMOB para a colecao Estoque.
 * Janela: ultimos 8 dias de atividades (hoje-8 ate hoje).
 * As contagens antigas ja sincronizadas continuam no Mongo via upsert por eventId.
 * O filtro de exibicao (no controller) usa dataValidade entre hoje+5 e hoje+40,
 * entao mesmo uma contagem feita semana retrasada continua aparecendo se a
 * validade do produto cair nessa janela.
 */
async function sincronizarEstoque() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Janela de busca na ATIVMOB: hoje-8 ate hoje
  const desde = new Date(hoje);
  desde.setDate(desde.getDate() - 8);

  const ate = new Date(hoje);
  ate.setDate(ate.getDate() + 1); // inclui o dia de hoje inteiro

  const eventos = await buscarEventosEstoque({ desde, ate });
  if (!eventos.length) {
    return { eventosBaixados: 0, upserts: 0 };
  }

  const docs = eventosParaEstoque(eventos);

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

  return { eventosBaixados: eventos.length, upserts };
}

module.exports = { sincronizarEstoque };
