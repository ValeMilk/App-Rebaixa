const express = require("express");
const {
  rodarSyncEstoque,
  rodarSyncCarteira,
  rodarSyncProdutos,
  rodarSyncERP,
  rodarSyncCarteiraEsigma,
  rodarSyncProdutosEsigma,
  rodarSyncEsigma,
  triggerBackground,
  status,
} = require("../controllers/syncController");
const { auth, requireRole } = require("../middlewares/auth");

const router = express.Router();

// Qualquer usuário autenticado pode disparar sync em background ao abrir o app
router.post("/trigger", auth, triggerBackground);

router.use(auth, requireRole("admin", "diretoria"));

router.get("/status", status);
router.post("/estoque",  rodarSyncEstoque);
router.post("/carteira", rodarSyncCarteira);
router.post("/produtos", rodarSyncProdutos);
router.post("/erp",      rodarSyncERP);       // carteira + produtos de uma vez

router.post("/esigma/carteira", rodarSyncCarteiraEsigma);
router.post("/esigma/produtos", rodarSyncProdutosEsigma);
router.post("/esigma",          rodarSyncEsigma);          // carteira + produtos do Esigma de uma vez

module.exports = router;
