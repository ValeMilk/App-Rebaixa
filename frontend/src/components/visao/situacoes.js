// Situacoes do ItemLoja (visao do vendedor). Rotulos, tons e ordem iguais ao backend
// (models/ItemLoja.js, controllers/visaoController.js). Cores vem dos tons semanticos (lib/tones.js).

export const SITUACOES = [
  { key: "ruptura",          label: "Ruptura",          tone: "danger",  chip: true,  acao: null },
  { key: "rebaixa",          label: "Rebaixa",          tone: "danger",  chip: true,  acao: "rebaixa" },
  { key: "giro",             label: "Giro",             tone: "warning", chip: true,  acao: "oferta_interna" },
  { key: "nao_contado",      label: "Não contado",      tone: "neutral", chip: true,  acao: null },
  { key: "nao_reencontrado", label: "Não reencontrado", tone: "neutral", chip: true,  acao: null },
  { key: "zerado",           label: "Zerado",           tone: "neutral", chip: false, acao: null },
  { key: "ok",               label: "Ok",               tone: "success", chip: false, acao: null },
  { key: "sem_shelf",        label: "Sem shelf",        tone: "info",    chip: false, acao: null },
];

export const SITUACAO = Object.fromEntries(SITUACOES.map((s) => [s.key, s]));

export const CHIPS = SITUACOES.filter((s) => s.chip);

// Motivo de um lote nao vigente (texto em cinza na lista de lotes)
export const MOTIVO_SAIDA = {
  vencido: "Vencido",
  zerado: "Zerado: recontado com zero ou visita posterior sem o produto",
  nao_reencontrado: "Não reencontrado",
};

/** Tipo de solicitacao para a situacao (giro = oferta interna; rebaixa = rebaixa), ou null. */
export function tipoSolicitacaoDe(situacao) {
  return SITUACAO[situacao]?.acao || null;
}

/** Item da visao -> item que o RebaixaModal espera (mesmo formato do Painel/Lojas). */
export function itemParaSolicitacao(item) {
  return {
    _id: item._id,
    cliente: item.cliente,
    clienteCodigo: item.clienteCodigo,
    codigoRede: item.codigoRede,
    redeSubrede: item.redeSubrede,
    subrede: item.subrede,
    produto: item.produto,
    produtoCodigo: item.produtoCodigo,
    quantidade: item.quantidade,
    dataValidade: item.dataValidade,
    diasParaVencer: item.diasParaVencer,
    precoTabela: item.precoTabela,
    statusShelf: item.situacao,
  };
}
