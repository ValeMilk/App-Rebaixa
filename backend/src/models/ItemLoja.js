const mongoose = require("mongoose");

/**
 * Visao do vendedor (v2.0): UM documento por loja x produto com tudo o que a loja comprou nos ultimos
 * 90 dias (Lacteus, ver CompraRecente) OU contou nos ultimos 30 dias (Ativmob), mesmo sem compra.
 *
 * Diferente do espelho `Estoque` (que so guarda o que precisa de acao), aqui NADA some: lote que a
 * promotora nao reencontrou fica marcado, item comprado e nunca contado aparece como "nao_contado",
 * zero com ruptura aparece como "ruptura". Recalculado a cada sync (visaoLojasService).
 *
 * situacao:
 *  - rebaixa / giro / ok / sem_shelf : pior status entre os lotes VIGENTES (mesma regra do Painel, secao 4)
 *  - nao_reencontrado : tem lote contado em 30 dias, mas nenhum vigente (loja visitada > 14 dias depois)
 *  - zerado           : ultima contagem do produto foi zero SEM ruptura marcada ("lote encerrado")
 *  - ruptura          : ultima contagem zero COM em_ruptura = SIM
 *  - nao_contado      : comprou em 90 dias e nao tem contagem nos ultimos 30 dias
 */
const SITUACOES = ["rebaixa", "giro", "ok", "sem_shelf", "nao_reencontrado", "zerado", "ruptura", "nao_contado"];

const loteSchema = new mongoose.Schema(
  {
    dataValidade: { type: Date },
    quantidade: { type: Number, default: 0 },
    status: { type: String, enum: ["rebaixa", "giro", "ok", "sem_shelf"] },
    pctShelf: { type: Number, default: null }, // 0-1
    vigente: { type: Boolean, default: true },
    // Quando nao vigente: por que saiu
    motivoSaida: { type: String, enum: [null, "nao_reencontrado", "vencido", "zerado"], default: null },
    entraNaSoma: { type: Boolean, default: true },
    agente: { type: String, default: null },
    agenteCodigo: { type: String, default: null },
    contadoEm: { type: String, default: null }, // "AAAA-MM-DDTHH:MM" (hora de relogio)
    naUltimaVisita: { type: Boolean, default: true },
  },
  { _id: false }
);

const itemLojaSchema = new mongoose.Schema(
  {
    chave: { type: String, required: true, unique: true, index: true }, // "clienteCodigo|produtoCodigo"
    clienteCodigo: { type: String, required: true, index: true },
    cliente: { type: String, default: "" },
    produtoCodigo: { type: String, required: true, index: true }, // E02_LIVRE (= codigo do Ativmob)
    produto: { type: String, default: "" },

    // Carteira (no momento do sync), para alcance e notificacao
    codigoRede: { type: String, default: null, index: true },
    redeSubrede: { type: String, default: null },
    subrede: { type: String, default: null },
    vendedorCodigo: { type: String, default: null, index: true },
    supervisorCodigo: { type: String, default: null, index: true },

    // Compras no Lacteus (CompraRecente)
    comprou90d: { type: Boolean, default: false, index: true },
    ultimaCompraEm: { type: Date, default: null },
    qtd90d: { type: Number, default: 0 },

    situacao: { type: String, enum: SITUACOES, required: true, index: true },
    abaixoMinimo: { type: Boolean, default: false }, // soma dos lotes vigentes <= minimo do Painel (5 un; 2 para 4 codigos)

    // Consolidado dos lotes vigentes (mesma regra do Painel: soma so giro/rebaixa, validade mais proxima)
    quantidade: { type: Number, default: 0 },
    quantidadeTotal: { type: Number, default: 0 }, // todos os lotes vigentes
    dataValidade: { type: Date, default: null },
    diasParaVencer: { type: Number, default: null },
    shelf: { type: Number, default: 0 },
    pctShelf: { type: Number, default: null },
    lotes: { type: [loteSchema], default: [] },

    // Ultima contagem deste produto nesta loja (qualquer quantidade, inclusive zero)
    ultimaContagemEm: { type: String, default: null },
    ultimaContagemPor: { type: String, default: null },
    ultimaContagemPorCodigo: { type: String, default: null },
    ultimaContagemQtd: { type: Number, default: null },
    emRuptura: { type: Boolean, default: false, index: true },

    // Ultima visita do promotor a loja (qualquer produto)
    ultimaVisitaEm: { type: String, default: null },
    ultimaVisitaPor: { type: String, default: null },

    sincronizadoEm: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

itemLojaSchema.statics.SITUACOES = SITUACOES;

module.exports = mongoose.model("ItemLoja", itemLojaSchema);
