const express = require("express");
const { listar, detalhes, exportar } = require("../controllers/estoqueController");
const { auth } = require("../middlewares/auth");

const router = express.Router();

router.use(auth);

router.get("/", listar);
router.post("/exportar", exportar);
router.get("/:id/detalhes", detalhes);

module.exports = router;
