const mongoose = require("mongoose");

/**
 * Permissoes de um perfil, quando o administrador editou o padrao (ver constants/permissoes.js).
 * `conhecidas` = chaves que existiam no catalogo quando o perfil foi salvo: uma permissao criada
 * depois (fora dessa lista) vale pelo padrao, em vez de nascer desligada.
 */
const perfilPermissaoSchema = new mongoose.Schema(
  {
    perfil: { type: String, required: true, unique: true, enum: ["vendedor", "supervisor", "diretoria"] },
    permissoes: { type: [String], default: [] },
    conhecidas: { type: [String], default: [] },
    atualizadoPorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    atualizadoPorNome: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PerfilPermissao", perfilPermissaoSchema);
