const mongoose = require("mongoose");

/**
 * Cadastro de lojas da rede (cliente) como ela as identifica no arquivo.
 * `codigo` e a CHAVE (codigo da loja no cadastro do cliente); o nome do arquivo e so descritivo
 * e varia entre remessas. Nenhuma loja nasce sozinha: so entra por cadastro explicito.
 */
const lojaSchema = new mongoose.Schema(
  {
    codigoRede:    { type: String, required: true },
    codigo:        { type: String, required: true },   // codigo da loja no arquivo do cliente
    nome:          { type: String, required: true },   // nome interno (sugerido e editado por quem cadastra)
    razaoSocial:   { type: String },                   // como veio no arquivo no momento do cadastro
    clienteCodigo: { type: String, default: null },    // vinculo opcional com a Carteira (uso futuro)
    criadoPorNome: { type: String },
  },
  { timestamps: true }
);

lojaSchema.index({ codigoRede: 1, codigo: 1 }, { unique: true });

module.exports = mongoose.model("IntegracaoLoja", lojaSchema);
