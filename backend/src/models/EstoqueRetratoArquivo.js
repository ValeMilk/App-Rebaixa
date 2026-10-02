const mongoose = require("mongoose");

/** Arquivo original de um retrato (auditoria: toda celula exibida e rastreavel ate ele). */
const arquivoSchema = new mongoose.Schema(
  {
    retratoId:   { type: mongoose.Schema.Types.ObjectId, ref: "EstoqueRetrato", required: true, unique: true },
    nomeArquivo: { type: String, required: true },
    conteudo:    { type: Buffer, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EstoqueRetratoArquivo", arquivoSchema);
