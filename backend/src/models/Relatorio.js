const mongoose = require("mongoose");

/**
 * Relatorio importado pelo admin a partir de um PDF: cada pagina vira uma imagem
 * (ver RelatorioPagina) e os usuarios com a permissao "relatorios.ver" so visualizam.
 * Nasce como rascunho (paginas sendo enviadas) e so aparece para os demais depois de publicado.
 */
const relatorioSchema = new mongoose.Schema(
  {
    titulo:          { type: String, required: true, trim: true },
    referencia:      { type: String, default: null }, // mes de referencia "AAAA-MM" (opcional)
    arquivoNome:     { type: String, default: null }, // nome do PDF de origem
    totalPaginas:    { type: Number, required: true },
    publicado:       { type: Boolean, default: false, index: true },
    criadoPorId:     { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    criadoPorNome:   { type: String },
    publicadoEm:     { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Relatorio", relatorioSchema);
