const mongoose = require("mongoose");

/** Imagem de uma pagina do relatorio. `numero` 0 = miniatura (capa da listagem); 1..N = paginas. */
const relatorioPaginaSchema = new mongoose.Schema(
  {
    relatorioId: { type: mongoose.Schema.Types.ObjectId, ref: "Relatorio", required: true },
    numero:      { type: Number, required: true },
    origem:      { type: String, default: null }, // nome do PDF de que a pagina veio (um relatorio pode juntar varios)
    mime:        { type: String, required: true },
    largura:     { type: Number, default: null },
    altura:      { type: Number, default: null },
    dados:       { type: Buffer, required: true },
  },
  { timestamps: true }
);

relatorioPaginaSchema.index({ relatorioId: 1, numero: 1 }, { unique: true });

module.exports = mongoose.model("RelatorioPagina", relatorioPaginaSchema);
