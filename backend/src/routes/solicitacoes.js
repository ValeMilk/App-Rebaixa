const express = require("express");
const {
  criar,
  listar,
  obter,
  decidir,
  cancelar,
  listarAtivas,
} = require("../controllers/solicitacaoController");
const { auth, requirePermission } = require("../middlewares/auth");

const router = express.Router();

router.use(auth);

router.get("/", listar);
router.get("/ativas", listarAtivas);
router.post("/", requirePermission("solicitacoes.criar"), criar);
router.get("/:id", obter);
router.post("/:id/decidir", requirePermission("solicitacoes.decidir"), decidir);
router.post("/:id/cancelar", cancelar);

module.exports = router;
