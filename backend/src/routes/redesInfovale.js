const express = require("express");
const { auth, requirePermission } = require("../middlewares/auth");
const svc = require("../services/redesInfovaleService");

const router = express.Router();

router.use(auth, requirePermission("redes_infovale.gerenciar"));

const handler = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[redes-infovale]", err);
    res.status(status).json({ error: err.publicMessage || "Erro interno" });
  }
};

router.get("/", handler(async (_req, res) => res.json({ redes: await svc.listar() })));

// Listas do formulario: lojas do Ativmob fora do Lacteus e supervisores ativos
router.get("/opcoes", handler(async (_req, res) => {
  const [lojas, supervisores, redesLacteus] = await Promise.all([svc.lojasDisponiveis(), svc.supervisoresDisponiveis(), svc.redesLacteusDisponiveis()]);
  res.json({ lojas, supervisores, redesLacteus });
}));

router.post("/", handler(async (req, res) => {
  await svc.criar(req.body || {}, req.user);
  res.status(201).json({ redes: await svc.listar() });
}));

router.put("/:id", handler(async (req, res) => {
  await svc.atualizar(req.params.id, req.body || {}, req.user);
  res.json({ redes: await svc.listar() });
}));

router.delete("/:id", handler(async (req, res) => {
  await svc.remover(req.params.id);
  res.json({ redes: await svc.listar() });
}));

module.exports = router;
