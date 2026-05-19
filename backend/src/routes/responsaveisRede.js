const express = require("express");
const {
  listar,
  redesDisponiveis,
  supervisoresDisponiveis,
  criar,
  atualizar,
  remover,
} = require("../controllers/responsavelRedeController");
const { auth, requireRole } = require("../middlewares/auth");

const router = express.Router();

router.use(auth, requireRole("admin"));

router.get("/", listar);
router.get("/redes-disponiveis", redesDisponiveis);
router.get("/supervisores-disponiveis", supervisoresDisponiveis);
router.post("/", criar);
router.put("/:id", atualizar);
router.delete("/:id", remover);

module.exports = router;
