/**
 * Precificacao da solicitacao (v2.0, fases 2 e 3).
 *
 * Um unico "contexto" por loja x produto (ou rede x produto) alimenta os modais de rebaixa/oferta:
 *  - ultima compra (loja; cai para a rede) e o desconto de contrato -> preco liquido
 *  - precos do item (E02: Tabela 70, minimo, P#2, P#3) e da rede (E08: P#1 tabela da rede, P#2, P#3)
 *  - preco da oferta travado quando a rede tem P#2 (oferta interna) ou P#3 (rebaixa) cadastrado
 *  - margem e custo medio da rede (cadastro de margens) -> sellout automatico
 *  - piso da escalada (minimo do item ou P#3)
 *
 * Formulas (spec v2.0, "Definicoes de calculo"; a confirmar com o comercial, ver docs):
 *   preco liquido   = ultima compra x (1 - desconto do cliente)
 *   valor recebido  = preco liquido - sellout
 *   sellout autom.  = custo da rede - preco da oferta x (1 - margem da rede)
 *                     custo da rede = custo medio (planilha) quando existe, senao o preco liquido
 * Escalada: preco vindo da rede (P#2/P#3) dispensa a diretoria; preco sugerido pelo vendedor com
 * valor recebido abaixo do piso sobe para a diretoria; sem como conferir (sem ultima compra ou sem
 * piso) tambem sobe, por seguranca.
 *
 * As funcoes puras ficam no topo (testadas em tests/precificacao); `montarContexto` junta as fontes.
 */

const round = (v, casas = 2) => (v == null || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 10 ** casas) / 10 ** casas);
const num = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/** Preco liquido = ultima compra x (1 - desconto%). null sem ultima compra. */
function calcularPrecoLiquido(precoUltimaCompra, descontoPercentual) {
  const uc = num(precoUltimaCompra);
  if (uc == null || uc <= 0) return null;
  const pct = num(descontoPercentual) || 0;
  return round(uc * (1 - pct / 100), 4);
}

/**
 * Preco da oferta por tipo: rede (E08) trava o campo; item (E02) so preenche e deixa editar; nada = livre.
 * @returns {{ valor:number|null, origem:"rede"|"item"|null, travado:boolean, rotulo:string|null }}
 */
function escolherPrecoOferta({ tipo, rede, item }) {
  const campo = tipo === "oferta_interna" ? "p2" : "p3";
  const nome = tipo === "oferta_interna" ? "P#2" : "P#3";
  const daRede = num(rede?.[campo]);
  if (daRede > 0) return { valor: round(daRede), origem: "rede", travado: true, rotulo: `Preço da rede (${nome})` };
  const doItem = num(item?.[tipo === "oferta_interna" ? "precoP2" : "precoP3"]);
  if (doItem > 0) return { valor: round(doItem), origem: "item", travado: false, rotulo: `Preço do item (${nome})` };
  return { valor: null, origem: null, travado: false, rotulo: null };
}

/** Sellout automatico = custo da rede - oferta x (1 - margem/100). Nunca negativo. null sem dados. */
function calcularSelloutAutomatico({ precoOferta, margemRede, custoRede }) {
  const o = num(precoOferta);
  const m = num(margemRede);
  const c = num(custoRede);
  if (o == null || o <= 0 || m == null || c == null) return null;
  const s = c - o * (1 - m / 100);
  return round(Math.max(0, s));
}

/** Sellout sugerido pela regra antiga: manter na oferta a mesma margem que a loja tem no PDV. */
function calcularSelloutSugeridoPDV({ precoUC, precoPDV, precoOferta }) {
  const uc = num(precoUC);
  const p = num(precoPDV);
  const o = num(precoOferta);
  if (uc == null || !p || p <= 0 || !o || o <= 0) return null;
  const margemPDV = (p - uc) / p;
  const s = uc - o * (1 - margemPDV);
  return s > 0 ? round(s) : null;
}

/** Margens do formulario (iguais as dos modais). */
function calcularMargens({ precoPDV, precoOferta, sellout, precoUC }) {
  const uc = num(precoUC);
  const p = num(precoPDV);
  const o = num(precoOferta);
  const s = num(sellout) || 0;
  const margemPDV = uc != null && p > 0 ? round(((p - uc) / p) * 100, 1) : null;
  const margemOferta = uc != null && o > 0 ? round(((o - (uc - s)) / o) * 100, 1) : null;
  return { margemPDV, margemOferta };
}

/** Valor que a Valemilk recebe = preco liquido - sellout. */
function calcularValorRecebido({ precoLiquido, sellout }) {
  const l = num(precoLiquido);
  if (l == null) return null;
  return round(l - (num(sellout) || 0), 4);
}

/**
 * Regra de escalada (spec v2.0, fluxo de aprovacao, passos 3 a 5).
 * @returns {{ exigeDiretoria:boolean, motivo:string }}
 */
function avaliarEscalada({ precoOfertaOrigem, valorRecebido, precoPiso, pisoTipo }) {
  if (precoOfertaOrigem === "rede") {
    return { exigeDiretoria: false, motivo: "Preço da rede cadastrado no Lacteus: já considerado aprovado." };
  }
  const vr = num(valorRecebido);
  const piso = num(precoPiso);
  const nomePiso = pisoTipo === "p3" ? "P#3 do item" : "preço mínimo do item";
  if (vr == null) {
    return { exigeDiretoria: true, motivo: "Sem última compra: não dá para conferir o valor recebido, sobe para a diretoria." };
  }
  if (piso == null || piso <= 0) {
    return { exigeDiretoria: true, motivo: `Item sem ${nomePiso} cadastrado: não dá para conferir o valor recebido, sobe para a diretoria.` };
  }
  if (vr < piso) {
    return { exigeDiretoria: true, motivo: `Valor recebido R$ ${vr.toFixed(2)} abaixo do ${nomePiso} (R$ ${piso.toFixed(2)}).` };
  }
  return { exigeDiretoria: false, motivo: `Valor recebido R$ ${vr.toFixed(2)} igual ou acima do ${nomePiso} (R$ ${piso.toFixed(2)}).` };
}

/** Piso da escalada conforme a configuracao da rede. */
function escolherPiso({ pisoTipo, item, rede }) {
  if (pisoTipo === "p3") {
    const v = num(rede?.p3) > 0 ? num(rede.p3) : num(item?.precoP3);
    return { tipo: "p3", valor: v > 0 ? round(v) : null };
  }
  const v = num(item?.precoMinimo);
  return { tipo: "minimo", valor: v > 0 ? round(v) : null };
}

/**
 * Recalcula os campos derivados de um item da solicitacao (usado ao criar e ao ajustar).
 * Mantem o que veio do formulario e preenche/recalcula: precoLiquido, margens, valorRecebido.
 */
function recalcularItem(item) {
  const precoUC = num(item.precoUltimaCompra);
  const precoLiquido = item.precoUltimaCompraComDesconto != null
    ? round(item.precoUltimaCompraComDesconto, 4)
    : calcularPrecoLiquido(precoUC, item.descontoContratoPercentual);
  const { margemPDV, margemOferta } = calcularMargens({ precoPDV: item.precoPDV, precoOferta: item.precoOferta, sellout: item.sellout, precoUC });
  const valorRecebido = calcularValorRecebido({ precoLiquido, sellout: item.sellout });
  return {
    ...item,
    precoLiquido,
    margemPDV: margemPDV ?? item.margemPDV ?? null,
    margemOferta: margemOferta ?? item.margemOferta ?? null,
    valorRecebido,
  };
}

// ---------------------------------------------------------------------------
// Contexto (junta ERP, catalogo, tabela da rede e cadastro de margens)
// ---------------------------------------------------------------------------

function ehRedeNumerica(codigoRede) {
  return codigoRede != null && /^\d+$/.test(String(codigoRede).trim());
}

/**
 * @param {{ clienteCodigo?:string, produtoCodigo:string, codigoRede?:string, tipo?:"rebaixa"|"oferta_interna" }} p
 */
async function montarContexto({ clienteCodigo, produtoCodigo, codigoRede, tipo }) {
  const Produto = require("../models/Produto");
  const PrecoRede = require("../models/PrecoRede");
  const erp = require("./erpService");
  const { obterMargemECusto } = require("./margensRedeService");

  const produtoCod = String(produtoCodigo).trim();
  const redeCod = codigoRede != null && String(codigoRede).trim() ? String(codigoRede).trim() : null;

  // 1. Ultima compra: loja -> rede. Erro do ERP nao derruba o contexto (o modal avisa "sem historico").
  let ultimaCompra = { encontrado: false };
  try {
    let origem = "loja";
    let r0 = clienteCodigo ? await erp.buscarUltimaCompra(clienteCodigo, produtoCod) : null;
    if (!r0 && redeCod && erp.ehRedeDoErp(redeCod)) {
      r0 = await erp.buscarUltimaCompraRede(redeCod, produtoCod);
      origem = "rede";
    }
    if (r0) {
      const [r] = await erp.anexarDescontoContrato([r0]);
      ultimaCompra = {
        encontrado: true,
        origem,
        clienteCompraCodigo: r.clienteCodigo != null ? String(r.clienteCodigo).trim() : null,
        precoUltimaCompra: Number(r.precoUltimaCompra) || 0,
        dataUltimaCompra: r.dataUltimaCompra,
        descontoContratoPercentual: r.descontoContratoPercentual ?? null,
        descontoContratoTipo: r.descontoContratoTipo ?? null,
        precoUltimaCompraComDesconto: r.precoUltimaCompraComDesconto ?? null,
      };
    }
  } catch (err) {
    console.error("[precificacao] ultima compra:", err.message);
    ultimaCompra = { encontrado: false, erro: "ERP indisponível" };
  }

  // 2. Item (catalogo) e tabela da rede (E08)
  const produto = await Produto.findOne({ codigoLivre: produtoCod }).lean();
  const item = produto
    ? {
        codigo: produto.codigo,
        descricao: produto.descricao,
        categoria: produto.categoria || null,
        precoTabela: num(produto.precoTabela) || 0,
        precoMinimo: num(produto.precoMinimo) || 0,
        precoP2: num(produto.precoP2) || 0,
        precoP3: num(produto.precoP3) || 0,
        custo: num(produto.custo) || 0,
      }
    : null;
  const precoRede = redeCod && ehRedeNumerica(redeCod) ? await PrecoRede.findOne({ codigoRede: redeCod, produtoCodigo: produtoCod }).lean() : null;
  const rede = precoRede ? { codigoRede: redeCod, p1: num(precoRede.p1) || 0, p2: num(precoRede.p2) || 0, p3: num(precoRede.p3) || 0 } : null;

  // 3. Margem e custo medio da rede
  let margemRede = { margem: null, origemMargem: null, custoMedio: null, custoMedioVersao: null, piso: "minimo" };
  try {
    margemRede = await obterMargemECusto({
      codigoRede: redeCod,
      clienteCodigo: clienteCodigo || ultimaCompra.clienteCompraCodigo || null,
      produtoCodigo: produtoCod,
      categoria: item?.categoria || null,
    });
  } catch (err) {
    console.error("[precificacao] margens da rede:", err.message);
  }

  // 4. Derivados
  const precoLiquido = ultimaCompra.encontrado
    ? (ultimaCompra.precoUltimaCompraComDesconto ?? calcularPrecoLiquido(ultimaCompra.precoUltimaCompra, ultimaCompra.descontoContratoPercentual))
    : null;
  const custoRede = margemRede.custoMedio != null ? round(margemRede.custoMedio, 4) : precoLiquido;
  const custoRedeOrigem = margemRede.custoMedio != null ? "custo_medio" : precoLiquido != null ? "preco_liquido" : null;
  const precoTabela = rede && rede.p1 > 0 ? rede.p1 : item?.precoTabela || null;
  const piso = escolherPiso({ pisoTipo: margemRede.piso, item, rede });

  const porTipo = {};
  for (const t of ["rebaixa", "oferta_interna"]) {
    const oferta = escolherPrecoOferta({ tipo: t, rede, item });
    const selloutAutomatico = oferta.travado
      ? calcularSelloutAutomatico({ precoOferta: oferta.valor, margemRede: margemRede.margem, custoRede })
      : null;
    porTipo[t] = { precoOferta: oferta, selloutAutomatico };
  }
  const tipoEscolhido = tipo === "oferta_interna" ? "oferta_interna" : "rebaixa";

  return {
    clienteCodigo: clienteCodigo || null,
    codigoRede: redeCod,
    produtoCodigo: produtoCod,
    tipo: tipoEscolhido,
    ultimaCompra,
    precoLiquido,
    descontoClientePercentual: ultimaCompra.encontrado ? (ultimaCompra.descontoContratoPercentual ?? 0) : null,
    item,
    rede,
    precoTabela,
    precoTabelaOrigem: rede && rede.p1 > 0 ? "rede" : item ? "item" : null,
    margemRede: { margem: margemRede.margem, origemMargem: margemRede.origemMargem, custoMedio: margemRede.custoMedio, custoMedioVersao: margemRede.custoMedioVersao },
    custoRede,
    custoRedeOrigem,
    piso,
    precoOferta: porTipo[tipoEscolhido].precoOferta,
    selloutAutomatico: porTipo[tipoEscolhido].selloutAutomatico,
    porTipo,
  };
}

module.exports = {
  calcularPrecoLiquido,
  escolherPrecoOferta,
  calcularSelloutAutomatico,
  calcularSelloutSugeridoPDV,
  calcularMargens,
  calcularValorRecebido,
  avaliarEscalada,
  escolherPiso,
  recalcularItem,
  montarContexto,
};
