const mongoose = require("mongoose");

/**
 * Cada documento eh um item de estoque critico (um produto num cliente).
 * Origem: view public.vw_ativmob_estoque_critico no Postgres de BI (VPS) —
 * ja aplica a definicao de "critico" (visita recente, limite por produto,
 * nao vencido). Um documento por chave (clienteCodigo+produtoCodigo);
 * quantidade = soma de todos os lotes criticos, dataValidade = a mais proxima
 * entre eles. A cada sync o que nao aparece mais na view eh removido (espelho).
 */
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

    raw: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Estoque", estoqueSchema);
