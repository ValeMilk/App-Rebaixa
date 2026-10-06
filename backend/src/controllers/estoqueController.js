const Estoque = require("../models/Estoque");
const Carteira = require("../models/Carteira");
const { query, pgConfigurado } = require("../services/estoquePgDbService");
const { buscarUltimasComprasLote, buscarUltimaCompraRedeBatch } = require("../services/erpService");
const { montarLinhas, gerarPlanilha } = require("../services/exportacaoVencimentosService");

/**
 * Lista o estoque critico (ja filtrado pela view do Postgres na sincronizacao —
 * ver estoqueSyncService.js). Cada documento e um lote/validade distinto.
 * Aplica filtros opcionais de classificacao/cliente/produto e restricao por carteira.
 */
async function listar(req, res) {
  const { classificacao, clienteCodigo, produto, q, limit } = req.query;
  const lim = Math.min(Math.max(parseInt(limit, 10) || 500, 1), 5000);

  const match = {};

  if (classificacao) match.classificacao = classificacao;
  if (clienteCodigo) match.clienteCodigo = String(clienteCodigo);
  if (produto) match.produto = produto;
  if (q) match.produto = { $regex: q, $options: "i" };

  // Restrigir por carteira conforme role + construir mapa rede por cliente
  let redeMap = {}; // clienteCodigo → { codigoRede, redeSubrede, subrede }
  if (req.user.role === "vendedor") {
    const carteira = await Carteira.find({ vendedorCodigo: req.user.codigo }, "clienteCodigo codigoRede redeSubrede subrede");
    const codigos = carteira.map((c) => c.clienteCodigo);
    match.clienteCodigo = { $in: codigos.length ? codigos : ["__none__"] };
    for (const c of carteira) redeMap[c.clienteCodigo] = { codigoRede: c.codigoRede || null, redeSubrede: c.redeSubrede || null, subrede: c.subrede || null };
  } else if (req.user.role === "supervisor") {
    const carteira = await Carteira.find({ supervisorCodigo: req.user.codigo }, "clienteCodigo codigoRede redeSubrede subrede");
    const codigos = carteira.map((c) => c.clienteCodigo);
    match.clienteCodigo = { $in: codigos.length ? codigos : ["__none__"] };
    for (const c of carteira) redeMap[c.clienteCodigo] = { codigoRede: c.codigoRede || null, redeSubrede: c.redeSubrede || null, subrede: c.subrede || null };
  } else {
    // admin/diretoria: busca toda a carteira para montar o mapa de redes
    const carteira = await Carteira.find({}, "clienteCodigo codigoRede redeSubrede subrede");
    for (const c of carteira) redeMap[c.clienteCodigo] = { codigoRede: c.codigoRede || null, redeSubrede: c.redeSubrede || null, subrede: c.subrede || null };
  }

  const pipeline = [
    { $match: match },
    // A lista nao carrega os lotes (vem pelo endpoint de detalhes); `raw` e legado
    { $unset: ["raw", "lotes"] },
    // Busca precoTabela e custo do catalogo de produtos
    {
      $lookup: {
        from: "produtos",
        localField: "produtoCodigo",
        foreignField: "codigoLivre", // o estoque (ATIVMOB) usa o E02_LIVRE, nao o E02_ID
        as: "_p",
      },
    },
    {
      $addFields: {
        precoTabela: { $arrayElemAt: ["$_p.precoTabela", 0] },
        precoMinimo: { $arrayElemAt: ["$_p.precoMinimo", 0] },
        custo: { $arrayElemAt: ["$_p.custo", 0] },
      },
    },
    { $unset: "_p" },
    // Recalcula diasParaVencer no momento da consulta
    {
      $addFields: {
        diasParaVencer: {
          $dateDiff: {
            startDate: "$$NOW",
            endDate: "$dataValidade",
            unit: "day",
          },
        },
      },
    },
    { $sort: { diasParaVencer: 1 } },
    { $limit: lim },
  ];

  const itens = await Estoque.aggregate(pipeline);

  // Enriquecer cada item com dados de rede (codigoRede, redeSubrede, subrede)
  const itensEnriquecidos = itens.map((it) => {
    const rede = redeMap[String(it.clienteCodigo)] || {};
    return { ...it, codigoRede: rede.codigoRede || null, redeSubrede: rede.redeSubrede || null, subrede: rede.subrede || null };
  });

  res.json({ total: itensEnriquecidos.length, itens: itensEnriquecidos });
}

// Historico de contagens do produto na loja (60 dias), direto da tabela de origem (somente leitura).
// A tela agrupa por lote (data de validade) para acompanhar a evolucao de cada um.
const DIAS_HISTORICO = 60;
const SQL_HISTORICO = `
SELECT to_char(event_dth, 'YYYY-MM-DD"T"HH24:MI') AS contado_em,
       agent_name, agent_code, COALESCE(quantidade, 0) AS quantidade,
       to_char(data_validade, 'YYYY-MM-DD') AS data_validade
FROM public.ativmob_estoque
WHERE codigo_destino = $1 AND produto_codigo = $2 AND event_dth >= CURRENT_DATE - ${DIAS_HISTORICO}
ORDER BY event_dth DESC, data_validade
LIMIT 300;
`;

/** O usuario pode ver este cliente? Mesmo escopo de carteira da listagem. */
async function clienteNoEscopo(user, clienteCodigo) {
  if (user.role === "vendedor") return !!(await Carteira.exists({ vendedorCodigo: user.codigo, clienteCodigo }));
  if (user.role === "supervisor") return !!(await Carteira.exists({ supervisorCodigo: user.codigo, clienteCodigo }));
  return true; // admin/diretoria
}

/**
 * Detalhe de um item do estoque: de onde veio a quantidade (lotes por validade, quem contou e
 * quando) e o historico de contagens do produto na loja. O historico e melhor esforco: se o
 * Postgres de BI nao responder, volta `historico: null` e o resto intacto.
 */
async function detalhes(req, res) {
  const item = await Estoque.findById(req.params.id).select("-raw").lean().catch(() => null);
  if (!item || !(await clienteNoEscopo(req.user, item.clienteCodigo))) {
    return res.status(404).json({ error: "Item de estoque nao encontrado" });
  }

  const carteira = await Carteira.findOne({ clienteCodigo: item.clienteCodigo }, "codigoRede redeSubrede subrede").lean();

  let historico = null;
  if (pgConfigurado()) {
    try {
      const linhas = await query(SQL_HISTORICO, [item.clienteCodigo, item.produtoCodigo]);
      historico = linhas.map((l) => ({
        contadoEm: l.contado_em,
        agente: l.agent_name ? String(l.agent_name).trim() : null,
        agenteCodigo: l.agent_code != null ? String(l.agent_code).trim() : null,
        quantidade: Number(l.quantidade) || 0,
        dataValidade: l.data_validade,
      }));
    } catch (err) {
      console.error("[estoque/detalhes] historico indisponivel:", err.message);
    }
  }

  res.json({
    item: {
      ...item,
      codigoRede: carteira?.codigoRede || null,
      redeSubrede: carteira?.redeSubrede || null,
      subrede: carteira?.subrede || null,
    },
    sincronizadoEm: item.updatedAt,
    historico,
    diasHistorico: DIAS_HISTORICO,
  });
}

/** Codigos de cliente que o usuario enxerga (null = todos). Mesmo escopo da listagem. */
async function clientesNoEscopo(user) {
  if (user.role === "vendedor") return Carteira.distinct("clienteCodigo", { vendedorCodigo: user.codigo });
  if (user.role === "supervisor") return Carteira.distinct("clienteCodigo", { supervisorCodigo: user.codigo });
  return null;
}

const MAX_EXPORTACAO = 2000;

/**
 * Planilha (xlsx) dos itens selecionados no painel, com o preco da ultima compra de cada loja no
 * ERP. Se o ERP nao responder, a planilha sai com as colunas de compra vazias.
 */
async function exportar(req, res) {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, MAX_EXPORTACAO) : [];
  if (!ids.length) return res.status(400).json({ error: "Selecione ao menos um item." });

  const escopo = await clientesNoEscopo(req.user);
  const match = { _id: { $in: ids } };
  if (escopo) match.clienteCodigo = { $in: escopo };
  const itens = await Estoque.find(match, "clienteCodigo cliente produtoCodigo produto quantidade dataValidade ultimaVisitaEm ultimaVisitaPor")
    .sort({ dataValidade: 1, cliente: 1, produto: 1 })
    .lean();
  if (!itens.length) return res.status(404).json({ error: "Nenhum item encontrado." });

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  for (const it of itens) {
    it.diasParaVencer = it.dataValidade ? Math.round((new Date(it.dataValidade) - hoje) / 864e5) : null;
  }

  // Rede de cada loja (para o preco pela rede quando a loja nao compra em nome proprio)
  const redePorCliente = new Map((await Carteira.find({ clienteCodigo: { $in: [...new Set(itens.map((it) => it.clienteCodigo))] } }, "clienteCodigo codigoRede").lean()).map((c) => [c.clienteCodigo, c.codigoRede]));
  for (const it of itens) it.codigoRede = redePorCliente.get(it.clienteCodigo) || null;

  let compras = new Map();
  const comprasRede = new Map();
  try {
    compras = await buscarUltimasComprasLote(itens.map((it) => ({ clienteCodigo: it.clienteCodigo, produtoCodigo: it.produtoCodigo })));
    // Sem compra da loja: tenta a ultima compra da rede (qualquer loja ou o CD dela), uma consulta por rede
    const porRede = new Map();
    for (const it of itens) {
      if (!it.codigoRede || compras.has(`${it.clienteCodigo}|${it.produtoCodigo}`)) continue;
      if (!porRede.has(it.codigoRede)) porRede.set(it.codigoRede, new Set());
      porRede.get(it.codigoRede).add(it.produtoCodigo);
    }
    for (const [codigoRede, produtos] of porRede) {
      const r = await buscarUltimaCompraRedeBatch(codigoRede, [...produtos]);
      for (const [produtoCodigo, c] of Object.entries(r)) comprasRede.set(`${codigoRede}|${produtoCodigo}`, { precoUltimaCompra: c.preco, dataUltimaCompra: c.data });
    }
  } catch (err) {
    console.error("[estoque/exportar] ultima compra indisponivel:", err.message);
  }

  const buffer = await gerarPlanilha(montarLinhas(itens, compras, comprasRede));
  const nome = `vencimentos-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
  res.setHeader("X-Itens", String(itens.length));
  res.send(buffer);
}

module.exports = { listar, detalhes, exportar };
