const express = require("express");
const { listar } = require("../controllers/estoqueController");
const { auth } = require("../middlewares/auth");

const router = express.Router();

router.use(auth);

router.get("/", listar);

module.exports = router;
