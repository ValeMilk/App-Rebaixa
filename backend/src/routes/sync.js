const express = require("express");
const { rodarSyncEstoque, rodarSyncCarteira, rodarSyncProdutos, rodarSyncERP, status } = require("../controllers/syncController");
const { auth, requireRole } = require("../middlewares/auth");

const router = express.Router();

router.use(auth, requireRole("admin", "diretoria"));

router.get("/status", status);
router.post("/estoque",  rodarSyncEstoque);
router.post("/carteira", rodarSyncCarteira);
router.post("/produtos", rodarSyncProdutos);
router.post("/erp",      rodarSyncERP);       // carteira + produtos de uma vez

module.exports = router;
