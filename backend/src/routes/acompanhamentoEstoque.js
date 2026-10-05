const express = require("express");
const { auth, requirePermission } = require("../middlewares/auth");
const c = require("../controllers/acompanhamentoEstoqueController");

const router = express.Router();

// Por enquanto, so o administrador enxerga o acompanhamento de estoque.
router.use(auth, requirePermission("acompanhamento_estoque.ver"));

router.get("/redes", c.redes);
router.get("/retratos", c.retratos);
router.get("/painel", c.painel);

module.exports = router;
