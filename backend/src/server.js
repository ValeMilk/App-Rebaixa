require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/database");
const errorHandler = require("./middlewares/errorHandler");
const { startSyncJob } = require("./jobs/syncJob");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const estoqueRoutes = require("./routes/estoque");
const solicitacaoRoutes = require("./routes/solicitacoes");
const syncRoutes = require("./routes/sync");

const app = express();
const PORT = process.env.PORT || 4000;

// Middlewares globais
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// Rate limit basico
app.use(
  "/api/",
  rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Healthcheck
app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Rotas
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/estoque", estoqueRoutes);
app.use("/api/solicitacoes", solicitacaoRoutes);
app.use("/api/sync", syncRoutes);

// Erro
app.use(errorHandler);

// Boot
(async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`[server] API rodando em http://localhost:${PORT}`);
    startSyncJob();
  });
})();
