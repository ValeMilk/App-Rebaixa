// Fonte unica de classificacao/cores/ordem do estoque por validade.
// Limiares iguais ao backend (services/classificadorService.js).

export const SEGMENTOS = [
  { key: "critico", label: "Crítico", faixa: "1 – 15 dias",  hex: "#dc2626", bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200",     dot: "bg-red-500" },
  { key: "alerta",  label: "Alerta",  faixa: "16 – 30 dias", hex: "#ea580c", bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200",  dot: "bg-orange-500" },
  { key: "atencao", label: "Atenção", faixa: "31 – 60 dias", hex: "#ca8a04", bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   dot: "bg-amber-500" },
  { key: "ok",      label: "Regular", faixa: "> 60 dias",    hex: "#16a34a", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  { key: "vencido", label: "Vencido", faixa: "vencido",      hex: "#64748b", bg: "bg-slate-50",   text: "text-slate-600",   border: "border-slate-200",   dot: "bg-slate-400" },
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
// % consumido = (shelf - dias restantes) / shelf. >= 45% -> giro (oferta interna),
// >= 73% -> rebaixa. Os limiares em dias vem do catalogo (diasGiro/diasRebaixa,
// calculados na query do ERP); se vierem zerados, cai nos mesmos 45%/73% do shelf.

export const STATUS_SHELF = [
  { key: "rebaixa",   label: "Rebaixa",   faixa: "≥ 73% do shelf",     hex: "#dc2626", bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200",     dot: "bg-red-500",     acao: "rebaixa" },
  { key: "giro",      label: "Giro",      faixa: "45 – 73% do shelf",  hex: "#2563eb", bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    dot: "bg-blue-500",    acao: "oferta_interna" },
  { key: "ok",        label: "Ok",        faixa: "< 45% do shelf",     hex: "#16a34a", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500", acao: null },
  { key: "sem_shelf", label: "Sem shelf", faixa: "sem cadastro no ERP", hex: "#64748b", bg: "bg-slate-50",   text: "text-slate-600",   border: "border-slate-200",   dot: "bg-slate-400",   acao: null },
];

export const STATUS_SHELF_MAP = Object.fromEntries(STATUS_SHELF.map((s) => [s.key, s]));

export const PESO_SHELF = { rebaixa: 3, giro: 2, ok: 1, sem_shelf: 0 };

export function classificarShelf({ shelf, diasParaVencer, diasGiro, diasRebaixa }) {
  const s = Number(shelf) || 0;
  if (s <= 0 || diasParaVencer == null) return { status: "sem_shelf", pct: null };
  const consumido = s - diasParaVencer;
  const giro = Number(diasGiro) > 0 ? Number(diasGiro) : Math.round(s * 0.45);
  const rebaixa = Number(diasRebaixa) > 0 ? Number(diasRebaixa) : Math.round(s * 0.73);
  const pct = Math.max(0, Math.min(1, consumido / s));
  const status = consumido >= rebaixa ? "rebaixa" : consumido >= giro ? "giro" : "ok";
  return { status, pct };
}

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
