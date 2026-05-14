const Estoque = require("../models/Estoque");
const Carteira = require("../models/Carteira");

/**
 * Lista o estoque mais recente por (cliente, produto).
 * Aplica filtros de classificacao, cliente e supervisor.
 * Para supervisor, restringe pelos clientes da sua carteira.
 */
// Retorna o inicio do dia de hoje (midnight UTC-3 aproximado)
function hojeMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function listar(req, res) {
  const { classificacao, clienteCodigo, produto, q, limit = 500 } = req.query;
  const hoje = hojeMidnight();
  const limite31 = new Date(hoje);
  limite31.setDate(limite31.getDate() + 31);

  // Filtra por dataValidade dinamicamente (ignora diasParaVencer stale)
  const match = {
    quantidade: { $gt: 5 },
    dataValidade: { $gte: hoje, $lte: limite31 },
  };

  if (classificacao) match.classificacao = classificacao;
  if (clienteCodigo) match.clienteCodigo = String(clienteCodigo);
  if (produto) match.produto = produto;
  if (q) match.produto = { $regex: q, $options: "i" };

  // Restrigir por carteira conforme role
  if (req.user.role === "vendedor") {
    const carteira = await Carteira.find({ vendedorCodigo: req.user.codigo }, "clienteCodigo");
    const codigos = carteira.map((c) => c.clienteCodigo);
    match.clienteCodigo = { $in: codigos.length ? codigos : ["__none__"] };
  } else if (req.user.role === "supervisor") {
    const carteira = await Carteira.find({ supervisorCodigo: req.user.codigo }, "clienteCodigo");
    const codigos = carteira.map((c) => c.clienteCodigo);
    match.clienteCodigo = { $in: codigos.length ? codigos : ["__none__"] };
  }

  // Pegar o snapshot mais recente por (clienteCodigo, produto)
  const pipeline = [
    { $match: match },
    { $sort: { eventDth: -1 } },
    {
      $group: {
        _id: { clienteCodigo: "$clienteCodigo", produto: "$produto" },
        doc: { $first: "$$ROOT" },
      },
    },
    { $replaceRoot: { newRoot: "$doc" } },
    // Busca precoTabela e custo do catalogo de produtos
    {
      $lookup: {
        from: "produtos",
        localField: "produtoCodigo",
        foreignField: "codigo",
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
    { $sort: { diasParaVencer: 1, eventDth: -1 } },
    { $limit: Number(limit) },
  ];

  const itens = await Estoque.aggregate(pipeline);
  res.json({ total: itens.length, itens });
}

async function resumo(req, res) {
  const hoje = hojeMidnight();
  const limite31 = new Date(hoje);
  limite31.setDate(limite31.getDate() + 31);

  const match = {
    quantidade: { $gt: 5 },
    dataValidade: { $gte: hoje, $lte: limite31 },
  };
  if (req.user.role === "vendedor") {
    const carteira = await Carteira.find({ vendedorCodigo: req.user.codigo }, "clienteCodigo");
    const codigos = carteira.map((c) => c.clienteCodigo);
    match.clienteCodigo = { $in: codigos.length ? codigos : ["__none__"] };
  } else if (req.user.role === "supervisor") {
    const carteira = await Carteira.find({ supervisorCodigo: req.user.codigo }, "clienteCodigo");
    const codigos = carteira.map((c) => c.clienteCodigo);
    match.clienteCodigo = { $in: codigos.length ? codigos : ["__none__"] };
  }

  const agg = await Estoque.aggregate([
    { $match: match },
    { $sort: { eventDth: -1 } },
    {
      $group: {
        _id: { c: "$clienteCodigo", p: "$produto" },
        doc: { $first: "$$ROOT" },
      },
    },
    // Recalcula classificacao dinamicamente
    {
      $addFields: {
        diasParaVencer: {
          $dateDiff: {
            startDate: "$$NOW",
            endDate: "$doc.dataValidade",
            unit: "day",
          },
        },
      },
    },
    {
      $addFields: {
        classificacao: {
          $switch: {
            branches: [
              { case: { $lte: ["$diasParaVencer", 0] }, then: "vencido" },
              { case: { $lte: ["$diasParaVencer", 15] }, then: "critico" },
              { case: { $lte: ["$diasParaVencer", 30] }, then: "alerta" },
            ],
            default: "atencao",
          },
        },
      },
    },
    {
      $group: {
        _id: "$classificacao",
        total: { $sum: 1 },
      },
    },
  ]);

  const out = { vencido: 0, critico: 0, alerta: 0, atencao: 0, ok: 0 };
  for (const r of agg) out[r._id] = r.total;
  res.json(out);
}

module.exports = { listar, resumo };
