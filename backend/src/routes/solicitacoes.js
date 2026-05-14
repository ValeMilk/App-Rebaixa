const express = require("express");
const {
  criar,
  listar,
  obter,
  decidir,
  cancelar,
} = require("../controllers/solicitacaoController");
const { auth, requireRole } = require("../middlewares/auth");

const router = express.Router();

router.use(auth);

router.get("/", listar);
router.post("/", requireRole("supervisor", "admin"), criar);
router.get("/:id", obter);
router.post("/:id/decidir", requireRole("diretoria", "admin"), decidir);
router.post("/:id/cancelar", cancelar);

module.exports = router;
