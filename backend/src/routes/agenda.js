const express = require("express");
const { auth, requirePermission } = require("../middlewares/auth");
const svc = require("../services/agendaService");

const router = express.Router();

router.use(auth);

const handler = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[agenda]", err);
    res.status(status).json({ error: err.publicMessage || "Erro interno" });
  }
};

const ver = requirePermission("agenda_visitas.gerenciar", "agenda_visitas.ver_todas");
const gerenciar = requirePermission("agenda_visitas.gerenciar");
const verTodas = requirePermission("agenda_visitas.ver_todas");

// Visitas do periodo (?de=AAAA-MM-DD&ate=AAAA-MM-DD[&dono=<codigo>|todos])
router.get("/", ver, handler(async (req, res) => {
  const r = await svc.listar(req.user, { de: req.query.de, ate: req.query.ate, dono: req.query.dono });
  res.json(r);
}));

// Supervisores para o seletor de quem consulta a agenda dos outros
router.get("/donos", verTodas, handler(async (_req, res) => res.json({ donos: await svc.donosDisponiveis() })));

router.get("/cidades", gerenciar, handler(async (_req, res) => res.json({ cidades: await svc.cidades() })));

router.get("/redes", gerenciar, handler(async (req, res) => res.json(await svc.redes(req.user, req.query.cidade, req.query.dono))));

router.get("/lojas", gerenciar, handler(async (req, res) => res.json({ lojas: await svc.lojas(req.user, req.query.cidade, req.query.dono) })));

router.post("/", gerenciar, handler(async (req, res) => {
  res.status(201).json({ visita: await svc.criar(req.user, req.body || {}) });
}));

router.post("/copiar-semana", gerenciar, handler(async (req, res) => {
  res.json(await svc.copiarSemana(req.user, req.body || {}));
}));

router.put("/:id", gerenciar, handler(async (req, res) => {
  res.json({ visita: await svc.atualizar(req.user, req.params.id, req.body || {}) });
}));

router.delete("/:id", gerenciar, handler(async (req, res) => {
  await svc.remover(req.user, req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
