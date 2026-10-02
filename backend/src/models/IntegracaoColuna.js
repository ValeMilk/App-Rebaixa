const mongoose = require("mongoose");

/**
 * Sinonimo de coluna aprendido por rede (cliente): "esta coluna, chamada assim, e este campo".
 * `campo` e a chave de um campo do sistema OU de um campo personalizado; null quando a coluna
 * foi marcada para ser ignorada. Salvar de novo o mesmo cabecalho ATUALIZA a associacao.
 */
const colunaSchema = new mongoose.Schema(
  {
    codigoRede:           { type: String, required: true },
    tipoArquivo:          { type: String, default: "estoque" },
    cabecalhoNormalizado: { type: String, required: true },
    cabecalhoOriginal:    { type: String },
    campo:                { type: String, default: null },
    ignorar:              { type: Boolean, default: false },
    atualizadoPorNome:    { type: String },
  },
  { timestamps: true }
);

colunaSchema.index({ codigoRede: 1, tipoArquivo: 1, cabecalhoNormalizado: 1 }, { unique: true });

module.exports = mongoose.model("IntegracaoColuna", colunaSchema);
