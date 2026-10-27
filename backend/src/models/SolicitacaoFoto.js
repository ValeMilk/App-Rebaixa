const mongoose = require("mongoose");

/**
 * Foto tirada na hora (camera do celular) ao abrir uma solicitacao contra concorrente (v2.0, fase 2).
 * Guardada fora do documento da solicitacao para nao pesar as listas. Comprimida no navegador antes
 * de subir (JPEG, lado maior 1280 px).
 */
const solicitacaoFotoSchema = new mongoose.Schema(
  {
    solicitacaoId: { type: mongoose.Schema.Types.ObjectId, ref: "Solicitacao", required: true, unique: true, index: true },
    mime: { type: String, default: "image/jpeg" },
    tamanho: { type: Number, default: 0 },
    dados: { type: Buffer, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SolicitacaoFoto", solicitacaoFotoSchema);
