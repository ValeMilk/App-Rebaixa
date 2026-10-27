/**
 * Web Push (VAPID) para as pendencias de contagem (v2.0, fase 1c).
 *
 * Chaves no .env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT (ex.: mailto:ti@valemilk.com.br).
 * Gere o par com `node src/scripts/gerarVapid.js`. Sem as chaves o push fica desligado: avisa UMA vez
 * no log e todo envio devolve { enviados: 0, desligado: true } (o resto do sistema segue normal).
 */
const webpush = require("web-push");
const PushSubscription = require("../models/PushSubscription");

const TTL_SEGUNDOS = 24 * 60 * 60;

let configurado = null; // null = ainda nao conferiu; true/false depois
let avisouDesligado = false;

function configurar() {
  if (configurado !== null) return configurado;
  const publica = (process.env.VAPID_PUBLIC_KEY || "").trim();
  const privada = (process.env.VAPID_PRIVATE_KEY || "").trim();
  const subject = (process.env.VAPID_SUBJECT || "").trim();
  if (!publica || !privada || !subject) {
    configurado = false;
    if (!avisouDesligado) {
      avisouDesligado = true;
      console.warn("[push] desligado: defina VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT no .env (gere com node src/scripts/gerarVapid.js)");
    }
    return false;
  }
  try {
    webpush.setVapidDetails(subject, publica, privada);
    configurado = true;
  } catch (err) {
    configurado = false;
    if (!avisouDesligado) {
      avisouDesligado = true;
      console.warn("[push] desligado: chaves VAPID invalidas:", err.message);
    }
  }
  return configurado;
}

/** Push esta ligado (chaves presentes e validas)? */
function pushAtivo() {
  return configurar();
}

/** Chave publica para o navegador assinar (applicationServerKey). */
function chavePublica() {
  return configurar() ? process.env.VAPID_PUBLIC_KEY.trim() : null;
}

/** Erro do endpoint que indica inscricao morta (navegador removeu/expirou). */
function inscricaoMorta(err) {
  return err && (err.statusCode === 404 || err.statusCode === 410);
}

/**
 * Envia uma notificacao a TODAS as inscricoes de um usuario.
 * payload: { title, body, url, tag } (url relativa ao app, ex. "/pendencias").
 * Devolve { enviados, falhas, removidas, desligado? }.
 */
async function enviarParaUsuario(userId, { title, body, url = "/pendencias", tag = null } = {}) {
  if (!configurar()) return { enviados: 0, falhas: 0, removidas: 0, desligado: true };
  const inscricoes = await PushSubscription.find({ userId }).lean();
  if (!inscricoes.length) return { enviados: 0, falhas: 0, removidas: 0, semInscricao: true };

  const corpo = JSON.stringify({ title, body, url, tag });
  let enviados = 0;
  let falhas = 0;
  let removidas = 0;
  for (const ins of inscricoes) {
    try {
      await webpush.sendNotification({ endpoint: ins.endpoint, keys: ins.keys }, corpo, { TTL: TTL_SEGUNDOS });
      enviados++;
      await PushSubscription.updateOne({ _id: ins._id }, { $set: { ultimoEnvioEm: new Date(), ultimoErro: null } });
    } catch (err) {
      if (inscricaoMorta(err)) {
        removidas++;
        await PushSubscription.deleteOne({ _id: ins._id });
      } else {
        falhas++;
        await PushSubscription.updateOne({ _id: ins._id }, { $inc: { falhas: 1 }, $set: { ultimoErro: String(err.message || err.statusCode || err).slice(0, 200) } });
      }
    }
  }
  return { enviados, falhas, removidas };
}

/** Upsert da inscricao de um navegador (chave = endpoint), vinculada ao usuario. */
async function inscrever(userId, subscription, userAgent) {
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    const e = new Error("Inscricao de push invalida (endpoint e keys sao obrigatorios).");
    e.status = 400;
    e.publicMessage = "Inscrição de push inválida.";
    throw e;
  }
  await PushSubscription.updateOne(
    { endpoint },
    { $set: { userId, keys: { p256dh, auth }, userAgent: userAgent ? String(userAgent).slice(0, 300) : null, falhas: 0, ultimoErro: null } },
    { upsert: true }
  );
  return { ok: true };
}

/** Remove a inscricao de um endpoint (so a do proprio usuario). */
async function remover(userId, endpoint) {
  if (!endpoint) return { removidas: 0 };
  const r = await PushSubscription.deleteOne({ userId, endpoint });
  return { removidas: r.deletedCount || 0 };
}

/** So para testes: esquece a configuracao lida do .env. */
function resetarConfiguracao() {
  configurado = null;
  avisouDesligado = false;
}

module.exports = { pushAtivo, chavePublica, enviarParaUsuario, inscrever, remover, resetarConfiguracao };
