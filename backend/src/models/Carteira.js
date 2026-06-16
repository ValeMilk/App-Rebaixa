const mongoose = require("mongoose");

/**
 * Carteira: relacionamento Cliente <-> Vendedor <-> Supervisor.
 * Preenchida via query do ERP (SQL Server na VPS).
 * Sincronização: deleta todos os registros e reinsere dados do ERP a cada sincronização.
 */
const carteiraSchema = new mongoose.Schema(
  {
    clienteCodigo:    { type: String, required: true, index: true },
    clienteNome:      { type: String },
    vendedorCodigo:   { type: String, index: true },
    vendedorNome:     { type: String },
    supervisorCodigo: { type: String, index: true },
    supervisorNome:   { type: String },
    codigoRede:       { type: String, default: null, index: true },
    redeSubrede:      { type: String, default: null },
    sincronizadoEm:   { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Carteira", carteiraSchema);
