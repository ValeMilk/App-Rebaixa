const express = require("express");
const { auth, requirePermission } = require("../middlewares/auth");
const c = require("../controllers/pendenciasController");

// v2.0 fase 1c: pendencias de contagem (lista do usuario, contador, vista, acao e acompanhamento do admin)
const router = express.Router();
router.use(auth);

router.get("/acompanhamento", requirePermission("pendencias.acompanhar"), c.acompanhamento);

router.use(requirePermission("pendencias.receber"));
router.get("/", c.listar);
router.get("/contador", c.contador);
router.post("/vistas", c.vistas);
router.post("/:id/vista", c.vista);
router.post("/:id/acao", c.acao);

module.exports = router;
