const mongoose = require("mongoose");

/**
 * Linha de um retrato (uma por linha de dado valida do arquivo). Guarda tudo que a linha trouxe,
 * sem arredondar: numeros ficam como vieram (ex.: -0.002 nao vira 0.00). `lojaId`/`produtoId`
 * registram o vinculo no momento da gravacao; a leitura resolve contra o cadastro ATUAL.
 */
const linhaSchema = new mongoose.Schema(
  {
    retratoId: { type: mongoose.Schema.Types.ObjectId, ref: "EstoqueRetrato", required: true, index: true },
    linha:     { type: Number, required: true },   // 1-indexada como no arquivo original

    lojaCodigo:      { type: String, required: true },
    lojaRazaoSocial: { type: String },
    lojaId:          { type: mongoose.Schema.Types.ObjectId, ref: "IntegracaoLoja", default: null },

    produtoCodigo:    { type: String, required: true },
    produtoDescricao: { type: String },
    produtoId:        { type: mongoose.Schema.Types.ObjectId, ref: "Produto", default: null },
    fantasma:         { type: Boolean, default: false },

    categoriaCodigo:  { type: String, default: null },
    categoriaNome:    { type: String, default: null },
    fornecedorCodigo: { type: String, default: null },
    fornecedorNome:   { type: String, default: null },

    estoqueAtual:      { type: Number, required: true },
    qtdVendida:        { type: Number, required: true },
    vendaReais:        { type: Number, required: true },
    valorEstoqueReais: { type: Number, required: true },

    custoMedioUnitario: { type: Number, default: null },
    ddeInformado:       { type: Number, default: null },
    idadeDias:          { type: Number, default: null },

    extras: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { versionKey: false }
);

module.exports = mongoose.model("EstoqueRetratoLinha", linhaSchema);
