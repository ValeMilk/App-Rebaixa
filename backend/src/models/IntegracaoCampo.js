const mongoose = require("mongoose");

/**
 * Campo personalizado por rede: dado que o arquivo trouxe e o modelo original nao previa
 * (ex.: "Estoque em transito"). O valor nao entra em nenhum calculo; fica em `extras` da linha.
 * Nenhuma coluna de banco nasce em tempo de execucao.
 */
const campoSchema = new mongoose.Schema(
  {
    codigoRede:    { type: String, required: true },
    tipoArquivo:   { type: String, default: "estoque" },
    chave:         { type: String, required: true },
    rotulo:        { type: String, required: true },
    tipoValor:     { type: String, enum: ["numero", "texto", "data"], default: "numero" },
    criadoPorNome: { type: String },
  },
  { timestamps: true }
);

campoSchema.index({ codigoRede: 1, tipoArquivo: 1, chave: 1 }, { unique: true });

module.exports = mongoose.model("IntegracaoCampo", campoSchema);
