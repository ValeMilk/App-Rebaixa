"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { fmtData, fmtDataHora } from "@/lib/utils";

const SEGMENTS = [
  { key: "critico", label: "Crítico",  sub: "1 – 15 dias",  hex: "#dc2626", light: "#fef2f2", border: "#fca5a5" },
  { key: "alerta",  label: "Alerta",   sub: "16 – 30 dias", hex: "#ea580c", light: "#fff7ed", border: "#fdba74" },
  { key: "atencao", label: "Atenção",  sub: "31 – 60 dias", hex: "#ca8a04", light: "#fefce8", border: "#fde047" },
  { key: "ok",      label: "Regular",  sub: "> 60 dias",    hex: "#16a34a", light: "#f0fdf4", border: "#86efac" },
  { key: "vencido", label: "Vencido",  sub: "0 dias",       hex: "#64748b", light: "#f8fafc", border: "#cbd5e1" },
];

// ── Gráfico rosca SVG ───────────────────────────────────────────────────────
function Donut({ data, total }) {
  const R = 54, CX = 64, CY = 64, SW = 18;
  const circ = 2 * Math.PI * R;
  let acc = 0;
  const slices = SEGMENTS.map((s) => {
    const v = data?.[s.key] ?? 0;
    const dash = total > 0 ? (v / total) * circ : 0;
    const slice = { ...s, v, dash, offset: -acc };
    acc += dash;
    return slice;
  }).filter((s) => s.v > 0);

  return (
    <svg viewBox="0 0 128 128" className="w-32 h-32 -rotate-90">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#e2e8f0" strokeWidth={SW} />
      {slices.map((s) => (
        <circle key={s.key} cx={CX} cy={CY} r={R} fill="none"
          stroke={s.hex} strokeWidth={SW}
          strokeDasharray={`${s.dash} ${circ - s.dash}`}
          strokeDashoffset={s.offset}
          strokeLinecap="butt"
        />
      ))}
    </svg>
  );
}

// ── Barra de progresso fina ─────────────────────────────────────────────────
function ProgressBar({ pct, hex }) {
  return (
    <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: hex }} />
    </div>
  );
}

// ── Sparkline SVG (barras verticais mini) ───────────────────────────────────
function Sparkbars({ data, total }) {
  const vals = SEGMENTS.map((s) => ({ hex: s.hex, v: data?.[s.key] ?? 0 }));
  const max = Math.max(...vals.map((x) => x.v), 1);
  const W = 48, H = 24, barW = 6, gap = 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-12 h-6">
      {vals.map((x, i) => {
        const h = Math.max((x.v / max) * H, 1);
        const xPos = i * (barW + gap);
        return <rect key={i} x={xPos} y={H - h} width={barW} height={h} fill={x.hex} rx="1" />;
      })}
    </svg>
  );
}

// ── Card KPI ────────────────────────────────────────────────────────────────
function KpiCard({ s, valor, total }) {
  const pct = total > 0 ? (valor / total) * 100 : 0;
  const isAlert = (s.key === "critico" || s.key === "vencido") && valor > 0;
  return (
    <div
      className="relative bg-white rounded-2xl border p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
      style={{ borderColor: isAlert ? s.border : "#e2e8f0" }}
    >
      {/* topo colorido */}
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-semibold uppercase tracking-widest px-2 py-0.5 rounded-md"
          style={{ color: s.hex, backgroundColor: s.light }}
        >
          {s.label}
        </span>
        {isAlert && (
          <span className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: s.hex }} />
        )}
      </div>

      {/* número */}
      <div className="text-5xl font-black tabular-nums leading-none" style={{ color: s.hex }}>
        {valor.toLocaleString("pt-BR")}
      </div>

      {/* legenda + barra */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-slate-400">
          <span>{s.sub}</span>
          <span className="font-mono">{pct.toFixed(1)}%</span>
        </div>
        <ProgressBar pct={pct} hex={s.hex} />
      </div>
    </div>
  );
}

// ── Tabela itens críticos ────────────────────────────────────────────────────
function TabelaCriticos({ itens }) {
  const top = [...itens]
    .filter((i) => i.diasParaVencer >= 1 && i.diasParaVencer <= 15)
    .sort((a, b) => a.diasParaVencer - b.diasParaVencer)
    .slice(0, 8);

  if (!top.length)
    return <p className="text-sm text-slate-400 py-6 text-center">Nenhum item crítico no momento.</p>;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 text-xs text-slate-400 uppercase tracking-wider">
          <th className="text-left pb-2 pr-4 font-medium">Produto</th>
          <th className="text-left pb-2 pr-4 font-medium">Cliente</th>
          <th className="text-right pb-2 pr-4 font-medium">Qtd</th>
          <th className="text-right pb-2 pr-4 font-medium">Validade</th>
          <th className="text-right pb-2 font-medium">Dias</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {top.map((item, i) => {
          const hex = item.diasParaVencer <= 7 ? "#dc2626" : "#ea580c";
          return (
            <tr key={i} className="hover:bg-slate-50 transition-colors">
              <td className="py-2 pr-4 text-slate-800 font-medium max-w-[200px] truncate">{item.produto}</td>
              <td className="py-2 pr-4 text-slate-500 max-w-[160px] truncate">{item.cliente}</td>
              <td className="py-2 pr-4 text-right font-mono text-slate-700">{item.quantidade}</td>
              <td className="py-2 pr-4 text-right font-mono text-slate-500">{fmtData(item.dataValidade)}</td>
              <td className="py-2 text-right">
                <span
                  className="inline-block rounded-full px-2 py-0.5 text-xs font-bold"
                  style={{ color: hex, backgroundColor: hex + "18" }}
                >
                  {item.diasParaVencer}d
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [resumo, setResumo] = useState(null);
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [atualizado, setAtualizado] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        api.get("/estoque/resumo"),
        api.get("/estoque?limit=200"),
      ]);
      setResumo(r1.data);
      setItens(r2.data?.itens ?? []);
      setAtualizado(new Date());
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const total = resumo ? Object.values(resumo).reduce((a, b) => a + b, 0) : 0;
  const urgente = (resumo?.critico ?? 0) + (resumo?.vencido ?? 0);

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand mb-1">Valemilk · Controle Comercial</p>
          <h1 className="text-2xl font-black text-slate-900">Painel de Vencimentos</h1>
          <p className="text-sm text-slate-400 mt-0.5">Estoque ativo · qtd &gt; 5 · janela 1 – 31 dias</p>
        </div>
        <div className="flex items-center gap-3">
          {atualizado && (
            <span className="text-xs text-slate-400">
              {fmtDataHora(atualizado)}
            </span>
          )}
          <button
            onClick={carregar}
            disabled={loading}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition disabled:opacity-40 flex items-center gap-1.5"
          >
            <svg className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0 1 15-4.2M20 15a9 9 0 0 1-15 4.2" strokeLinecap="round" />
            </svg>
            Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="h-7 w-7 rounded-full border-2 border-brand border-t-transparent animate-spin" />
            <p className="text-sm text-slate-400">Carregando dados...</p>
          </div>
        </div>
      ) : (
        <>
          {/* ── Alerta ── */}
          {urgente > 0 && (
            <div className="mb-5 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              <p className="text-sm text-red-700">
                <span className="font-bold">{urgente} produto{urgente > 1 ? "s" : ""}</span> requerem ação imediata — vencimento em até 15 dias com estoque disponível.
              </p>
            </div>
          )}

          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
            {SEGMENTS.map((s) => (
              <KpiCard key={s.key} s={s} valor={resumo?.[s.key] ?? 0} total={total} />
            ))}
          </div>

          {/* ── Linha 2: composição + distribuição + métricas ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

            {/* Rosca */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 flex flex-col items-center gap-4">
              <p className="self-start text-xs font-semibold uppercase tracking-widest text-slate-400">Composição</p>
              <div className="relative">
                <Donut data={resumo} total={total} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-slate-900">{total}</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">itens</span>
                </div>
              </div>
              <div className="w-full space-y-2">
                {SEGMENTS.map((s) => (
                  <div key={s.key} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.hex }} />
                      <span className="text-slate-500">{s.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700">{resumo?.[s.key] ?? 0}</span>
                      <span className="text-slate-300 font-mono w-9 text-right">
                        {total > 0 ? ((resumo?.[s.key] ?? 0) / total * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Distribuição + métricas */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-6 flex flex-col gap-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Distribuição de Risco</p>
                {/* barra segmentada */}
                <div className="flex h-4 w-full overflow-hidden rounded-lg gap-0.5">
                  {SEGMENTS.map((s) => {
                    const pct = total > 0 ? (resumo?.[s.key] ?? 0) / total * 100 : 0;
                    if (pct < 0.5) return null;
                    return (
                      <div key={s.key} title={`${s.label}: ${pct.toFixed(1)}%`}
                        className="h-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: s.hex }}
                      />
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-between">
                  {SEGMENTS.map((s) => {
                    const pct = total > 0 ? (resumo?.[s.key] ?? 0) / total * 100 : 0;
                    return (
                      <div key={s.key} className="text-center" style={{ width: "19%" }}>
                        <div className="text-xs font-bold" style={{ color: s.hex }}>{pct.toFixed(0)}%</div>
                        <div className="text-[10px] text-slate-400 truncate">{s.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3 métricas */}
              <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-100">
                {[
                  { label: "Ação Imediata",   val: urgente,              sub: "Crítico + Vencido", hex: urgente > 0 ? "#dc2626" : "#94a3b8" },
                  { label: "Em Alerta",        val: resumo?.alerta ?? 0,  sub: "16 – 30 dias",      hex: (resumo?.alerta ?? 0) > 0 ? "#ea580c" : "#94a3b8" },
                  { label: "Total Monitorado", val: total,                sub: "todos os itens",    hex: "#0056a6" },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl bg-slate-50 p-4">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{m.label}</p>
                    <p className="text-3xl font-black tabular-nums mt-1" style={{ color: m.hex }}>{m.val.toLocaleString("pt-BR")}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{m.sub}</p>
                  </div>
                ))}
              </div>

              {/* Indicador de urgência */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                  <span className="font-medium text-slate-600">Índice de urgência</span>
                  <span className="font-mono">{total > 0 ? (urgente / total * 100).toFixed(1) : "0.0"}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${total > 0 ? Math.min(urgente / total * 100, 100) : 0}%`,
                      background: "linear-gradient(to right, #f97316, #dc2626)",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Tabela críticos ── */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Produtos Críticos</p>
                <p className="text-sm text-slate-600 mt-0.5">Vencem em até 15 dias · com estoque disponível</p>
              </div>
              <span className="rounded-full bg-red-50 border border-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">
                {itens.filter((i) => i.diasParaVencer >= 1 && i.diasParaVencer <= 15).length} itens
              </span>
            </div>
            <TabelaCriticos itens={itens} />
          </div>
        </>
      )}
    </div>
  );
}
