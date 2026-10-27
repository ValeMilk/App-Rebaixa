const mongoose = require("mongoose");

/**
 * Compras dos ultimos 90 dias por loja x produto (notas do Lacteus: M00/M01, mesmas operacoes e
 * filtros da ultima compra). Base da lista "todos os itens" da visao do vendedor (ItemLoja).
 * Atualizada uma vez por dia (comprasRecentesService) e sob demanda pela Sincronizacao.
 */
const compraRecenteSchema = new mongoose.Schema(
  {
    chave: { type: String, required: true, unique: true, index: true }, // "clienteCodigo|produtoCodigo"
    clienteCodigo: { type: String, required: true, index: true },
    produtoCodigo: { type: String, required: true, index: true }, // E02_LIVRE
    produto: { type: String, default: "" },
    ultimaCompraEm: { type: Date, default: null },
    ultimoPreco: { type: Number, default: null },
    qtd90d: { type: Number, default: 0 },
    notas90d: { type: Number, default: 0 },
    sincronizadoEm: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CompraRecente", compraRecenteSchema);
