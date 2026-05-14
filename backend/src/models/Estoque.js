const mongoose = require("mongoose");

/**
 * Cada documento eh um snapshot de "produto na loja em uma data".
 * Origem: ATIVMOB - evento ESTOQUE E VENCIMENTO.
 */
const estoqueSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    eventDth: { type: Date, required: true, index: true },

    cliente: { type: String, required: true, index: true },
    clienteCodigo: { type: String, required: true, index: true },

    promotor: { type: String },

    produto: { type: String, required: true, index: true },
    produtoCodigo: { type: String, index: true },

    quantidade: { type: Number, default: 0 },
    dataValidade: { type: Date, index: true },
    ruptura: { type: Boolean, default: false },

    diasParaVencer: { type: Number, index: true },
    classificacao: {
      type: String,
      enum: ["vencido", "critico", "alerta", "atencao", "ok"],
      index: true,
    },

    linkRastreamento: { type: String },
    raw: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

estoqueSchema.index({ clienteCodigo: 1, produto: 1, eventDth: -1 });

module.exports = mongoose.model("Estoque", estoqueSchema);
