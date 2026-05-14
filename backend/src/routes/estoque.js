const express = require("express");
const { listar, resumo } = require("../controllers/estoqueController");
const { auth } = require("../middlewares/auth");

const router = express.Router();

router.use(auth);

router.get("/", listar);
router.get("/resumo", resumo);

module.exports = router;
