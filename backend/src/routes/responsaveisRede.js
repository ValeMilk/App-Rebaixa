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

// Supervisores disponíveis: admin e diretoria podem acessar
router.get("/supervisores-disponiveis", auth, (req, res, next) => {
  if (req.user.role === "admin" || req.user.role === "diretoria") {
    return next();
  }
  res.status(403).json({ error: "Acesso restrito" });
}, supervisoresDisponiveis);

// Redes disponíveis: admin e diretoria podem acessar
router.get("/redes-disponiveis", auth, (req, res, next) => {
  if (req.user.role === "admin" || req.user.role === "diretoria") {
    return next();
  }
  res.status(403).json({ error: "Acesso restrito" });
}, redesDisponiveis);

// Demais endpoints: apenas admin
router.use(auth, requireRole("admin"));

router.get("/", listar);
router.post("/", criar);
router.put("/:id", atualizar);
router.delete("/:id", remover);

module.exports = router;
