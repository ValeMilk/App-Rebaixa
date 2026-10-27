const mongoose = require("mongoose");
const ItemLoja = require("../models/ItemLoja");
const Ruptura = require("../models/Ruptura");
const Produto = require("../models/Produto");
const { clientesDoUsuario, alcancaCliente } = require("../services/escopoService");

/**
 * Visao do vendedor (v2.0, fase 1b): telas "Estoque e vencimento" e "Ruptura".
 * Tudo restrito ao alcance do usuario (escopoService): vendedor = carteira, supervisor = carteira +
 * redes de que e responsavel, diretoria/admin = tudo.
 */

// Ordem de exibicao dos itens dentro da loja (o que pede acao primeiro)
const ORDEM_SITUACAO = ["ruptura", "rebaixa", "giro", "nao_contado", "nao_reencontrado", "zerado", "ok", "sem_shelf"];
const LIMITE_LOJAS_PADRAO = 400;

function escaparRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function contarPorSituacao(itens) {
  const out = {};
  for (const s of ORDEM_SITUACAO) out[s] = 0;
  for (const it of itens) out[it.situacao] = (out[it.situacao] || 0) + 1;
  return out;
}

/** Filtro base do ItemLoja para o usuario; null quando a loja pedida esta fora do alcance. */
async function filtroDoUsuario(req) {
  const clientes = await clientesDoUsuario(req.user);
  const match = {};
  if (clientes) match.clienteCodigo = { $in: clientes };
  const pedido = req.query.clienteCodigo ? String(req.query.clienteCodigo).trim() : "";
  if (pedido) {
    if (clientes && !clientes.includes(pedido)) return null;
    match.clienteCodigo = pedido;
  }
  return match;
}

async function atualizadoEm() {
  const ultimo = await ItemLoja.findOne({}, "sincronizadoEm").sort({ sincronizadoEm: -1 }).lean();
  return ultimo ? ultimo.sincronizadoEm : null;
}

/**
 * GET /api/visao/estoque?situacao=a,b&q=&clienteCodigo=&limit=
 * -> { atualizadoEm, totais: { itens, lojas, porSituacao }, lojas: [...], lojasTotal, truncado }
 */
async function listarEstoque(req, res) {
  try {
    const match = await filtroDoUsuario(req);
    const vazio = { atualizadoEm: await atualizadoEm(), totais: { itens: 0, lojas: 0, porSituacao: contarPorSituacao([]) }, lojas: [], lojasTotal: 0, truncado: false };
    if (!match) return res.json(vazio);

    if (req.query.situacao) {
      const lista = String(req.query.situacao).split(",").map((s) => s.trim()).filter((s) => ItemLoja.SITUACOES.includes(s));
      if (lista.length) match.situacao = { $in: lista };
    }
    const q = req.query.q ? String(req.query.q).trim() : "";
    if (q) match.produto = { $regex: escaparRegex(q), $options: "i" };

    const itens = await ItemLoja.find(match, "-__v -createdAt -updatedAt").lean();
    if (!itens.length) return res.json(vazio);

    // Preco de tabela do catalogo (o Ativmob/Lacteus usam o E02_LIVRE = codigoLivre)
    const codigos = [...new Set(itens.map((i) => i.produtoCodigo))];
    const produtos = await Produto.find({ codigoLivre: { $in: codigos } }, "codigoLivre precoTabela").lean();
    const preco = new Map(produtos.map((p) => [String(p.codigoLivre).trim(), p.precoTabela]));

    const lojas = new Map();
    for (const it of itens) {
      it.precoTabela = preco.has(it.produtoCodigo) ? preco.get(it.produtoCodigo) : null;
      let loja = lojas.get(it.clienteCodigo);
      if (!loja) {
        loja = {
          clienteCodigo: it.clienteCodigo,
          cliente: it.cliente,
          codigoRede: it.codigoRede || null,
          redeSubrede: it.redeSubrede || null,
          subrede: it.subrede || null,
          vendedorCodigo: it.vendedorCodigo || null,
          supervisorCodigo: it.supervisorCodigo || null,
          ultimaVisitaEm: it.ultimaVisitaEm || null,
          ultimaVisitaPor: it.ultimaVisitaPor || null,
          itens: [],
        };
        lojas.set(it.clienteCodigo, loja);
      }
      if (!loja.cliente && it.cliente) loja.cliente = it.cliente;
      if (!loja.ultimaVisitaEm && it.ultimaVisitaEm) { loja.ultimaVisitaEm = it.ultimaVisitaEm; loja.ultimaVisitaPor = it.ultimaVisitaPor || null; }
      loja.itens.push(it);
    }

    const posicao = (s) => { const i = ORDEM_SITUACAO.indexOf(s); return i < 0 ? ORDEM_SITUACAO.length : i; };
    const tempo = (d) => (d ? new Date(d).getTime() : Infinity);
    const lista = [...lojas.values()];
    for (const loja of lista) {
      loja.itens.sort((a, b) => posicao(a.situacao) - posicao(b.situacao) || tempo(a.dataValidade) - tempo(b.dataValidade) || String(a.produto).localeCompare(String(b.produto), "pt-BR"));
      loja.totais = contarPorSituacao(loja.itens);
      loja.totais.itens = loja.itens.length;
    }
    // Lojas com mais ruptura/rebaixa primeiro, depois giro, depois nome
    lista.sort((a, b) =>
      (b.totais.ruptura + b.totais.rebaixa) - (a.totais.ruptura + a.totais.rebaixa)
      || b.totais.giro - a.totais.giro
      || String(a.cliente).localeCompare(String(b.cliente), "pt-BR"));

    const limite = Math.max(1, Math.min(2000, Number(req.query.limit) || LIMITE_LOJAS_PADRAO));
    const recorte = lista.slice(0, limite);
    const porSituacao = contarPorSituacao(itens);

    res.json({
      atualizadoEm: itens.reduce((m, i) => (i.sincronizadoEm && (!m || i.sincronizadoEm > m) ? i.sincronizadoEm : m), null),
      totais: { itens: itens.length, lojas: lista.length, porSituacao },
      lojas: recorte,
      lojasTotal: lista.length,
      truncado: recorte.length < lista.length,
    });
  } catch (err) {
    console.error("[visao/estoque]", err);
    res.status(500).json({ error: "Erro ao carregar a visão das lojas" });
  }
}

/** GET /api/visao/resumo -> { atualizadoEm, total, lojas, porSituacao } (chips de filtro) */
async function resumo(req, res) {
  try {
    const match = await filtroDoUsuario(req);
    const base = { atualizadoEm: await atualizadoEm(), total: 0, lojas: 0, porSituacao: contarPorSituacao([]) };
    if (!match) return res.json(base);
    const grupos = await ItemLoja.aggregate([{ $match: match }, { $group: { _id: "$situacao", n: { $sum: 1 } } }]);
    for (const g of grupos) { base.porSituacao[g._id] = g.n; base.total += g.n; }
    base.lojas = (await ItemLoja.distinct("clienteCodigo", match)).length;
    res.json(base);
  } catch (err) {
    console.error("[visao/resumo]", err);
    res.status(500).json({ error: "Erro ao carregar o resumo" });
  }
}

/** GET /api/visao/rupturas -> { total, lojas: [{ clienteCodigo, cliente, codigoRede, redeSubrede, itens: [Ruptura] }] } */
async function listarRupturas(req, res) {
  try {
    const clientes = await clientesDoUsuario(req.user);
    const match = { ativa: true };
    if (clientes) match.clienteCodigo = { $in: clientes };
    const docs = await Ruptura.find(match, "-__v").sort({ contadoEm: -1 }).lean();

    const lojas = new Map();
    for (const r of docs) {
      let loja = lojas.get(r.clienteCodigo);
      if (!loja) {
        loja = { clienteCodigo: r.clienteCodigo, cliente: r.cliente, codigoRede: r.codigoRede || null, redeSubrede: r.redeSubrede || null, itens: [] };
        lojas.set(r.clienteCodigo, loja);
      }
      loja.itens.push(r);
    }
    const lista = [...lojas.values()].sort((a, b) => b.itens.length - a.itens.length || String(a.cliente).localeCompare(String(b.cliente), "pt-BR"));
    res.json({ total: docs.length, lojas: lista });
  } catch (err) {
    console.error("[visao/rupturas]", err);
    res.status(500).json({ error: "Erro ao carregar as rupturas" });
  }
}

/** POST /api/visao/rupturas/:id/pedido-feito { observacao } -> { ok, ruptura } (409 se ja marcado) */
async function marcarPedidoFeito(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Ruptura inválida" });
    const r = await Ruptura.findById(id).lean();
    if (!r) return res.status(404).json({ error: "Ruptura não encontrada" });
    if (!(await alcancaCliente(req.user, r.clienteCodigo))) return res.status(403).json({ error: "Loja fora do seu alcance" });
    if (r.pedidoFeito && r.pedidoFeito.em) {
      return res.status(409).json({ error: "Pedido já marcado como feito", pedidoFeito: r.pedidoFeito });
    }

    const observacao = String((req.body && req.body.observacao) || "").trim().slice(0, 500) || null;
    const pedidoFeito = { em: new Date(), porUserId: req.user.id || null, porNome: req.user.nome || null, observacao };
    // Atomico: so grava se ninguem marcou entre a leitura e a gravacao
    const atualizada = await Ruptura.findOneAndUpdate(
      { _id: id, $or: [{ "pedidoFeito.em": null }, { pedidoFeito: { $exists: false } }] },
      { $set: { pedidoFeito } },
      { new: true }
    ).lean();
    if (!atualizada) return res.status(409).json({ error: "Pedido já marcado como feito" });

    // Conta como "acao feita" nas pendencias (servico de outra entrega; hoje e um stub)
    try {
      await require("../services/pendenciasService").registrarAcao({
        clienteCodigo: r.clienteCodigo, produtoCodigo: r.produtoCodigo, tipo: "pedido_feito", user: req.user,
      });
    } catch (err) {
      console.error("[visao/pedido-feito] registrarAcao falhou:", err.message);
    }

    res.json({ ok: true, ruptura: atualizada });
  } catch (err) {
    console.error("[visao/pedido-feito]", err);
    res.status(500).json({ error: "Erro ao marcar o pedido" });
  }
}

module.exports = { listarEstoque, resumo, listarRupturas, marcarPedidoFeito, ORDEM_SITUACAO };
