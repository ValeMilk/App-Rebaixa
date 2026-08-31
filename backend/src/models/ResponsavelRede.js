const mongoose = require("mongoose");

/**
 * Override opcional de responsabilidade por Rede.
 * Quando existir registro para um codigoRede, o supervisor referenciado
 * passa a ver TODAS as solicitacoes daquela rede e e o unico que decide
 * na etapa de supervisor (sobrepondo a regra padrao de carteira).
 * Redes sem registro aqui seguem a regra padrao (carteira).
 */
const responsavelRedeSchema = new mongoose.Schema(
  {
    codigoRede:       { type: String, required: true, unique: true, index: true },
    redeSubrede:      { type: String, default: null },
    supervisorId:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    supervisorCodigo: { type: String, required: true, index: true },
    supervisorNome:   { type: String, required: true },
    criadoPorId:      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    criadoPorNome:    { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ResponsavelRede", responsavelRedeSchema);
