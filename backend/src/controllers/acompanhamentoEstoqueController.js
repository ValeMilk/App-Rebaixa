const svc = require("../services/acompanhamentoEstoque/consulta");

const handler = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[acompanhamento-estoque]", err);
    res.status(status).json({ error: err.publicMessage || err.message || "Erro interno" });
  }
};

exports.redes = handler(async (_req, res) => {
  res.json({ redes: await svc.listarRedes() });
});

exports.retratos = handler(async (req, res) => {
  res.json({ retratos: await svc.serie(String(req.query.codigoRede || ""), req.query.limite) });
});

exports.painel = handler(async (req, res) => {
  res.json(await svc.painel({ retratoId: String(req.query.retratoId || ""), compararCom: req.query.compararCom }));
});
