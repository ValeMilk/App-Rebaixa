const cron = require("node-cron");
const { sincronizarEstoque } = require("../services/estoqueSyncService");
const { sincronizarCarteira } = require("../services/erpService");

let rodando = false;

function startSyncJob() {
  const expr = process.env.SYNC_CRON || "*/30 * * * *";
  if (!cron.validate(expr)) {
    console.warn("[cron] expressao invalida em SYNC_CRON, usando default */30 * * * *");
  }
  const finalExpr = cron.validate(expr) ? expr : "*/30 * * * *";

  cron.schedule(finalExpr, async () => {
    if (rodando) return;
    rodando = true;
    try {
      console.log("[cron] iniciando sync estoque (hoje + 30 dias)...");
      const r = await sincronizarEstoque();
      console.log("[cron] sync estoque ok:", r);

      console.log("[cron] iniciando sync carteira...");
      const c = await sincronizarCarteira();
      console.log("[cron] sync carteira ok:", c);
    } catch (err) {
      console.error("[cron] erro:", err.message);
    } finally {
      rodando = false;
    }
  });

  console.log(`[cron] job de sincronizacao agendado (${finalExpr})`);
}

module.exports = { startSyncJob };
