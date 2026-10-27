// Precificacao da solicitacao (v2.0): regras compartilhadas pelos modais de rebaixa/oferta (loja, lote e rede).
// A fonte e o contexto de GET /precificacao/contexto; aqui so se decide o que mostrar e o que gravar.

const num = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const r2 = (v) => Math.round(v * 100) / 100;

/** Margem PDV = (PDV - UC) / PDV; margem oferta = (Oferta - (UC - sellout)) / Oferta. Em %. */
export function calcMargens({ precoPDV, precoOferta, sellout, precoUC }) {
  const uc = num(precoUC);
  const p = num(precoPDV);
  const o = num(precoOferta);
  const s = num(sellout) || 0;
  const margemPDV = uc != null && p > 0 ? ((p - uc) / p) * 100 : null;
  const margemOferta = uc != null && o > 0 ? ((o - (uc - s)) / o) * 100 : null;
  return { margemPDV, margemOferta };
}

/** Sellout que mantem na oferta a mesma margem do PDV (regra antiga). */
export function selloutSugeridoPDV({ precoUC, precoPDV, precoOferta }) {
  const uc = num(precoUC);
  const p = num(precoPDV);
  const o = num(precoOferta);
  if (uc == null || !p || p <= 0 || !o || o <= 0) return null;
  const s = uc - o * (1 - (p - uc) / p);
  return s > 0 ? r2(s) : null;
}

/** Bloco do contexto para o tipo escolhido (o modal de rede alterna rebaixa/oferta sem nova consulta). */
export function ofertaDoContexto(ctx, tipo) {
  if (!ctx) return { precoOferta: { valor: null, origem: null, travado: false, rotulo: null }, selloutAutomatico: null };
  return ctx.porTipo?.[tipo] || { precoOferta: ctx.precoOferta, selloutAutomatico: ctx.selloutAutomatico };
}

/** Origem do preco da oferta gravado: rede (travado), item (preenchido e mantido) ou vendedor (digitado). */
export function origemPrecoOferta(oferta, valorDigitado) {
  if (!oferta) return "vendedor";
  if (oferta.travado) return "rede";
  if (oferta.origem === "item" && oferta.valor != null && num(valorDigitado) === num(oferta.valor)) return "item";
  return "vendedor";
}

/**
 * Sellout efetivo e sua origem.
 * - quem ve margens pode digitar (manual); vazio cai nas regras abaixo
 * - preco travado pela rede com margem cadastrada: automatico (o vendedor nem ve)
 * - senao: sugerido pela margem do PDV; sem como calcular: 0
 */
export function resolverSellout({ oferta, selloutAutomatico, veMargens, selloutDigitado, precoUC, precoPDV, precoOferta }) {
  const digitado = num(selloutDigitado);
  if (veMargens && digitado != null) {
    return { valor: digitado, origem: selloutAutomatico != null && digitado === selloutAutomatico ? "automatico" : "manual" };
  }
  if (oferta?.travado && selloutAutomatico != null) return { valor: selloutAutomatico, origem: "automatico" };
  const sug = selloutSugeridoPDV({ precoUC, precoPDV, precoOferta });
  if (sug != null) return { valor: sug, origem: "sugerido_pdv" };
  return { valor: 0, origem: veMargens ? "manual" : "sugerido_pdv" };
}

/** Campos da ultima compra e do desconto (iguais aos de antes), a partir do contexto. */
export function camposUltimaCompra(ctx) {
  const uc = ctx?.ultimaCompra;
  if (!uc?.encontrado) return {};
  return {
    precoUltimaCompra: uc.precoUltimaCompra,
    dataUltimaCompra: uc.dataUltimaCompra,
    descontoContratoPercentual: uc.descontoContratoPercentual ?? null,
    descontoContratoTipo: uc.descontoContratoTipo ?? null,
    precoUltimaCompraComDesconto: uc.precoUltimaCompraComDesconto ?? null,
  };
}

/** Retrato dos precos e da regra gravado no item da solicitacao (v2.0). */
export function camposPrecificacao(ctx, { tipo, precoOferta, sellout, selloutOrigem }) {
  if (!ctx) return {};
  const oferta = ofertaDoContexto(ctx, tipo).precoOferta;
  return {
    precoLiquido: ctx.precoLiquido ?? null,
    precoTabelaRede: ctx.rede?.p1 > 0 ? ctx.rede.p1 : null,
    precoMinimo: ctx.item?.precoMinimo > 0 ? ctx.item.precoMinimo : null,
    precoP2: ctx.rede?.p2 > 0 ? ctx.rede.p2 : ctx.item?.precoP2 > 0 ? ctx.item.precoP2 : null,
    precoP3: ctx.rede?.p3 > 0 ? ctx.rede.p3 : ctx.item?.precoP3 > 0 ? ctx.item.precoP3 : null,
    precoOfertaOrigem: origemPrecoOferta(oferta, precoOferta),
    precoOfertaTravado: !!oferta?.travado,
    selloutOrigem: selloutOrigem || null,
    custoRedeAplicado: ctx.custoRede ?? null,
    custoRedeOrigem: ctx.custoRedeOrigem ?? null,
    margemRedeAplicada: ctx.margemRede?.margem ?? null,
    origemMargem: ctx.margemRede?.origemMargem ?? null,
    precoPiso: ctx.piso?.valor ?? null,
    pisoTipo: ctx.piso?.tipo ?? null,
    sellout: num(sellout) ?? 0,
  };
}

/** Busca o contexto de precificacao. Erro vira contexto "sem historico" (o modal continua utilizavel). */
export async function carregarContexto(api, params) {
  try {
    const { data } = await api.get("/precificacao/contexto", { params });
    return data;
  } catch {
    return { ultimaCompra: { encontrado: false, erro: "indisponível" }, item: null, rede: null, precoLiquido: null, piso: null, precoOferta: { valor: null, origem: null, travado: false }, selloutAutomatico: null, porTipo: null };
  }
}
