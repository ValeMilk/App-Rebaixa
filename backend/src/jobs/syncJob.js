const cron = require("node-cron");
const { sincronizarEstoque } = require("../services/estoqueSyncService");
const { sincronizarCarteira } = require("../services/erpService");
const { sincronizarCarteiraEsigma } = require("../services/esigmaService");
const { sincronizarVisaoLojas } = require("../services/visaoLojasService");
const { sincronizarComprasRecentes } = require("../services/comprasRecentesService");
const { sincronizarPrecosRede } = require("../services/produtoSyncService");
const { gerarPendencias, enviarPushAdiados } = require("../services/pendenciasService");

let rodando = false;
let rodandoDiario = false;

async function etapa(nome, fn) {
  try {
    console.log(`[cron] iniciando ${nome}...`);
    const r = await fn();
    console.log(`[cron] ${nome} ok:`, r);
    return r;
  } catch (err) {
    console.error(`[cron] ${nome} falhou:`, err.message);
    return null;
  }
}

/**
 * Sync frequente (padrao a cada 30 min): estoque (Ativmob), carteira, Esigma e, em seguida, a visao do
 * vendedor (ItemLoja/Ruptura) e as pendencias geradas por ela. Cada etapa e independente: uma falha
 * nao impede as seguintes.
 */
async function rodarSyncFrequente() {
  if (rodando) return;
  rodando = true;
  try {
    await etapa("sync estoque (ultimos 30 dias)", sincronizarEstoque);
    await etapa("sync carteira", sincronizarCarteira);
    await etapa("sync carteira Esigma", sincronizarCarteiraEsigma);
    await etapa("visao das lojas (itens, rupturas)", sincronizarVisaoLojas);
    await etapa("pendencias de contagem", gerarPendencias);
  } finally {
    rodando = false;
  }
}

/** Sync diario (padrao 05:30): compras de 90 dias por loja e tabela de preco por rede, ambos do Lacteus. */
async function rodarSyncDiario() {
  if (rodandoDiario) return;
  rodandoDiario = true;
  try {
    await etapa("compras dos ultimos 90 dias (Lacteus)", sincronizarComprasRecentes);
    await etapa("precos por rede (E08)", sincronizarPrecosRede);
  } finally {
    rodandoDiario = false;
  }
}

function agendar(expr, padrao, nome, fn) {
  const ok = cron.validate(expr);
  if (!ok) console.warn(`[cron] expressao invalida em ${nome} (${expr}), usando ${padrao}`);
  const finalExpr = ok ? expr : padrao;
  cron.schedule(finalExpr, fn, { timezone: process.env.TZ_LOCAL || "America/Fortaleza" });
  console.log(`[cron] ${nome} agendado (${finalExpr})`);
}

function startSyncJob() {
  agendar(process.env.SYNC_CRON || "*/30 * * * *", "*/30 * * * *", "sincronizacao frequente", rodarSyncFrequente);
  agendar(process.env.SYNC_DIARIO_CRON || "30 5 * * *", "30 5 * * *", "sincronizacao diaria", rodarSyncDiario);
  // Push adiado pelo horario de silencio (21h-7h) sai as 7h
  agendar(process.env.PUSH_MANHA_CRON || "0 7 * * *", "0 7 * * *", "push da manha", () => etapa("push adiados", enviarPushAdiados));
}

module.exports = { startSyncJob, rodarSyncFrequente, rodarSyncDiario };
