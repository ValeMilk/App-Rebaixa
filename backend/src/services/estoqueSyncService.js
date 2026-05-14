const Estoque = require("../models/Estoque");
const { buscarEventosEstoque } = require("./ativmobService");
const { eventosParaEstoque } = require("./classificadorService");

/**
 * Sincroniza eventos da ATIVMOB para a colecao Estoque.
 * Janela fixa: inicio do dia de hoje ate hoje + 30 dias.
 */
async function sincronizarEstoque() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Janela: 90 dias atras ate hoje+31 dias
  // Pega todo estoque existente + proximos vencimentos
  const desde = new Date(hoje);
  desde.setDate(desde.getDate() - 90);

  const ate = new Date(hoje);
  ate.setDate(ate.getDate() + 31);

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
