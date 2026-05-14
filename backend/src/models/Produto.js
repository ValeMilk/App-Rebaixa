const mongoose = require("mongoose");

/**
 * Catalogo de produtos com tabela de precos.
 * Sincronizado via query do ERP (SQL Server na VPS).
 * Usado como referencia para calcular percentual de rebaixa nas solicitacoes.
 */
const produtoSchema = new mongoose.Schema(
  {
    codigo:       { type: String, required: true, unique: true, index: true },
    codigoLivre:  { type: String, index: true },
    descricao:    { type: String, required: true },
    categoria:    { type: String, index: true },

    // Tabela de precos do ERP
    precoTabela:  { type: Number, default: 0 },  // E02_PRECO  (TABELA_70)
    precoMinimo:  { type: Number, default: 0 },  // E02_PRECO_02 (MINIMO)
    precoPromo:   { type: Number, default: 0 },  // E02_PRECO_03 (PROMO)
    custo:        { type: Number, default: 0 },  // E02_CUSTO_LIVRE

    sincronizadoEm: { type: Date, default: Date.now },
    ativo:          { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Produto", produtoSchema);
