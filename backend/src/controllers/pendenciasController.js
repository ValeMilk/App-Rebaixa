/**
 * API das pendencias de contagem (v2.0, fase 1c).
 * Lista e contador sao do USUARIO logado (destinatarios.userId); o acompanhamento e do admin.
 */
const mongoose = require("mongoose");
const Pendencia = require("../models/Pendencia");
const Ruptura = require("../models/Ruptura");
const { registrarAcao, agregarAcompanhamento, LIMITE_LISTA } = require("../services/pendenciasService");

const DIAS_PERMITIDOS = [7, 30, 90];

function erro(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  e.publicMessage = mensagem;
  return e;
}

function idValido(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// $elemMatch em subdocumento: passa ObjectId pronto para nao depender do cast do mongoose
function oid(id) {
  return idValido(id) ? new mongoose.Types.ObjectId(String(id)) : id;
}

// Filtro "aberta": sem acao e nao superada por outra pendencia
function filtroAberta() {
  return { "acao.tipo": null, superadaPor: null };
}

/** Pendencia como a tela usa: o destinatario do usuario em `minha`, os demais em `outros`. */
function paraResposta(p, userId) {
  const minha = (p.destinatarios || []).find((d) => String(d.userId) === String(userId)) || null;
  const outros = (p.destinatarios || []).filter((d) => String(d.userId) !== String(userId));
  return {
    _id: p._id,
    chave: p.chave,
    evento: p.evento,
    clienteCodigo: p.clienteCodigo,
    cliente: p.cliente,
    produtoCodigo: p.produtoCodigo,
    produto: p.produto,
    codigoRede: p.codigoRede,
    redeSubrede: p.redeSubrede,
    dataValidade: p.dataValidade,
    quantidade: p.quantidade,
    pctShelf: p.pctShelf,
    contadoEm: p.contadoEm,
    contadoPor: p.contadoPor,
    enviadaEm: minha?.enviadaEm || p.createdAt,
    aberta: !(p.acao && p.acao.tipo) && !p.superadaPor,
    superada: !!p.superadaPor,
    acao: p.acao && p.acao.tipo ? p.acao : null,
    minha: minha ? { papel: minha.papel, vistaEm: minha.vistaEm || null } : null,
    outros: outros.map((d) => ({ userId: d.userId, nome: d.nome, papel: d.papel, vistaEm: d.vistaEm || null })),
  };
}

// GET /api/pendencias?abertas=1
async function listar(req, res, next) {
  try {
    const abertas = req.query.abertas === undefined ? true : !["0", "false", ""].includes(String(req.query.abertas));
    const filtro = { "destinatarios.userId": req.user.id };
    if (abertas) Object.assign(filtro, filtroAberta());
    const lista = await Pendencia.find(filtro).sort({ createdAt: -1 }).limit(LIMITE_LISTA).lean();
    res.json({ abertas, total: lista.length, pendencias: lista.map((p) => paraResposta(p, req.user.id)) });
  } catch (err) {
    next(err);
  }
}

// GET /api/pendencias/contador -> { naoVistas, abertas }
async function contador(req, res, next) {
  try {
    const base = { "destinatarios.userId": req.user.id, ...filtroAberta() };
    const [abertas, naoVistas] = await Promise.all([
      Pendencia.countDocuments(base),
      Pendencia.countDocuments({ ...filtroAberta(), destinatarios: { $elemMatch: { userId: oid(req.user.id), vistaEm: null } } }),
    ]);
    res.json({ naoVistas, abertas });
  } catch (err) {
    next(err);
  }
}

async function marcarVistas(ids, userId) {
  const validos = ids.filter(idValido);
  if (!validos.length) return 0;
  const r = await Pendencia.updateMany(
    { _id: { $in: validos }, destinatarios: { $elemMatch: { userId: oid(userId), vistaEm: null } } },
    { $set: { "destinatarios.$.vistaEm": new Date() } }
  );
  return r.modifiedCount || 0;
}

// POST /api/pendencias/:id/vista
async function vista(req, res, next) {
  try {
    if (!idValido(req.params.id)) throw erro(400, "Pendência inválida.");
    const marcadas = await marcarVistas([req.params.id], req.user.id);
    res.json({ ok: true, marcadas });
  } catch (err) {
    next(err);
  }
}

// POST /api/pendencias/vistas { ids: [] }
async function vistas(req, res, next) {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, LIMITE_LISTA) : [];
    const marcadas = await marcarVistas(ids, req.user.id);
    res.json({ ok: true, marcadas });
  } catch (err) {
    next(err);
  }
}

// POST /api/pendencias/:id/acao { tipo: "ja_resolvi" | "pedido_feito", motivo }
async function acao(req, res, next) {
  try {
    if (!idValido(req.params.id)) throw erro(400, "Pendência inválida.");
    const tipo = req.body?.tipo;
    const motivo = String(req.body?.motivo || "").trim();
    if (!["ja_resolvi", "pedido_feito"].includes(tipo)) throw erro(400, "Ação inválida. Use ja_resolvi ou pedido_feito.");
    if (tipo === "ja_resolvi" && !motivo) throw erro(400, "Informe o motivo.");

    const p = await Pendencia.findById(req.params.id).lean();
    if (!p) throw erro(404, "Pendência não encontrada.");
    const minha = (p.destinatarios || []).some((d) => String(d.userId) === String(req.user.id));
    if (!minha) throw erro(403, "Esta pendência não é sua.");
    if (p.acao && p.acao.tipo) throw erro(409, `Esta pendência já tem ação registrada por ${p.acao.porNome || "outro usuário"}.`);
    if (tipo === "pedido_feito" && p.evento !== "ruptura") throw erro(400, "Pedido feito só vale para ruptura.");

    if (tipo === "pedido_feito") {
      await Ruptura.updateMany(
        { clienteCodigo: p.clienteCodigo, produtoCodigo: p.produtoCodigo, ativa: true, "pedidoFeito.em": null },
        { $set: { pedidoFeito: { em: new Date(), porUserId: req.user.id, porNome: req.user.nome || null, observacao: motivo || null } } }
      );
    }

    // Marca esta e as demais abertas da mesma loja+produto
    const r = await registrarAcao({ clienteCodigo: p.clienteCodigo, produtoCodigo: p.produtoCodigo, tipo, user: req.user, motivo: motivo || null });
    const atual = await Pendencia.findById(p._id).lean();
    res.json({ ok: true, atualizadas: r.atualizadas, pendencia: paraResposta(atual, req.user.id) });
  } catch (err) {
    next(err);
  }
}

// GET /api/pendencias/acompanhamento?dias=30  (pendencias.acompanhar)
async function acompanhamento(req, res, next) {
  try {
    const pedido = Number(req.query.dias);
    const dias = DIAS_PERMITIDOS.includes(pedido) ? pedido : 30;
    const desde = new Date(Date.now() - dias * 24 * 3600 * 1000);
    const lista = await Pendencia.find({ createdAt: { $gte: desde }, superadaPor: null }).sort({ createdAt: 1 }).lean();
    const agregado = agregarAcompanhamento(lista, { agora: new Date() });
    res.json({ dias, desde, ...agregado });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, contador, vista, vistas, acao, acompanhamento };
