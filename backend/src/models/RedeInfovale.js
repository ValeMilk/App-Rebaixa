const mongoose = require("mongoose");

/**
 * Rede criada dentro do InfoVale, para lojas que existem no Ativmob mas nao no Lacteus
 * (por isso nao chegam pela carteira do ERP). Cada rede tem um ou mais supervisores e uma
 * lista de lojas; ela e copiada para a Carteira (origem "infovale") a cada gravacao e depois
 * de cada sincronizacao da carteira, de modo que o resto do sistema a enxerga como rede comum.
 */
const redeInfovaleSchema = new mongoose.Schema(
  {
    codigoRede: { type: String, required: true, unique: true }, // "IV1", "IV2"... (nunca colide com o Lacteus, que e numerico)
    nome: { type: String, required: true, trim: true },
    supervisores: [
      {
        _id: false,
        id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        codigo: { type: String, required: true },
        nome: { type: String },
      },
    ],
    lojas: [
      {
        _id: false,
        clienteCodigo: { type: String, required: true },
        clienteNome: { type: String },
      },
    ],
    criadoPorNome: { type: String },
    atualizadoPorNome: { type: String },
  },
  { timestamps: true }
);

redeInfovaleSchema.index({ "lojas.clienteCodigo": 1 });

module.exports = mongoose.model("RedeInfovale", redeInfovaleSchema);
