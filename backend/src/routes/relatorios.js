const express = require("express");
const { auth, requirePermission } = require("../middlewares/auth");
const svc = require("../services/relatoriosService");

const router = express.Router();

router.use(auth);

const handler = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[relatorios]", err);
    res.status(status).json({ error: err.publicMessage || "Erro interno" });
  }
};

// A pagina chega como corpo binario (a imagem PNG/JPEG ja renderizada no navegador do admin)
const imagemRaw = express.raw({ type: () => true, limit: "7mb" });

const ver = requirePermission("relatorios.ver");
const gerenciar = requirePermission("relatorios.gerenciar");

// ── Leitura (quem tem "relatorios.ver") ─────────────────────────────────────────
router.get("/", ver, handler(async (_req, res) => res.json({ relatorios: await svc.listar() })));

router.get("/:id", ver, handler(async (req, res) => res.json({ relatorio: await svc.detalhar(req.params.id) })));

router.get("/:id/paginas/:numero", ver, handler(async (req, res) => {
  const { mime, dados } = await svc.imagem(req.params.id, req.params.numero);
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(dados);
}));

// ── Importacao e manutencao (quem tem "relatorios.gerenciar") ───────────────────
router.post("/", gerenciar, handler(async (req, res) => {
  res.status(201).json({ relatorio: await svc.criar(req.body || {}, req.user) });
}));

router.put("/:id/paginas/:numero", gerenciar, imagemRaw, handler(async (req, res) => {
  res.json(await svc.gravarPagina(req.params.id, req.params.numero, req.body, { largura: req.query.largura, altura: req.query.altura }));
}));

router.post("/:id/publicar", gerenciar, handler(async (req, res) => {
  res.json({ relatorio: await svc.publicar(req.params.id) });
}));

router.put("/:id", gerenciar, handler(async (req, res) => {
  res.json({ relatorio: await svc.atualizar(req.params.id, req.body || {}) });
}));

router.delete("/:id", gerenciar, handler(async (req, res) => {
  await svc.remover(req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
