/** API de inscricao de push (v2.0, fase 1c). */
const pushService = require("../services/pushService");

// GET /api/push/chave-publica -> { chave, ativo }
async function chavePublica(_req, res) {
  const chave = pushService.chavePublica();
  res.json({ chave, ativo: !!chave });
}

// POST /api/push/inscrever { subscription, userAgent }
async function inscrever(req, res, next) {
  try {
    const r = await pushService.inscrever(req.user.id, req.body?.subscription, req.body?.userAgent);
    res.json({ ...r, ativo: pushService.pushAtivo() });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/push/inscrever { endpoint }
async function remover(req, res, next) {
  try {
    const endpoint = req.body?.endpoint || req.query?.endpoint;
    const r = await pushService.remover(req.user.id, endpoint);
    res.json({ ok: true, ...r });
  } catch (err) {
    next(err);
  }
}

module.exports = { chavePublica, inscrever, remover };
