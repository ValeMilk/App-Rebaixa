const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema(
  {
    produto: { type: String, required: true },
    produtoCodigo: { type: String },
    quantidade: { type: Number, required: true },
    dataValidade: { type: Date },
    diasParaVencer: { type: Number },
    precoTabela: { type: Number },
    precoOferta: { type: Number },
    sellout: { type: Number },
    margemCalculada: { type: Number },
    precoUltimaCompra: { type: Number },
    dataUltimaCompra: { type: Date },
    // Desconto de contrato (A23/A24) ou de rede (A16) vigente na criacao; so informativo
    descontoContratoPercentual: { type: Number, default: null }, // 0-100
    descontoContratoTipo: { type: String, default: null },       // "Contrato Produto" | "Contrato Categoria" | "Rede"
    precoUltimaCompraComDesconto: { type: Number, default: null },
    precoPDV: { type: Number },
    margemPDV: { type: Number },
    margemOferta: { type: Number },
    precoAtual: { type: Number },
    precoSugerido: { type: Number },
    descontoPercentual: { type: Number },
    estoqueRefId: { type: mongoose.Schema.Types.ObjectId, ref: "Estoque" },

    // v2.0 (fases 2 e 3): retrato dos precos e da regra no momento da criacao
    precoLiquido: { type: Number, default: null },        // ultima compra x (1 - desconto do cliente)
    precoTabelaRede: { type: Number, default: null },     // P#1 da rede (E08), quando existe
    precoMinimo: { type: Number, default: null },         // E02_PRECO_MIN
    precoP2: { type: Number, default: null },             // P#2 usado (rede ou item)
    precoP3: { type: Number, default: null },             // P#3 usado (rede ou item)
    precoOfertaOrigem: { type: String, enum: [null, "rede", "item", "vendedor"], default: null },
    precoOfertaTravado: { type: Boolean, default: false },
    selloutOrigem: { type: String, enum: [null, "automatico", "sugerido_pdv", "manual"], default: null },
    custoRedeAplicado: { type: Number, default: null },   // custo medio da planilha ou o preco liquido
    custoRedeOrigem: { type: String, enum: [null, "custo_medio", "preco_liquido"], default: null },
    margemRedeAplicada: { type: Number, default: null },  // 0-100
    origemMargem: { type: String, enum: [null, "loja", "categoria", "rede"], default: null },
    valorRecebido: { type: Number, default: null },       // preco liquido - sellout
    precoPiso: { type: Number, default: null },
    pisoTipo: { type: String, enum: [null, "minimo", "p3"], default: null },
  },
  { _id: false }
);

// Ajuste das condicoes pelo supervisor (ou diretoria/admin) na decisao
const ajusteSchema = new mongoose.Schema(
  {
    em: { type: Date, default: Date.now },
    porUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    porNome: String,
    porRole: String,
    antes: { precoOferta: Number, sellout: Number, inicioAcao: Date, fimAcao: Date },
    depois: { precoOferta: Number, sellout: Number, inicioAcao: Date, fimAcao: Date },
  },
  { _id: false }
);

const historicoSchema = new mongoose.Schema(
  {
    acao: { type: String, required: true }, // criada, aprovada, rejeitada, comentario
    porUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    porNome: String,
    porRole: String,
    comentario: String,
    em: { type: Date, default: Date.now },
  },
  { _id: false }
);

const solicitacaoSchema = new mongoose.Schema(
  {
    tipo: {
      type: String,
      enum: ["rebaixa", "oferta_interna"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pendente_supervisor", "aprovado_supervisor", "aprovado_final", "rejeitado", "cancelado"],
      default: "pendente_supervisor",
      index: true,
    },

    cliente: { type: String, required: true },
    clienteCodigo: { type: String, required: true, index: true },
    codigoRede:    { type: String, default: null, index: true },
    redeSubrede:   { type: String, default: null },
    subrede:       { type: String, default: null },

    criadoPorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    criadoPorNome: { type: String },
    criadoPorRole: { type: String },
    criadoPorCodigo: { type: String },

    supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    supervisorNome: { type: String },
    supervisorCodigo: { type: String, index: true },

    itens: { type: [itemSchema], default: [] },

    motivo: { type: String },
    observacoes: { type: String },

    // Período da ação (rebaixa ou oferta)
    inicioAcao: { type: Date, required: true },
    fimAcao:    { type: Date, required: true },

    aprovadoPorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    aprovadoPorNome: String,
    aprovadoEm: Date,
    motivoDecisao: String,

    // v2.0: acao contra concorrente exige foto (SolicitacaoFoto)
    contraConcorrente: { type: Boolean, default: false },
    temFoto: { type: Boolean, default: false },

    // v2.0: escalada. exigeDiretoria = false quando o preco veio da rede ou o valor recebido >= piso
    aprovacao: {
      exigeDiretoria: { type: Boolean, default: true },
      motivoEscalada: { type: String, default: null },
    },
    ajustes: { type: [ajusteSchema], default: [] },

    historico: { type: [historicoSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Solicitacao", solicitacaoSchema);
