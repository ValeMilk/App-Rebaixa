const Estoque = require("../models/Estoque");
const Carteira = require("../models/Carteira");

/**
 * Lista o estoque critico (ja filtrado pela view do Postgres na sincronizacao —
 * ver estoqueSyncService.js). Cada documento e um lote/validade distinto.
 * Aplica filtros opcionais de classificacao/cliente/produto e restricao por carteira.
 */
async function listar(req, res) {
  const { classificacao, clienteCodigo, produto, q, limit = 500 } = req.query;

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
    { $sort: { diasParaVencer: 1 } },
    { $limit: Number(limit) },
  ];

  const itens = await Estoque.aggregate(pipeline);

  // Enriquecer cada item com dados de rede (codigoRede, redeSubrede, subrede)
  const itensEnriquecidos = itens.map((it) => {
    const rede = redeMap[String(it.clienteCodigo)] || {};
    return { ...it, codigoRede: rede.codigoRede || null, redeSubrede: rede.redeSubrede || null, subrede: rede.subrede || null };
  });

  res.json({ total: itensEnriquecidos.length, itens: itensEnriquecidos });
}

async function resumo(req, res) {
  const match = {};
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
    // Recalcula classificacao dinamicamente
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
