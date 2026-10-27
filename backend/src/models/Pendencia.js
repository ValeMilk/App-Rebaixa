const mongoose = require("mongoose");

/**
 * Pendencia de contagem (v2.0): criada UMA vez por loja + produto + lote + evento quando uma contagem
 * entra em giro, rebaixa ou ruptura. Se a situacao piora (giro -> rebaixa) nasce outra (evento diferente).
 * Vai ao mesmo tempo para o vendedor e o supervisor da loja (destinatarios); cada um tem o seu
 * "vista em". Quando um deles age, a acao fica registrada e o outro ve quem agiu.
 */
const destinatarioSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    codigo: { type: String, default: null },
    nome: { type: String, default: null },
    papel: { type: String, enum: ["vendedor", "supervisor"], required: true },
    enviadaEm: { type: Date, default: Date.now },
    vistaEm: { type: Date, default: null },
    pushEnviadoEm: { type: Date, default: null },
    pushErro: { type: String, default: null },
  },
  { _id: false }
);

const pendenciaSchema = new mongoose.Schema(
  {
    // "clienteCodigo|produtoCodigo|<validade AAAA-MM-DD ou contadoEm da ruptura>|evento"
    chave: { type: String, required: true, unique: true, index: true },
    evento: { type: String, enum: ["rebaixa", "giro", "ruptura"], required: true, index: true },

    clienteCodigo: { type: String, required: true, index: true },
    cliente: { type: String, default: "" },
    produtoCodigo: { type: String, required: true, index: true },
    produto: { type: String, default: "" },
    codigoRede: { type: String, default: null },
    redeSubrede: { type: String, default: null },

    dataValidade: { type: Date, default: null },
    quantidade: { type: Number, default: 0 },
    pctShelf: { type: Number, default: null },
    contadoEm: { type: String, default: null }, // "AAAA-MM-DDTHH:MM"
    contadoPor: { type: String, default: null },

    destinatarios: { type: [destinatarioSchema], default: [] },

    acao: {
      tipo: { type: String, enum: [null, "solicitacao", "pedido_feito", "ja_resolvi"], default: null },
      porUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      porNome: { type: String, default: null },
      porPapel: { type: String, default: null },
      em: { type: Date, default: null },
      motivo: { type: String, default: null },
      solicitacaoId: { type: mongoose.Schema.Types.ObjectId, ref: "Solicitacao", default: null },
    },

    // Push adiado pelo horario de silencio (21h-7h): enviado pelo job das 7h
    pushPendente: { type: Boolean, default: false, index: true },

    // Giro que virou rebaixa no mesmo lote: a pendencia de giro aponta para a de rebaixa e sai
    // da lista aberta e do acompanhamento (para nao contar duas vezes)
    superadaPor: { type: mongoose.Schema.Types.ObjectId, ref: "Pendencia", default: null, index: true },
    superadaEm: { type: Date, default: null },
  },
  { timestamps: true }
);

pendenciaSchema.index({ "destinatarios.userId": 1, createdAt: -1 });
pendenciaSchema.index({ clienteCodigo: 1, produtoCodigo: 1, "acao.tipo": 1 });

module.exports = mongoose.model("Pendencia", pendenciaSchema);
