/**
 * Metricas do acompanhamento de estoque, calculadas sobre as linhas de um retrato.
 * Modulo puro: sem banco. Recebe linhas ja resolvidas (ver consulta.js) e devolve numeros.
 *
 * Premissas (todas derivadas, nada vem da coluna DDE do cliente, que e so conferencia):
 *  - "Qtd vendida" e SEMPRE o acumulado de 30 dias; a venda diaria e derivada (qtd / 30);
 *  - cobertura (dias) = estoque / venda diaria, so quando ha estoque e venda;
 *  - nenhum valor e arredondado aqui: -0,002 e saldo negativo, nao zero;
 *  - produto FANTASMA nunca chega aqui (e removido antes, em consulta.js).
 */

const DIAS_PERIODO = 30;
const LIMITE_BAIXA = 7;       // ate 7 dias de cobertura: risco de ruptura
const LIMITE_ADEQUADA = 30;   // de 7 a 30 dias: saudavel
const LIMITE_ALTA = 60;       // de 30 a 60 dias: alta; acima disso, excesso

// Status exclusivos de uma linha (ordem = ordem de exibicao). `tone` usa os tons do front.
const STATUS = [
  { key: "ruptura", label: "Ruptura", descricao: "Sem estoque e com venda nos últimos 30 dias", tone: "danger" },
  { key: "negativo", label: "Saldo negativo", descricao: "Estoque abaixo de zero no cliente (inconsistência)", tone: "danger" },
  { key: "baixa", label: "Cobertura baixa", descricao: `Até ${LIMITE_BAIXA} dias de cobertura`, tone: "warning" },
  { key: "adequada", label: "Cobertura adequada", descricao: `De ${LIMITE_BAIXA} a ${LIMITE_ADEQUADA} dias`, tone: "success" },
  { key: "alta", label: "Cobertura alta", descricao: `De ${LIMITE_ADEQUADA} a ${LIMITE_ALTA} dias`, tone: "info" },
  { key: "excesso", label: "Excesso", descricao: `Mais de ${LIMITE_ALTA} dias de cobertura`, tone: "caution" },
  { key: "sem_giro", label: "Sem giro", descricao: "Tem estoque e não vendeu nos últimos 30 dias", tone: "caution" },
  { key: "zerado", label: "Zerado sem venda", descricao: "Sem estoque e sem venda", tone: "neutral" },
];

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Cobertura em dias de uma linha; null quando nao ha estoque positivo ou nao ha venda. */
function coberturaDias(estoque, qtdVendida) {
  if (!(estoque > 0) || !(qtdVendida > 0)) return null;
  return estoque / (qtdVendida / DIAS_PERIODO);
}

/** Classifica uma linha em exatamente um status. */
function classificar(estoque, qtdVendida) {
  if (estoque < 0) return "negativo";
  const vende = qtdVendida > 0;
  if (estoque === 0) return vende ? "ruptura" : "zerado";
  if (!vende) return "sem_giro";
  const dias = coberturaDias(estoque, qtdVendida);
  if (dias <= LIMITE_BAIXA) return "baixa";
  if (dias <= LIMITE_ADEQUADA) return "adequada";
  if (dias <= LIMITE_ALTA) return "alta";
  return "excesso";
}

/**
 * Linha crua (como no retrato) -> linha de analise. `l` ja traz lojaNome/produtoNome resolvidos.
 */
function enriquecer(l) {
  const estoque = num(l.estoqueAtual);
  const qtd = num(l.qtdVendida);
  return {
    linha: l.linha,
    lojaCodigo: l.lojaCodigo,
    lojaNome: l.lojaNome,
    produtoCodigo: l.produtoCodigo,
    produtoNome: l.produtoNome,
    categoria: l.categoria || "Sem categoria",
    estoque,
    qtdVendida: qtd,
    vendaDiaria: qtd > 0 ? qtd / DIAS_PERIODO : 0,
    cobertura: coberturaDias(estoque, qtd),
    status: classificar(estoque, qtd),
    valorEstoque: num(l.valorEstoqueReais),
    vendaReais: num(l.vendaReais),
    custo: l.custoMedioUnitario ?? null,
    idade: l.idadeDias ?? null,
    ddeCliente: l.ddeInformado ?? null,
  };
}

/**
 * Cobertura global em dias: valor do estoque / custo da venda diaria, nas linhas que vendem,
 * tem custo e saldo >= 0. (Estoque a custo contra venda a custo: mesma base. Linhas em
 * ruptura entram so no denominador, que e o que puxa a cobertura para baixo.)
 */
function coberturaGlobal(linhas) {
  let estoqueACusto = 0;
  let vendaDiariaACusto = 0;
  for (const l of linhas) {
    if (l.custo == null || !(l.qtdVendida > 0) || l.estoque < 0) continue;
    estoqueACusto += l.estoque * l.custo;
    vendaDiariaACusto += (l.qtdVendida * l.custo) / DIAS_PERIODO;
  }
  return vendaDiariaACusto > 0 ? estoqueACusto / vendaDiariaACusto : null;
}

/** Indicadores de um conjunto de linhas de analise. */
function kpis(linhas) {
  const porStatus = Object.fromEntries(STATUS.map((s) => [s.key, { itens: 0, valorEstoque: 0 }]));
  const lojas = new Set();
  const produtos = new Set();
  let valorEstoque = 0;
  let vendaReais = 0;
  for (const l of linhas) {
    valorEstoque += l.valorEstoque;
    vendaReais += l.vendaReais;
    lojas.add(l.lojaCodigo);
    produtos.add(l.produtoCodigo);
    porStatus[l.status].itens += 1;
    porStatus[l.status].valorEstoque += l.valorEstoque;
  }
  return {
    itens: linhas.length,
    lojas: lojas.size,
    produtos: produtos.size,
    valorEstoque,
    vendaReais,
    vendaDiariaReais: vendaReais / DIAS_PERIODO,
    cobertura: coberturaGlobal(linhas),
    rupturas: porStatus.ruptura.itens,
    negativos: porStatus.negativo.itens,
    semGiro: porStatus.sem_giro,
    excesso: porStatus.excesso,
    porStatus,
  };
}

/** Variacao entre dois valores: { atual, anterior, delta, pct }; pct nulo quando o anterior e zero. */
function variacao(atual, anterior) {
  if (atual == null || anterior == null) return { atual: atual ?? null, anterior: anterior ?? null, delta: null, pct: null };
  const delta = atual - anterior;
  return { atual, anterior, delta, pct: anterior !== 0 ? (delta / Math.abs(anterior)) * 100 : null };
}

/** Compara os indicadores de dois retratos (anterior pode ser null). */
function comparar(atual, anterior) {
  if (!anterior) return null;
  return {
    valorEstoque: variacao(atual.valorEstoque, anterior.valorEstoque),
    vendaReais: variacao(atual.vendaReais, anterior.vendaReais),
    cobertura: variacao(atual.cobertura, anterior.cobertura),
    rupturas: variacao(atual.rupturas, anterior.rupturas),
    negativos: variacao(atual.negativos, anterior.negativos),
    semGiroValor: variacao(atual.semGiro.valorEstoque, anterior.semGiro.valorEstoque),
    excessoValor: variacao(atual.excesso.valorEstoque, anterior.excesso.valorEstoque),
  };
}

/** Agrupa por chave e calcula os indicadores de cada grupo (para os rankings). */
function agrupar(linhas, chaveDe, metaDe) {
  const grupos = new Map();
  for (const l of linhas) {
    const k = chaveDe(l);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(l);
  }
  return [...grupos.entries()].map(([chave, ls]) => {
    const k = kpis(ls);
    return {
      chave,
      ...metaDe(ls[0]),
      itens: k.itens,
      lojas: k.lojas,
      produtos: k.produtos,
      valorEstoque: k.valorEstoque,
      vendaReais: k.vendaReais,
      cobertura: k.cobertura,
      rupturas: k.rupturas,
      negativos: k.negativos,
      semGiroItens: k.semGiro.itens,
      semGiroValor: k.semGiro.valorEstoque,
      excessoItens: k.excesso.itens,
    };
  });
}

module.exports = {
  DIAS_PERIODO,
  LIMITE_BAIXA,
  LIMITE_ADEQUADA,
  LIMITE_ALTA,
  STATUS,
  coberturaDias,
  classificar,
  enriquecer,
  coberturaGlobal,
  kpis,
  variacao,
  comparar,
  agrupar,
};
