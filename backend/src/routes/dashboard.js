const express = require("express");
const { dashboardSupervisor } = require("../controllers/dashboardController");
const { auth, requireRole } = require("../middlewares/auth");

const router = express.Router();

router.use(auth);

router.get("/supervisor", requireRole("supervisor", "admin", "diretoria"), dashboardSupervisor);

module.exports = router;
