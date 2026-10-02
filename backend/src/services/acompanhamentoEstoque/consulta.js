/**
 * Acompanhamento de estoque: le os retratos ja gravados (Integracao Estoque) e monta os dados do
 * painel. O vinculo loja/produto e resolvido contra o cadastro ATUAL (nao o congelado na linha):
 * marcar um produto como fantasma depois remove-o do acompanhamento de todos os retratos.
 */
const EstoqueRetrato = require("../../models/EstoqueRetrato");
const EstoqueRetratoLinha = require("../../models/EstoqueRetratoLinha");
const IntegracaoLoja = require("../../models/IntegracaoLoja");
const IntegracaoProduto = require("../../models/IntegracaoProduto");
const Produto = require("../../models/Produto");
const { STATUS, enriquecer, kpis, comparar, agrupar } = require("./metricas");

const MAX_ITENS_NO_PAINEL = 5000;
const MAX_RETRATOS_NA_SERIE = 36;
const ORIGEM = "planilha_estoque";

function erro(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  e.publicMessage = mensagem;
  return e;
}

const dia = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// ── Cadastro atual da rede ──────────────────────────────────────────────────────

async function resolverCadastro(codigoRede) {
  const [lojas, ids] = await Promise.all([
    IntegracaoLoja.find({ codigoRede }, "codigo nome").lean(),
    IntegracaoProduto.find({ codigoRede, origem: ORIGEM }, "valor fantasma produtoId").lean(),
  ]);
  const idsProduto = ids.filter((i) => i.produtoId).map((i) => i.produtoId);
  const produtos = idsProduto.length ? await Produto.find({ _id: { $in: idsProduto } }, "descricao").lean() : [];
  const nomePorProdutoId = new Map(produtos.map((p) => [String(p._id), p.descricao]));

  const porCodigo = new Map(ids.map((i) => [i.valor, i]));
  return {
    nomeDaLoja: (codigo) => lojas.find((l) => l.codigo === codigo)?.nome || null,
    lojaCadastrada: (codigo) => lojas.some((l) => l.codigo === codigo),
    ehFantasma: (codigo) => porCodigo.get(codigo)?.fantasma === true,
    identificado: (codigo) => !!porCodigo.get(codigo)?.produtoId,
    nomeDoProduto: (codigo) => {
      const i = porCodigo.get(codigo);
      return i && i.produtoId ? nomePorProdutoId.get(String(i.produtoId)) || null : null;
    },
  };
}

/** Linhas cruas -> linhas de analise (sem fantasma, com nomes atuais). */
function prepararLinhas(cruas, cadastro) {
  const lojasCache = new Map();
  const nomeLoja = (l) => {
    if (!lojasCache.has(l.lojaCodigo)) lojasCache.set(l.lojaCodigo, cadastro.nomeDaLoja(l.lojaCodigo) || l.lojaRazaoSocial || l.lojaCodigo);
    return lojasCache.get(l.lojaCodigo);
  };
  return cruas
    .filter((l) => !cadastro.ehFantasma(l.produtoCodigo))
    .map((l) =>
      enriquecer({
        ...l,
        lojaNome: nomeLoja(l),
        produtoNome: cadastro.nomeDoProduto(l.produtoCodigo) || l.produtoDescricao || l.produtoCodigo,
        categoria: l.categoriaNome || l.categoriaCodigo,
      })
    );
}

const PROJECAO_LINHA =
  "retratoId linha lojaCodigo lojaRazaoSocial produtoCodigo produtoDescricao categoriaCodigo categoriaNome " +
  "estoqueAtual qtdVendida vendaReais valorEstoqueReais custoMedioUnitario ddeInformado idadeDias";

// ── Redes e serie historica ─────────────────────────────────────────────────────

/** Redes que ja tem retratos gravados. */
async function listarRedes() {
  const docs = await EstoqueRetrato.aggregate([
    { $group: { _id: "$codigoRede", nome: { $last: "$redeNome" }, retratos: { $sum: 1 }, ultimaData: { $max: "$dataRetrato" } } },
    { $sort: { nome: 1 } },
  ]);
  return docs.map((d) => ({ codigoRede: d._id, nome: (d.nome || d._id).trim(), retratos: d.retratos, ultimaData: dia(d.ultimaData) }));
}

/** Retratos da rede (mais antigo primeiro) com os indicadores de cada um: base do grafico de evolucao. */
async function serie(codigoRede, limite = MAX_RETRATOS_NA_SERIE) {
  if (!codigoRede) throw erro(400, "Informe a rede.");
  const retratos = await EstoqueRetrato.find({ codigoRede }, "dataRetrato nomeArquivo createdAt")
    .sort({ dataRetrato: -1, createdAt: -1 })
    .limit(Math.min(Number(limite) || MAX_RETRATOS_NA_SERIE, 120))
    .lean();
  if (!retratos.length) return [];

  const cadastro = await resolverCadastro(codigoRede);
  const cruas = await EstoqueRetratoLinha.find({ retratoId: { $in: retratos.map((r) => r._id) } }, PROJECAO_LINHA).lean();
  const porRetrato = new Map();
  for (const l of cruas) {
    const k = String(l.retratoId);
    if (!porRetrato.has(k)) porRetrato.set(k, []);
    porRetrato.get(k).push(l);
  }

  return retratos
    .map((r) => {
      const k = kpis(prepararLinhas(porRetrato.get(String(r._id)) || [], cadastro));
      return {
        id: String(r._id),
        dataRetrato: dia(r.dataRetrato),
        nomeArquivo: r.nomeArquivo,
        importadoEm: r.createdAt,
        itens: k.itens,
        lojas: k.lojas,
        valorEstoque: k.valorEstoque,
        vendaReais: k.vendaReais,
        cobertura: k.cobertura,
        rupturas: k.rupturas,
        semGiroValor: k.semGiro.valorEstoque,
      };
    })
    .reverse(); // ascendente por data
}

// ── Painel de um retrato ────────────────────────────────────────────────────────

async function retratoAnterior(retrato, compararCom) {
  if (compararCom === "nenhum") return null;
  if (compararCom && compararCom !== "anterior") {
    const outro = await EstoqueRetrato.findOne({ _id: compararCom, codigoRede: retrato.codigoRede }).lean().catch(() => null);
    if (!outro) throw erro(400, "Retrato de comparacao nao encontrado nesta rede.");
    return outro;
  }
  return EstoqueRetrato.findOne({
    codigoRede: retrato.codigoRede,
    _id: { $ne: retrato._id },
    $or: [
      { dataRetrato: { $lt: retrato.dataRetrato } },
      { dataRetrato: retrato.dataRetrato, createdAt: { $lt: retrato.createdAt } },
    ],
  })
    .sort({ dataRetrato: -1, createdAt: -1 })
    .lean();
}

async function linhasDoRetrato(retratoId, cadastro) {
  const cruas = await EstoqueRetratoLinha.find({ retratoId }, PROJECAO_LINHA).sort({ linha: 1 }).lean();
  return { cruas, linhas: prepararLinhas(cruas, cadastro) };
}

/**
 * Painel: indicadores, comparacao com o retrato anterior (ou o escolhido), distribuicao por
 * status, rankings de lojas e produtos e as linhas (loja x produto) para a tabela de detalhe.
 */
async function painel({ retratoId, compararCom }) {
  const retrato = await EstoqueRetrato.findById(retratoId).lean().catch(() => null);
  if (!retrato) throw erro(404, "Retrato nao encontrado.");

  const cadastro = await resolverCadastro(retrato.codigoRede);
  const { cruas, linhas } = await linhasDoRetrato(retrato._id, cadastro);
  const k = kpis(linhas);

  const anterior = await retratoAnterior(retrato, compararCom);
  let anteriorK = null;
  let anteriorLinhas = [];
  if (anterior) {
    anteriorLinhas = (await linhasDoRetrato(anterior._id, cadastro)).linhas;
    anteriorK = kpis(anteriorLinhas);
  }

  // Rankings, com o valor do retrato anterior de cada loja/produto (variacao)
  const valorAnterior = (ls, chaveDe) => {
    const m = new Map();
    for (const l of ls) m.set(chaveDe(l), (m.get(chaveDe(l)) || 0) + l.valorEstoque);
    return m;
  };
  const porLojaAnt = valorAnterior(anteriorLinhas, (l) => l.lojaCodigo);
  const porProdutoAnt = valorAnterior(anteriorLinhas, (l) => l.produtoCodigo);

  const lojas = agrupar(linhas, (l) => l.lojaCodigo, (l) => ({ codigo: l.lojaCodigo, nome: l.lojaNome }))
    .map((g) => ({ ...g, valorAnterior: anterior ? porLojaAnt.get(g.codigo) ?? null : null }))
    .sort((a, b) => b.valorEstoque - a.valorEstoque);
  const produtos = agrupar(linhas, (l) => l.produtoCodigo, (l) => ({ codigo: l.produtoCodigo, nome: l.produtoNome, categoria: l.categoria }))
    .map((g) => ({ ...g, valorAnterior: anterior ? porProdutoAnt.get(g.codigo) ?? null : null }))
    .sort((a, b) => b.valorEstoque - a.valorEstoque);

  // Pendencias de cadastro (informativo: continuam entrando nos numeros)
  const naoIdentificados = new Set();
  const lojasSemCadastro = new Set();
  for (const l of cruas) {
    if (cadastro.ehFantasma(l.produtoCodigo)) continue;
    if (!cadastro.identificado(l.produtoCodigo)) naoIdentificados.add(l.produtoCodigo);
    if (!cadastro.lojaCadastrada(l.lojaCodigo)) lojasSemCadastro.add(l.lojaCodigo);
  }
  const fantasmas = new Set(cruas.filter((l) => cadastro.ehFantasma(l.produtoCodigo)).map((l) => l.produtoCodigo));

  return {
    retrato: {
      id: String(retrato._id),
      codigoRede: retrato.codigoRede,
      redeNome: (retrato.redeNome || retrato.codigoRede).trim(),
      dataRetrato: dia(retrato.dataRetrato),
      nomeArquivo: retrato.nomeArquivo,
      importadoPorNome: retrato.importadoPorNome,
      importadoEm: retrato.createdAt,
    },
    anterior: anterior ? { id: String(anterior._id), dataRetrato: dia(anterior.dataRetrato), nomeArquivo: anterior.nomeArquivo } : null,
    kpis: k,
    comparacao: comparar(k, anteriorK),
    status: STATUS.map((s) => ({ ...s, itens: k.porStatus[s.key].itens, valorEstoque: k.porStatus[s.key].valorEstoque })),
    lojas,
    produtos,
    itens: linhas.slice(0, MAX_ITENS_NO_PAINEL),
    itensTotal: linhas.length,
    pendencias: {
      produtosNaoIdentificados: naoIdentificados.size,
      lojasSemCadastro: lojasSemCadastro.size,
      produtosFantasmaExcluidos: fantasmas.size,
    },
  };
}

module.exports = { listarRedes, serie, painel, resolverCadastro, prepararLinhas };
