const mongoose = require("mongoose");

/**
 * Custo medio da rede, por loja e produto, importado de planilha (v2.0, fase 3). Historico de versoes:
 * cada importacao e uma versao nova; a mais recente (ativa = true) e a usada na precificacao.
 * Quem importa: admin ou o supervisor responsavel pela rede (ResponsavelRede).
 */
const linhaSchema = new mongoose.Schema(
  {
    clienteCodigo: { type: String, required: true }, // codigo Lacteus da loja
    produtoCodigo: { type: String, required: true }, // E02_LIVRE (codigoLivre; se o produto nao tiver, o codigo ERP)
    produtoCodigoErp: { type: String, default: null }, // Produto.codigo, para a precificacao consultar por qualquer um dos dois
    custoMedio: { type: Number, required: true },
  },
  { _id: false }
);

const custoMedioRedeSchema = new mongoose.Schema(
  {
    codigoRede: { type: String, required: true, index: true },
    versao: { type: Number, required: true },
    ativa: { type: Boolean, default: true, index: true },

    nomeArquivo: { type: String, required: true },
    arquivo: { type: Buffer, required: true }, // original, para auditoria
    hashArquivo: { type: String, default: null },

    importadoEm: { type: Date, default: Date.now },
    importadoPorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    importadoPorNome: { type: String, default: null },

    resumo: {
      totalLinhas: { type: Number, default: 0 },
      validas: { type: Number, default: 0 },
      descartadas: { type: Number, default: 0 },
      lojas: { type: Number, default: 0 },
      lojasNaoReconhecidas: { type: Number, default: 0 },
      produtos: { type: Number, default: 0 },
      produtosNaoReconhecidos: { type: Number, default: 0 },
    },
    descartadas: { type: [new mongoose.Schema({ linha: Number, motivo: String, conteudo: String }, { _id: false })], default: [] },
    linhas: { type: [linhaSchema], default: [] },
  },
  { timestamps: true }
);

custoMedioRedeSchema.index({ codigoRede: 1, versao: -1 }, { unique: true });

module.exports = mongoose.model("CustoMedioRede", custoMedioRedeSchema);
