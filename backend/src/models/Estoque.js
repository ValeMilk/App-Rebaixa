const mongoose = require("mongoose");

/**
 * Cada documento eh um item de estoque critico (um produto num cliente).
 * Origem: view public.vw_ativmob_estoque_critico no Postgres de BI (VPS) —
 * ja aplica a definicao de "critico" (visita recente, limite por produto,
 * nao vencido). Um documento por chave (clienteCodigo+produtoCodigo);
 * quantidade = soma dos lotes em giro/rebaixa, dataValidade = a mais proxima
 * entre eles; `lotes` guarda o detalhe (inclusive os lotes ok, fora da soma).
 * A cada sync o que nao aparece mais na view eh removido (espelho).
 */

// Lote do item (uma data de validade), com quem contou. `entraNaSoma`: compoe a quantidade do item.
const loteSchema = new mongoose.Schema(
  {
    dataValidade: { type: Date },
    quantidade: { type: Number, default: 0 },
    status: { type: String, enum: ["rebaixa", "giro", "ok", "sem_shelf"] },
    entraNaSoma: { type: Boolean, default: true },
    agente: { type: String, default: null },
    agenteCodigo: { type: String, default: null },
    contadoEm: { type: String, default: null }, // "AAAA-MM-DDTHH:MM": hora de relogio da contagem
    naUltimaVisita: { type: Boolean, default: true }, // false: lote de visita anterior, nao recontado
  },
  { _id: false }
);

const estoqueSchema = new mongoose.Schema(
  {
    chave: { type: String, required: true, unique: true, index: true },

    cliente: { type: String, required: true, index: true },
    clienteCodigo: { type: String, required: true, index: true },

    produto: { type: String, required: true, index: true },
    produtoCodigo: { type: String, index: true },

    quantidade: { type: Number, default: 0 },
    dataValidade: { type: Date, index: true },

    diasParaVencer: { type: Number, index: true },
    classificacao: {
      type: String,
      enum: ["vencido", "critico", "alerta", "atencao", "ok"],
      index: true,
    },

    // Regua por shelf life, calculada na query do Postgres (estoqueSyncService)
    shelf: { type: Number, default: 0 },
    pctShelf: { type: Number },
    statusShelf: { type: String, enum: ["rebaixa", "giro", "ok", "sem_shelf"], index: true },

    // Detalhe da contagem (estoqueSyncService): todos os lotes do item e a contagem mais recente usada
    lotes: { type: [loteSchema], default: [] },
    lotesNaSoma: { type: Number, default: 1 },
    contadoPor: { type: String, default: null },
    contadoPorCodigo: { type: String, default: null },
    contadoEm: { type: String, default: null },
    // Ultima visita do promotor a loja (qualquer produto): "AAAA-MM-DDTHH:MM" e quem foi
    ultimaVisitaEm: { type: String, default: null },
    ultimaVisitaPor: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Estoque", estoqueSchema);
