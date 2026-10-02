/**
 * Reconhecimento de produto por semelhanca de nome contra um catalogo de referencia.
 * Tudo aqui e SUGESTAO: nada e vinculado sem confirmacao humana.
 *
 * Pontuacao = coeficiente de Dice entre os termos dos nomes, com penalidades por termo de linha
 * (WHEY, ZERO, LIGHT...) presente so de um lado e por gramatura diferente/desconhecida.
 */
const { semAcento } = require("./texto");

// Abreviacoes do cadastro do cliente (cresce com o uso). Inclui erros de digitacao recorrentes.
const ABREVIACOES = {
  IOG: "IOGURTE", BEB: "BEBIDA", LACT: "LACTEA", REQ: "REQUEIJAO", MOR: "MORANGO",
  TRAD: "TRADICIONAL", DESN: "DESNATADO", GRF: "GARRAFA", GAR: "GARRAFA", BDJ: "BANDEJA",
  NAT: "NATURAL", VIT: "VITAMINA", TRI: "TRIPLO", SF: "SALADA FRUTAS",
  FUTAS: "FRUTAS", MIILK: "MILK",
};
// Marca presente em todos os itens: nao distingue nada.
const TERMOS_IGNORADOS = new Set(["VALE", "MILK", "VALEMILK", "VM", "DE", "DA", "DO", "DAS", "DOS", "E"]);
// O que separa variantes que o resto do nome faria parecerem iguais.
const TERMOS_DE_LINHA = new Set(["WHEY", "TRIPLO", "ZERO", "LIGHT", "BICAMADA", "NATURAL", "GHEE"]);
const VARIANTES = new Set(["TRADICIONAL", "LIGHT", "ZERO", "DESNATADO", "INTEGRAL"]);

const LIMIAR_PRE_SELECAO = 0.8;
const FOLGA_PRE_SELECAO = 0.1;

const RE_GRAMATURA = /(\d+(?:[.,]\d+)?)\s*(KG|GR|G)\b/;

function maiusculo(s) {
  return semAcento(s).toUpperCase();
}

/** Gramatura: { tipo: "gramas", valor } | { tipo: "peso_variavel" } | { tipo: "desconhecida" }. */
function gramaturaDoProduto(descricao) {
  const t = maiusculo(descricao);
  const m = RE_GRAMATURA.exec(t);
  if (m) {
    const n = parseFloat(m[1].replace(",", "."));
    return { tipo: "gramas", valor: m[2] === "KG" ? Math.round(n * 1000) : n };
  }
  if (/\bKG\b/.test(t)) return { tipo: "peso_variavel" };
  return { tipo: "desconhecida" };
}

/** Conjunto de termos distintivos do nome (sem gramatura, marca e conectivos; abreviacoes expandidas). */
function termosDoProduto(descricao) {
  let t = maiusculo(descricao);
  t = t.replace(new RegExp(RE_GRAMATURA.source, "g"), " ").replace(/\bKG\b/g, " ");
  t = t.replace(/[^A-Z0-9\s]/g, " ");
  const termos = new Set();
  for (const palavra of t.split(/\s+/).filter(Boolean)) {
    const expandida = ABREVIACOES[palavra] ? ABREVIACOES[palavra].split(" ") : [palavra];
    for (const e of expandida) if (!TERMOS_IGNORADOS.has(e)) termos.add(e);
  }
  // "ZERO LAC(TOSE)" e "ZERO" sozinho sao a MESMA variante
  if (termos.has("ZERO")) { termos.delete("LACTOSE"); termos.delete("LAC"); }
  return termos;
}

function temVariante(termos) {
  for (const v of VARIANTES) if (termos.has(v)) return true;
  return false;
}

/**
 * Pontua o nome do cliente contra um candidato do catalogo.
 * candidato = { descricao, ativo }. Retorna { pontuacao (3 casas), motivos[] }.
 */
function pontuarProduto(descricaoDoCliente, candidato) {
  const a = termosDoProduto(descricaoDoCliente);
  const b = termosDoProduto(candidato.descricao);
  const motivos = [];

  // Sem NENHUM termo em comum nao ha evidencia: o "tradicional implicito" abaixo nao pode, sozinho,
  // fazer dois nomes sem relacao parecerem semelhantes.
  if (![...a].some((t) => b.has(t))) return { pontuacao: 0, motivos: [] };

  // Nome sem nenhuma variante e implicitamente "tradicional"
  if (!temVariante(a) && b.has("TRADICIONAL")) a.add("TRADICIONAL");
  if (!temVariante(b) && a.has("TRADICIONAL")) b.add("TRADICIONAL");

  if (!a.size || !b.size) return { pontuacao: 0, motivos: [] };

  const comuns = [...a].filter((t) => b.has(t));
  let pontuacao = (2 * comuns.length) / (a.size + b.size);
  if (comuns.length) motivos.push(`termos em comum: ${comuns.join(", ")}`);

  for (const t of TERMOS_DE_LINHA) {
    if (a.has(t) !== b.has(t)) {
      pontuacao *= 0.85;
      motivos.push(`"${t}" so aparece em um dos nomes`);
    }
  }

  const gc = gramaturaDoProduto(descricaoDoCliente);
  const gk = gramaturaDoProduto(candidato.descricao);
  if (gc.tipo === "gramas" && gk.tipo === "gramas") {
    if (gc.valor === gk.valor) motivos.push(`gramatura igual (${gc.valor} g)`);
    else { pontuacao *= 0.55; motivos.push(`gramatura diferente (${gc.valor} g x ${gk.valor} g)`); }
  } else if (gc.tipo === "peso_variavel" && gk.tipo === "peso_variavel") {
    pontuacao *= 0.95;
    motivos.push("os dois vendidos a peso");
  } else {
    pontuacao *= 0.85;
    motivos.push("gramatura desconhecida em um dos lados");
  }

  if (candidato.ativo === false) { pontuacao *= 0.97; motivos.push("item inativo no catalogo"); }

  return { pontuacao: Math.round(pontuacao * 1000) / 1000, motivos };
}

/** Top `limite` sugestoes do catalogo; descarta pontuacao 0; empate mantem a ordem do catalogo. */
function sugerirProdutos(descricaoDoCliente, catalogo, limite = 3) {
  const pontuados = [];
  catalogo.forEach((item, idx) => {
    const { pontuacao, motivos } = pontuarProduto(descricaoDoCliente, item);
    if (pontuacao > 0) pontuados.push({ item, pontuacao, motivos, idx });
  });
  pontuados.sort((x, y) => y.pontuacao - x.pontuacao || x.idx - y.idx);
  return pontuados.slice(0, limite).map(({ item, pontuacao, motivos }) => ({ ...item, pontuacao, motivos }));
}

/** So marca quando a melhor sugestao e boa E se destaca da segunda (empate tecnico nao marca). */
function sugestaoPreSelecionada(sugestoes) {
  const [primeira, segunda] = sugestoes;
  if (!primeira) return null;
  if (primeira.pontuacao < LIMIAR_PRE_SELECAO) return null;
  if (primeira.pontuacao - (segunda ? segunda.pontuacao : 0) < FOLGA_PRE_SELECAO) return null;
  return primeira;
}

/**
 * Trava de lote: duas armadilhas que a pontuacao isolada nao ve.
 *  1. o item do catalogo ja esta vinculado a OUTRO codigo do cliente;
 *  2. mais de um codigo DESTA importacao aponta para o MESMO item (tipico de produto FANTASMA,
 *     que costuma pontuar mais alto que o codigo certo porque seu nome e mais "limpo").
 * Sem esta trava, uma confirmacao em lote vincularia o fantasma ao item certo e deixaria o
 * produto verdadeiro sem vinculo nenhum.
 *
 * itens: [{ codigo, sugestoes }]; vinculadosAntes: Map(produtoId -> Set(codigos do cliente ja vinculados)).
 * Retorna Map(codigo -> { sugestao|null, motivo|null }).
 */
function preSelecoesComTrava(itens, vinculadosAntes = new Map()) {
  const isoladas = new Map();
  const contagem = new Map();
  for (const it of itens) {
    const s = sugestaoPreSelecionada(it.sugestoes);
    isoladas.set(it.codigo, s);
    if (s) contagem.set(String(s.produtoId), (contagem.get(String(s.produtoId)) || 0) + 1);
  }

  const resultado = new Map();
  for (const it of itens) {
    const s = isoladas.get(it.codigo);
    if (!s) { resultado.set(it.codigo, { sugestao: null, motivo: null }); continue; }
    const pid = String(s.produtoId);
    const outros = [...(vinculadosAntes.get(pid) || [])].filter((c) => c !== it.codigo);
    if (outros.length) {
      resultado.set(it.codigo, { sugestao: null, motivo: "ja vinculado a outro codigo" });
    } else if (contagem.get(pid) > 1) {
      resultado.set(it.codigo, { sugestao: null, motivo: "outro codigo tambem aponta para este item" });
    } else {
      resultado.set(it.codigo, { sugestao: s, motivo: null });
    }
  }
  return resultado;
}

/** Nome normalizado para comparacao EXATA entre descricoes (maiusculas, sem acento, sem pontuacao). */
function nomeNormalizado(descricao) {
  return maiusculo(descricao).replace(/[^A-Z0-9]+/g, " ").trim();
}

module.exports = {
  ABREVIACOES,
  TERMOS_DE_LINHA,
  VARIANTES,
  gramaturaDoProduto,
  termosDoProduto,
  pontuarProduto,
  sugerirProdutos,
  sugestaoPreSelecionada,
  preSelecoesComTrava,
  nomeNormalizado,
};
