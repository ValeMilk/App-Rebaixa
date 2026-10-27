const mongoose = require("mongoose");

/**
 * Ruptura (v2.0): o promotor contou ZERO e marcou ruptura no Ativmob (em_ruptura = "SIM").
 * Zero sem ruptura NAO entra aqui (e "lote encerrado"). Um documento por loja x produto x contagem
 * que abriu a ruptura; sai da lista (ativa = false) quando uma contagem posterior mostra quantidade > 0.
 * O vendedor registra "pedido feito" (conta como acao no acompanhamento das pendencias).
 */
const rupturaSchema = new mongoose.Schema(
  {
    chave: { type: String, required: true, unique: true, index: true }, // "clienteCodigo|produtoCodigo|contadoEm"
    clienteCodigo: { type: String, required: true, index: true },
    cliente: { type: String, default: "" },
    produtoCodigo: { type: String, required: true, index: true },
    produto: { type: String, default: "" },
    codigoRede: { type: String, default: null, index: true },
    redeSubrede: { type: String, default: null },
    vendedorCodigo: { type: String, default: null, index: true },
    supervisorCodigo: { type: String, default: null, index: true },

    contadoEm: { type: String, required: true }, // "AAAA-MM-DDTHH:MM"
    contadoPor: { type: String, default: null },
    contadoPorCodigo: { type: String, default: null },

    ativa: { type: Boolean, default: true, index: true },
    resolvidaEm: { type: String, default: null }, // contagem posterior com quantidade > 0 ("AAAA-MM-DDTHH:MM")
    resolvidaQtd: { type: Number, default: null },

    pedidoFeito: {
      em: { type: Date, default: null },
      porUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      porNome: { type: String, default: null },
      observacao: { type: String, default: null },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Ruptura", rupturaSchema);
