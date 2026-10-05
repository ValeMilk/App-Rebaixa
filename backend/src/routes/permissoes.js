const express = require("express");
const { auth, requirePermission } = require("../middlewares/auth");
const User = require("../models/User");
const svc = require("../services/permissoesService");
const { GRUPOS, PERFIS, PERFIL_LABEL } = require("../constants/permissoes");

const router = express.Router();

router.use(auth, requirePermission("permissoes.gerenciar"));

const handler = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[permissoes]", err);
    res.status(status).json({ error: err.publicMessage || err.message || "Erro interno" });
  }
};

// Quantos usuarios ativos tem cada perfil (como principal ou adicional)
async function usuariosPorPerfil() {
  const users = await User.find({ ativo: true }, "role roles").lean();
  const n = Object.fromEntries(PERFIS.map((p) => [p, 0]));
  for (const u of users) for (const p of new Set([u.role, ...(u.roles || [])])) if (p in n) n[p] += 1;
  return n;
}

async function resposta() {
  const [perfis, usuarios] = await Promise.all([svc.obterMatriz(), usuariosPorPerfil()]);
  return {
    grupos: GRUPOS,
    perfis: perfis.map((p) => ({ ...p, label: PERFIL_LABEL[p.perfil], usuarios: usuarios[p.perfil] })),
  };
}

router.get("/", handler(async (_req, res) => res.json(await resposta())));

router.put("/:perfil", handler(async (req, res) => {
  await svc.salvarPerfil(req.params.perfil, (req.body || {}).permissoes, req.user);
  res.json(await resposta());
}));

router.post("/:perfil/restaurar", handler(async (req, res) => {
  await svc.restaurarPerfil(req.params.perfil);
  res.json(await resposta());
}));

module.exports = router;
