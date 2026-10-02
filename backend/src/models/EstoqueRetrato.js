const mongoose = require("mongoose");

/**
 * Retrato de estoque: cabecalho de UMA importacao. Append-only: nunca e editado nem apagado
 * (erro se corrige reenviando o arquivo). Indice unico (rede, hash): reenviar o mesmo arquivo
 * byte a byte devolve o retrato que ja existe.
 */
const retratoSchema = new mongoose.Schema(
  {
    codigoRede:    { type: String, required: true },
    redeNome:      { type: String },
    // Dia do retrato (sem hora): gravado como meia-noite UTC; exibir sempre com toISOString().slice(0, 10)
    dataRetrato:   { type: Date, required: true },
    nomeArquivo:   { type: String, required: true },
    hashSha256:    { type: String, required: true },
    tamanhoBytes:  { type: Number, required: true },
    tituloArquivo: { type: String, default: null },

    totalLinhasArquivo: { type: Number, required: true },
    linhasValidas:      { type: Number, required: true },
    linhasDescartadas:  { type: Number, required: true },

    lojasNoArquivo:       { type: Number, default: 0 },
    lojasReconhecidas:    { type: Number, default: 0 },
    produtosNoArquivo:    { type: Number, default: 0 },
    produtosReconhecidos: { type: Number, default: 0 },
    produtosFantasma:     { type: Number, default: 0 },

    valorTotalEstoque: { type: Number, default: 0 },
    vendaTotal:        { type: Number, default: 0 },

    // Como cada coluna foi lida NESTA importacao (rotulo original, campo, origem da associacao)
    mapeamentoColunas: { type: mongoose.Schema.Types.Mixed, default: [] },
    // Linhas descartadas com o motivo (para a conferencia com o Excel bater)
    descartadas:       { type: mongoose.Schema.Types.Mixed, default: [] },

    importadoPorId:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    importadoPorNome: { type: String },
  },
  { timestamps: true }
);

retratoSchema.index({ codigoRede: 1, hashSha256: 1 }, { unique: true });
retratoSchema.index({ codigoRede: 1, dataRetrato: -1 });

module.exports = mongoose.model("EstoqueRetrato", retratoSchema);
