const express = require("express");
const { login, me, listarParaLogin } = require("../controllers/authController");
const { auth } = require("../middlewares/auth");

const router = express.Router();

router.get("/usuarios", listarParaLogin); // publico - apenas nome e email
router.post("/login", login);
router.get("/me", auth, me);

module.exports = router;
