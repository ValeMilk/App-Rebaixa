const express = require("express");
const {
  listar,
  redesDisponiveis,
  supervisoresDisponiveis,
  criar,
  atualizar,
  remover,
} = require("../controllers/responsavelRedeController");
const { auth, requirePermission } = require("../middlewares/auth");
const { usuarioPode } = require("../services/permissoesService");

// Listas de apoio (filtros de rede e de supervisor): admin e diretoria, ou quem tem as telas que as usam
async function podeListasDeApoio(req, res, next) {
  try {
    if (req.user.role === "admin" || req.user.role === "diretoria") return next();
    if (await usuarioPode(req.user, "responsaveis_rede.gerenciar", "encartes.performance")) return next();
    return res.status(403).json({ error: "Acesso restrito" });
  } catch (err) {
    return next(err);
  }
}

const router = express.Router();

// Supervisores disponíveis: admin e diretoria podem acessar
router.get("/supervisores-disponiveis", auth, podeListasDeApoio, supervisoresDisponiveis);

// Redes disponíveis: admin e diretoria podem acessar
router.get("/redes-disponiveis", auth, podeListasDeApoio, redesDisponiveis);

// Demais endpoints: apenas admin
router.use(auth, requirePermission("responsaveis_rede.gerenciar"));

router.get("/", listar);
router.post("/", criar);
router.put("/:id", atualizar);
router.delete("/:id", remover);

module.exports = router;
