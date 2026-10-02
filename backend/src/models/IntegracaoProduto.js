const mongoose = require("mongoose");

/**
 * Identificador de produto: o mesmo produto fisico e conhecido por codigos diferentes em cada
 * sistema. Cada codigo (por origem) aponta para um Produto do catalogo ou e marcado FANTASMA
 * (codigo do cliente que nao corresponde a produto fisico nenhum; fica fora da analise para sempre).
 *
 * Integridade: `produtoId` so pode ser nulo quando `fantasma` e verdadeiro.
 */
const produtoIdSchema = new mongoose.Schema(
  {
    codigoRede:        { type: String, required: true },
    origem:            { type: String, default: "planilha_estoque" },
    valor:             { type: String, required: true },   // o codigo em si, como veio do arquivo
    descricaoOrigem:   { type: String },                   // como veio, para auditoria
    produtoId:         { type: mongoose.Schema.Types.ObjectId, ref: "Produto", default: null },
    produtoCodigo:     { type: String, default: null },    // copia do codigo do Produto, para exibicao
    fantasma:          { type: Boolean, default: false },
    metodo:            { type: String, enum: ["manual", "sugestao_confirmada", "nome_exato", "carga_inicial"], default: "manual" },
    pontuacao:         { type: Number, default: null },
    confirmadoPorNome: { type: String },
    confirmadoEm:      { type: Date, default: Date.now },
  },
  { timestamps: true }
);

produtoIdSchema.index({ codigoRede: 1, origem: 1, valor: 1 }, { unique: true });
produtoIdSchema.index({ codigoRede: 1, produtoId: 1 });

produtoIdSchema.pre("validate", function (next) {
  if (!this.fantasma && !this.produtoId) {
    return next(new Error("Identificador sem produto so e valido quando marcado como fantasma"));
  }
  next();
});

module.exports = mongoose.model("IntegracaoProduto", produtoIdSchema);
