// Web Push no navegador: estado, ativar e desativar. O sw.js (next-pwa + worker/index.js) mostra a notificacao.
import api from "./api";

const CHAVE_DISPENSA = "iv.push.dispensado";

function temSuporte() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function ehIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function instalado() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;
}

/** iOS so entrega push quando o app esta na tela inicial (iOS 16.4+). */
export function precisaInstalarIos() {
  return ehIos() && !instalado();
}

function base64UrlParaUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Em desenvolvimento o next-pwa fica desligado e nao existe sw.js: nao pode esperar o `ready` para sempre
async function obterRegistration({ registrar = false } = {}) {
  if (!temSuporte()) return null;
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg && registrar) {
    try { reg = await navigator.serviceWorker.register("/sw.js"); } catch { reg = null; }
  }
  if (!reg) return null;
  if (reg.active) return reg;
  // espera ativar, com teto
  return Promise.race([
    navigator.serviceWorker.ready.then(() => reg),
    new Promise((r) => setTimeout(() => r(reg), 4000)),
  ]);
}

/** "ativo" | "negado" | "sem_suporte" | "inativo" */
export async function estadoPush() {
  if (!temSuporte()) return "sem_suporte";
  if (Notification.permission === "denied") return "negado";
  try {
    const reg = await obterRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub ? "ativo" : "inativo";
  } catch {
    return "inativo";
  }
}

/** Pede permissao, assina com a chave publica do servidor e registra a inscricao. Devolve o estado final. */
export async function ativarPush() {
  if (!temSuporte()) {
    const e = new Error(precisaInstalarIos() ? "Instale o InfoVale na tela inicial para receber notificações." : "Este navegador não suporta notificações.");
    e.estado = "sem_suporte";
    throw e;
  }
  const { data } = await api.get("/push/chave-publica");
  if (!data?.ativo || !data.chave) {
    const e = new Error("As notificações ainda não foram configuradas no servidor.");
    e.estado = "desligado";
    throw e;
  }
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") {
    const e = new Error("Permissão de notificação negada. Libere nas configurações do navegador.");
    e.estado = "negado";
    throw e;
  }
  const reg = await obterRegistration({ registrar: true });
  if (!reg) {
    const e = new Error("Não foi possível registrar o service worker.");
    e.estado = "inativo";
    throw e;
  }
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlParaUint8Array(data.chave) });
  }
  await api.post("/push/inscrever", { subscription: sub.toJSON(), userAgent: navigator.userAgent });
  return "ativo";
}

/** Cancela a inscricao deste navegador. */
export async function desativarPush() {
  const reg = await obterRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return "inativo";
  const endpoint = sub.endpoint;
  try { await sub.unsubscribe(); } catch {}
  try { await api.delete("/push/inscrever", { data: { endpoint } }); } catch {}
  return "inativo";
}

// Dispensa do banner (por navegador)
export function bannerDispensado() {
  try { return localStorage.getItem(CHAVE_DISPENSA) === "1"; } catch { return false; }
}
export function dispensarBanner() {
  try { localStorage.setItem(CHAVE_DISPENSA, "1"); } catch {}
}
