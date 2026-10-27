const express = require("express");
const { auth } = require("../middlewares/auth");
const c = require("../controllers/pushController");

// v2.0 fase 1c: inscricao de push (Web Push / VAPID) do navegador do usuario logado
const router = express.Router();
router.use(auth);

router.get("/chave-publica", c.chavePublica);
router.post("/inscrever", c.inscrever);
router.delete("/inscrever", c.remover);

module.exports = router;
