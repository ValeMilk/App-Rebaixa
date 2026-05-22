const mongoose = require("mongoose");

/**
 * Agenda de Encartes por Rede.
 * Criado pelo supervisor responsavel pela rede.
 * Itens sao os produtos selecionados para compor o encarte,
 * com os mesmos campos de precificacao da rebaixa.
 */
const encarteItemSchema = new mongoose.Schema(
  {
    produtoCodigo:      { type: String, default: null },
    produto:            { type: String, required: true },
    subcategoria:       { type: String, default: null },
    precoTabela:        { type: Number, default: 0 },
    precoMinimo:        { type: Number, default: 0 },
    precoPromo:         { type: Number, default: 0 },
    custo:              { type: Number, default: 0 },
    // Ultima compra gravada no momento da adicao do item
    precoUltimaCompra:  { type: Number, default: null },
    dataUltimaCompra:   { type: Date,   default: null },
    // Precificacao do encarte
    precoOferta:        { type: Number, default: null },
    precoPDV:           { type: Number, default: null },
    sellout:            { type: Number, default: 0 },
    custoPromo:         { type: Number, default: null },
    margemPDV:          { type: Number, default: null },
    margemOferta:       { type: Number, default: null },
    adicionadoPorId:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    adicionadoPorNome:  { type: String },
  },
  { _id: true, timestamps: true }
);

const encarteSchema = new mongoose.Schema(
  {
    nome:             { type: String, required: true },
    codigoRede:       { type: String, required: true, index: true },
    redeSubrede:      { type: String, default: null },
    periodoInicio:    { type: Date, required: true },
    periodoFim:       { type: Date, required: true },
    criadoPorId:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    criadoPorCodigo:  { type: String, required: true },
    criadoPorNome:    { type: String, required: true },
    itens:            { type: [encarteItemSchema], default: [] },
  },
  { timestamps: true }
);

encarteSchema.index({ codigoRede: 1, periodoInicio: -1 });

module.exports = mongoose.model("Encarte", encarteSchema);
