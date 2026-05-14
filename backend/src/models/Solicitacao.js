const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema(
  {
    produto: { type: String, required: true },
    produtoCodigo: { type: String },
    quantidade: { type: Number, required: true },
    dataValidade: { type: Date },
    diasParaVencer: { type: Number },
    precoTabela: { type: Number },
    precoOferta: { type: Number },
    sellout: { type: Number },
    margemCalculada: { type: Number },
    precoAtual: { type: Number },
    precoSugerido: { type: Number },
    descontoPercentual: { type: Number },
    estoqueRefId: { type: mongoose.Schema.Types.ObjectId, ref: "Estoque" },
  },
  { _id: false }
);

const historicoSchema = new mongoose.Schema(
  {
    acao: { type: String, required: true }, // criada, aprovada, rejeitada, comentario
    porUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    porNome: String,
    porRole: String,
    comentario: String,
    em: { type: Date, default: Date.now },
  },
  { _id: false }
);

const solicitacaoSchema = new mongoose.Schema(
  {
    tipo: {
      type: String,
      enum: ["rebaixa", "oferta_interna"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pendente_supervisor", "aprovado_supervisor", "aprovado_final", "rejeitado", "cancelado"],
      default: "pendente_supervisor",
      index: true,
    },

    cliente: { type: String, required: true },
    clienteCodigo: { type: String, required: true, index: true },

    criadoPorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    criadoPorNome: { type: String },
    criadoPorRole: { type: String },
    criadoPorCodigo: { type: String },

    supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    supervisorNome: { type: String },
    supervisorCodigo: { type: String, index: true },

    itens: { type: [itemSchema], default: [] },

    motivo: { type: String },
    observacoes: { type: String },

    aprovadoPorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    aprovadoPorNome: String,
    aprovadoEm: Date,
    motivoDecisao: String,

    historico: { type: [historicoSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Solicitacao", solicitacaoSchema);
