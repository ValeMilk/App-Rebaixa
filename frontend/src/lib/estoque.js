// Classificacao/ordem do estoque por validade. Cores vem dos tons semanticos (lib/tones.js).
// Limiares iguais ao backend (services/classificadorService.js).
import { TONE } from "@/lib/tones";

const seg = (key, label, faixa, tone, extra) => ({ key, label, faixa, tone, ...TONE[tone], ...extra });

export const SEGMENTOS = [
  seg("critico", "Crítico", "1 – 15 dias",  "danger"),
  seg("alerta",  "Alerta",  "16 – 30 dias", "warning"),
  seg("atencao", "Atenção", "31 – 60 dias", "caution"),
  seg("ok",      "Regular", "> 60 dias",    "success"),
  seg("vencido", "Vencido", "vencido",      "neutral"),
];

export const SEGMENTO = Object.fromEntries(SEGMENTOS.map((s) => [s.key, s]));

export const PESO = { vencido: 5, critico: 4, alerta: 3, atencao: 2, ok: 1 };

export function classificar(dias) {
  if (dias == null) return "ok";
  if (dias <= 0) return "vencido";
  if (dias <= 15) return "critico";
  if (dias <= 30) return "alerta";
  if (dias <= 60) return "atencao";
  return "ok";
}

export function scoreCriticidade(itens) {
  let s = 0;
  for (const it of itens) {
    if (it.classificacao === "critico") s += 100;
    else if (it.classificacao === "alerta") s += 10;
    else if (it.classificacao === "atencao") s += 1;
  }
  return s;
}

export function rankStatus(s) {
  // aprovado_final > aprovado_supervisor > pendente_supervisor
  return { aprovado_final: 3, aprovado_supervisor: 2, pendente_supervisor: 1 }[s] || 0;
}

export function indexarAtivas(ativas) {
  const porLojaProd = new Map(); // `${cli}__${prod}` -> ativa
  const porRedeProd = new Map(); // `${rede}__${prod}` -> ativa
  for (const a of ativas || []) {
    const prod = String(a.produtoCodigo);
    if (a.clienteCodigo) {
      const k = `${a.clienteCodigo}__${prod}`;
      const prev = porLojaProd.get(k);
      if (!prev || rankStatus(a.status) > rankStatus(prev.status)) porLojaProd.set(k, a);
    }
    if (a.codigoRede) {
      const k = `${a.codigoRede}__${prod}`;
      const prev = porRedeProd.get(k);
      if (!prev || rankStatus(a.status) > rankStatus(prev.status)) porRedeProd.set(k, a);
    }
  }
  return { porLojaProd, porRedeProd };
}

export function acaoAtivaDe(idx, item) {
  if (!idx || !item) return null;
  const prod = item.produtoCodigo ? String(item.produtoCodigo) : null;
  if (!prod) return null;
  // Prefere correspondencia por loja+produto; fallback para rede+produto
  if (item.clienteCodigo) {
    const v = idx.porLojaProd.get(`${item.clienteCodigo}__${prod}`);
    if (v) return v;
  }
  if (item.codigoRede) {
    const v = idx.porRedeProd.get(`${item.codigoRede}__${prod}`);
    if (v) return v;
  }
  return null;
}

// ── Regua por shelf life (Dashboard) ─────────────────────────────────────────
// O status (rebaixa/giro/ok/sem_shelf) e o % consumido vem calculados da query
// do Postgres (backend/src/services/estoqueSyncService.js): >= 45% -> giro
// (oferta interna), >= 73% -> rebaixa. Aqui so ficam rotulos, cores e pesos.

export const STATUS_SHELF = [
  seg("rebaixa",   "Rebaixa",   "≥ 73% do shelf",      "danger",  { acao: "rebaixa" }),
  seg("giro",      "Giro",      "45 – 73% do shelf",   "info",    { acao: "oferta_interna" }),
  seg("ok",        "Ok",        "< 45% do shelf",      "success", { acao: null }),
  seg("sem_shelf", "Sem shelf", "sem cadastro no ERP", "neutral", { acao: null }),
];

export const STATUS_SHELF_MAP = Object.fromEntries(STATUS_SHELF.map((s) => [s.key, s]));

export const PESO_SHELF = { rebaixa: 3, giro: 2, ok: 1, sem_shelf: 0 };

export function scoreShelf(itens) {
  let s = 0;
  for (const it of itens) {
    if (it.status === "rebaixa") s += 100;
    else if (it.status === "giro") s += 10;
  }
  return s;
}

export function normalizar(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
