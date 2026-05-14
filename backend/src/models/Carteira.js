const mongoose = require("mongoose");

/**
 * Carteira: relacionamento Cliente <-> Vendedor <-> Supervisor.
 * Preenchida via query do ERP (SQL Server na VPS).
 */
const carteiraSchema = new mongoose.Schema(
  {
    clienteCodigo:    { type: String, required: true, index: true },
    clienteNome:      { type: String },
    vendedorCodigo:   { type: String, index: true },
    vendedorNome:     { type: String },
    supervisorCodigo: { type: String, index: true },
    supervisorNome:   { type: String },
    sincronizadoEm:   { type: Date, default: Date.now },
  },
  { timestamps: true }
);

carteiraSchema.index({ clienteCodigo: 1, vendedorCodigo: 1 }, { unique: true });

module.exports = mongoose.model("Carteira", carteiraSchema);
