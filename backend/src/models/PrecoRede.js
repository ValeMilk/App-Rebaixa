const mongoose = require("mongoose");

/**
 * Tabela de preco por REDE do Lacteus (E08 + A16): P#1 (tabela da rede), P#2 (oferta interna) e
 * P#3 (rebaixa) de cada item. Conferido em 27/10/2026: o P#1 por rede e usado no faturamento
 * (Mix Mateus paga 2,50 no iogurte 187201 contra 2,90 da Tabela 70); P#2/P#3 por rede o comercial
 * passa a preencher na mesma tela do Lacteus. Sincronizado com o catalogo de produtos.
 */
const precoRedeSchema = new mongoose.Schema(
  {
    codigoRede: { type: String, required: true, index: true }, // A16_ID como string
    produtoCodigo: { type: String, required: true, index: true }, // E02_LIVRE
    p1: { type: Number, default: 0 },
    p2: { type: Number, default: 0 },
    p3: { type: Number, default: 0 },
    p4: { type: Number, default: 0 },
    sincronizadoEm: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

precoRedeSchema.index({ codigoRede: 1, produtoCodigo: 1 }, { unique: true });

module.exports = mongoose.model("PrecoRede", precoRedeSchema);
