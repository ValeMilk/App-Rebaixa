const mongoose = require("mongoose");

/**
 * Catalogo de produtos do ERP Esigma (segundo ERP, separado do Lacteus).
 * Sem precos (tabela/minimo/promo/custo) — a precificacao dos itens de
 * encarte para produtos Esigma e feita manualmente pelo usuario.
 */
const produtoEsigmaSchema = new mongoose.Schema(
  {
    codigo:         { type: String, required: true, unique: true, index: true },
    descricao:      { type: String, required: true },
    categoria:      { type: String, default: null },
    subcategoria:   { type: String, default: null },
    ativo:          { type: Boolean, default: true },
    sincronizadoEm: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProdutoEsigma", produtoEsigmaSchema);
