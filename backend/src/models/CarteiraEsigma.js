const mongoose = require("mongoose");

/**
 * Carteira de clientes do ERP Esigma (segundo ERP, separado do Lacteus).
 * Sem conceito de rede/subrede na origem — na tela de Encartes esses clientes
 * sao tratados como subredes de uma unica rede sintetica ("ESIGMA").
 * Sincronizacao: deleta todos os registros e reinsere dados do Esigma a cada sincronizacao.
 */
const carteiraEsigmaSchema = new mongoose.Schema(
  {
    clienteCodigo:    { type: String, required: true, index: true },
    clienteNome:      { type: String },
    codRota:          { type: String, default: null },
    supervisorCodigo: { type: String, default: null, index: true },
    supervisorNome:   { type: String },
    vendedorCodigo:   { type: String, default: null, index: true },
    vendedorNome:     { type: String },
    sincronizadoEm:   { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CarteiraEsigma", carteiraEsigmaSchema);
