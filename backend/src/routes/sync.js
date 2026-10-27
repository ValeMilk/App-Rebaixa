const express = require("express");
const {
  rodarSyncEstoque,
  rodarSyncCarteira,
  rodarSyncProdutos,
  rodarSyncERP,
  rodarSyncCarteiraEsigma,
  rodarSyncProdutosEsigma,
  rodarSyncEsigma,
  rodarSyncVisao,
  rodarSyncCompras,
  triggerBackground,
  status,
} = require("../controllers/syncController");
const { auth, requirePermission } = require("../middlewares/auth");

const router = express.Router();

// Qualquer usuário autenticado pode disparar sync em background ao abrir o app
router.post("/trigger", auth, triggerBackground);

router.use(auth, requirePermission("sincronizacao.executar"));

router.get("/status", status);
router.post("/estoque",  rodarSyncEstoque);
router.post("/carteira", rodarSyncCarteira);
router.post("/produtos", rodarSyncProdutos);
router.post("/erp",      rodarSyncERP);       // carteira + produtos de uma vez

router.post("/esigma/carteira", rodarSyncCarteiraEsigma);
router.post("/esigma/produtos", rodarSyncProdutosEsigma);
router.post("/esigma",          rodarSyncEsigma);          // carteira + produtos do Esigma de uma vez

// v2.0: visao do vendedor (ItemLoja/Ruptura a partir do BI + compras) e compras de 90 dias (Lacteus)
router.post("/visao",   rodarSyncVisao);
router.post("/compras", rodarSyncCompras);

module.exports = router;
