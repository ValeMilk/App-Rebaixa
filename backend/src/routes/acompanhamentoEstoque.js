const express = require("express");
const { auth, requireRole } = require("../middlewares/auth");
const c = require("../controllers/acompanhamentoEstoqueController");

const router = express.Router();

// Por enquanto, so o administrador enxerga o acompanhamento de estoque.
router.use(auth, requireRole("admin"));

router.get("/redes", c.redes);
router.get("/retratos", c.retratos);
router.get("/painel", c.painel);

module.exports = router;
