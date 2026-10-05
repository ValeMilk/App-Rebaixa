const express = require("express");
const { dashboardSupervisor } = require("../controllers/dashboardController");
const { auth, requirePermission } = require("../middlewares/auth");

const router = express.Router();

router.use(auth);

router.get("/supervisor", requirePermission("metricas_redes.ver"), dashboardSupervisor);

module.exports = router;
