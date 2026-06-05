"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmtBRL(v) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPct(v) {
  if (v == null) return "—";
  return `${Number(v).toFixed(1)}%`;
}

function fmtData(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function primeiroDiaMes(offset = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.toISOString().slice(0, 10);
}

function ultimoDiaMes(offset = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset + 1);
  d.setDate(0);
  return d.toISOString().slice(0, 10);
}

// ── Variação (seta + cor) ────────────────────────────────────────────────────
function Variacao({ v1, v2, isMoeda = false, inverter = false }) {
  if (v1 == null || v2 == null) return null;
  const diff = v2 - v1;
  if (Math.abs(diff) < 0.001) return <span className="text-slate-400 text-xs ml-1">=</span>;
  const subiu = diff > 0;
  const bom = inverter ? !subiu : subiu; // ex: preço caiu = bom
  const cor = bom ? "text-emerald-600" : "text-red-500";
  const seta = subiu ? "▲" : "▼";
  const val = isMoeda ? fmtBRL(Math.abs(diff)) : `${Math.abs(diff).toFixed(1)}pp`;
  return (
    <span className={`text-xs font-bold ml-1 ${cor}`}>
      {seta} {val}
    </span>
  );
}

// ── Cor da margem ────────────────────────────────────────────────────────────
function corMargem(v) {
  if (v == null) return "text-slate-400";
  if (v >= 20) return "text-emerald-600";
  if (v >= 10) return "text-amber-600";
  return "text-red-600";
}

function bgMargem(v) {
  if (v == null) return "bg-slate-50 border-slate-200 text-slate-400";
  if (v >= 20) return "bg-emerald-50 border-emerald-200 text-emerald-700";
  if (v >= 10) return "bg-amber-50 border-amber-200 text-amber-700";
  return "bg-red-50 border-red-200 text-red-700";
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, v1, v2, isMoeda, isPct, inverterVariacao, icon }) {
  const fmt = isMoeda ? fmtBRL : isPct ? fmtPct : (v) => (v == null ? "—" : String(v));
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-widest">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="flex items-end gap-1 flex-wrap">
        <span className="text-2xl font-black text-slate-900">{fmt(v1)}</span>
        <Variacao v1={v1} v2={v2} isMoeda={isMoeda} inverter={inverterVariacao} />
      </div>
      {v2 != null && (
        <div className="text-xs text-slate-400">
          P2: <span className="font-semibold text-slate-600">{fmt(v2)}</span>
        </div>
      )}
    </div>
  );
}

// ── Tabela de sellout por subcategoria ───────────────────────────────────────
function TabelaSellout({ p1, p2 }) {
  const subs = useMemo(() => {
    const mapa = {};
    for (const s of p1?.selloutPorSubcategoria || []) mapa[s.subcategoria] = { sub: s.subcategoria, v1: s.selloutMedio, n1: s.totalItens };
    for (const s of p2?.selloutPorSubcategoria || []) {
      if (!mapa[s.subcategoria]) mapa[s.subcategoria] = { sub: s.subcategoria };
      mapa[s.subcategoria].v2 = s.selloutMedio;
      mapa[s.subcategoria].n2 = s.totalItens;
    }
    return Object.values(mapa).sort((a, b) => (b.v1 ?? b.v2 ?? 0) - (a.v1 ?? a.v2 ?? 0));
  }, [p1, p2]);

  if (!subs.length) return <p className="text-slate-400 text-sm p-4">Nenhum dado de sellout encontrado.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
            <th className="text-left py-3 px-4 font-semibold">Subcategoria</th>
            <th className="text-right py-3 px-4 font-semibold">Sellout médio P1</th>
            {p2 && <th className="text-right py-3 px-4 font-semibold">Sellout médio P2</th>}
            {p2 && <th className="text-right py-3 px-4 font-semibold">Variação</th>}
            <th className="text-right py-3 px-4 font-semibold">Nº itens</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {subs.map((s) => {
            const diff = s.v1 != null && s.v2 != null ? s.v2 - s.v1 : null;
            return (
              <tr key={s.sub} className="hover:bg-slate-50 transition">
                <td className="py-3 px-4 font-medium text-slate-800">{s.sub}</td>
                <td className="py-3 px-4 text-right font-mono text-slate-700">{fmtBRL(s.v1)}</td>
                {p2 && <td className="py-3 px-4 text-right font-mono text-slate-700">{fmtBRL(s.v2)}</td>}
                {p2 && (
                  <td className="py-3 px-4 text-right">
                    {diff != null && (
                      <span className={`text-xs font-bold ${diff > 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {diff > 0 ? "▲" : "▼"} {fmtBRL(Math.abs(diff))}
                      </span>
                    )}
                  </td>
                )}
                <td className="py-3 px-4 text-right text-slate-500">{s.n1 ?? s.n2 ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Tabela de encartes ────────────────────────────────────────────────────────
function TabelaEncartes({ encartes, temP2 }) {
  const [ordenacao, setOrdenacao] = useState({ campo: "periodoInicio", dir: -1 });
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const ordenados = useMemo(() => {
    let lista = [...encartes];
    if (filtroStatus !== "todos") lista = lista.filter((e) => e.status === filtroStatus);
    lista.sort((a, b) => {
      let va = a[ordenacao.campo], vb = b[ordenacao.campo];
      if (va == null) va = -Infinity;
      if (vb == null) vb = -Infinity;
      if (va < vb) return -1 * ordenacao.dir;
      if (va > vb) return 1 * ordenacao.dir;
      return 0;
    });
    return lista;
  }, [encartes, ordenacao, filtroStatus]);

  function toggleOrdem(campo) {
    setOrdenacao((o) => ({ campo, dir: o.campo === campo ? -o.dir : -1 }));
  }

  function Th({ label, campo }) {
    const ativa = ordenacao.campo === campo;
    return (
      <th
        onClick={() => toggleOrdem(campo)}
        className="text-right py-3 px-4 font-semibold cursor-pointer hover:text-slate-800 select-none whitespace-nowrap"
      >
        {label} {ativa ? (ordenacao.dir === -1 ? "↓" : "↑") : <span className="opacity-30">↕</span>}
      </th>
    );
  }

  return (
    <div>
      {/* Filtro de status */}
      <div className="flex items-center gap-2 mb-3">
        {["todos", "ativo", "finalizado"].map((s) => (
          <button
            key={s}
            onClick={() => setFiltroStatus(s)}
            className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition ${
              filtroStatus === s
                ? "bg-brand text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {s === "todos" ? `Todos (${encartes.length})` : s === "ativo" ? `Ativos (${encartes.filter((e) => e.status === "ativo").length})` : `Finalizados (${encartes.filter((e) => e.status === "finalizado").length})`}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
              <th className="text-left py-3 px-4 font-semibold">Encarte</th>
              <th className="text-left py-3 px-4 font-semibold">Rede</th>
              {temP2 && <th className="text-center py-3 px-4 font-semibold">Período</th>}
              <th className="text-left py-3 px-4 font-semibold">Supervisor</th>
              <th className="text-left py-3 px-4 font-semibold">Vigência</th>
              <th className="text-center py-3 px-4 font-semibold">Status</th>
              <Th label="Itens" campo="totalItens" />
              <Th label="Margem média" campo="margemMediaOferta" />
              <Th label="Preço médio" campo="precoMedioOferta" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {ordenados.map((enc) => (
              <tr key={enc._id} className="hover:bg-slate-50 transition">
                <td className="py-3 px-4">
                  <Link href={`/encartes/${enc._id}`} className="font-semibold text-brand hover:underline">
                    {enc.nome}
                  </Link>
                </td>
                <td className="py-3 px-4 text-slate-600 text-xs">{enc.redeSubrede || enc.codigoRede}</td>
                {temP2 && (
                  <td className="py-3 px-4 text-center">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${enc.periodo === 1 ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                      P{enc.periodo}
                    </span>
                  </td>
                )}
                <td className="py-3 px-4 text-slate-600 text-xs">{enc.criadoPorNome}</td>
                <td className="py-3 px-4 text-slate-500 text-xs whitespace-nowrap">
                  {fmtData(enc.periodoInicio)} – {fmtData(enc.periodoFim)}
                </td>
                <td className="py-3 px-4 text-center">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${enc.status === "ativo" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {enc.status === "ativo" ? "Ativo" : "Finalizado"}
                  </span>
                </td>
                <td className="py-3 px-4 text-right text-slate-700">{enc.totalItens}</td>
                <td className="py-3 px-4 text-right">
                  <span className={`font-bold text-sm ${corMargem(enc.margemMediaOferta)}`}>
                    {fmtPct(enc.margemMediaOferta)}
                  </span>
                </td>
                <td className="py-3 px-4 text-right font-mono text-slate-700">{fmtBRL(enc.precoMedioOferta)}</td>
              </tr>
            ))}
            {ordenados.length === 0 && (
              <tr><td colSpan={9} className="py-8 text-center text-slate-400">Nenhum encarte encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function PerformancePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // Proteger rota
  useEffect(() => {
    if (!authLoading && user && user.role !== "admin" && user.role !== "diretoria") {
      router.replace("/encartes");
    }
  }, [user, authLoading, router]);

  // Filtros - default: mês atual vs mês anterior
  const [p1inicio, setP1inicio] = useState(primeiroDiaMes(0));
  const [p1fim, setP1fim] = useState(ultimoDiaMes(0));
  const [usarP2, setUsarP2] = useState(false);
  const [p2inicio, setP2inicio] = useState(primeiroDiaMes(-1));
  const [p2fim, setP2fim] = useState(ultimoDiaMes(-1));
  const [codigoRede, setCodigoRede] = useState("");
  const [criadoPorId, setCriadoPorId] = useState("");
  const [redes, setRedes] = useState([]);
  const [supervisores, setSupervisores] = useState([]);

  // Dados
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(false);

  // Carregar redes e supervisores para os filtros
  useEffect(() => {
    if (!user) return;
    api.get("/responsaveis-rede/redes-disponiveis").then(({ data }) => setRedes(data.redes || [])).catch(() => {});
    api.get("/responsaveis-rede/supervisores-disponiveis").then(({ data }) => setSupervisores(data.supervisores || [])).catch(() => {});
  }, [user]);

  const buscar = useCallback(async () => {
    setLoading(true);
    try {
      const params = { p1inicio, p1fim };
      if (usarP2) { params.p2inicio = p2inicio; params.p2fim = p2fim; }
      if (codigoRede) params.codigoRede = codigoRede;
      if (criadoPorId) params.criadoPorId = criadoPorId;
      const { data } = await api.get("/encartes/performance", { params });
      setDados(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [p1inicio, p1fim, usarP2, p2inicio, p2fim, codigoRede, criadoPorId]);

  useEffect(() => {
    if (user) buscar();
  }, [user, buscar]);

  const p1 = dados?.periodo1;
  const p2 = dados?.periodo2;
  const encartes = dados?.encartes || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-brand mb-1">Diretoria · Análise</p>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900">Performance de Encartes</h1>
        <p className="text-xs text-slate-400 mt-0.5">Compare períodos, acompanhe margens, preços e sellout por subcategoria</p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Período 1 */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              {usarP2 ? "Período 1" : "Período"}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={p1inicio}
                onChange={(e) => setP1inicio(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
              <span className="text-slate-400 text-sm">até</span>
              <input
                type="date"
                value={p1fim}
                onChange={(e) => setP1fim(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
          </div>

          {/* Toggle P2 */}
          <button
            onClick={() => setUsarP2((v) => !v)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${
              usarP2 ? "bg-purple-100 text-purple-700 border border-purple-200" : "bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200"
            }`}
          >
            {usarP2 ? "✕ Remover comparação" : "+ Comparar período"}
          </button>

          {/* Período 2 */}
          {usarP2 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Período 2</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={p2inicio}
                  onChange={(e) => setP2inicio(e.target.value)}
                  className="border border-purple-200 bg-purple-50 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300"
                />
                <span className="text-slate-400 text-sm">até</span>
                <input
                  type="date"
                  value={p2fim}
                  onChange={(e) => setP2fim(e.target.value)}
                  className="border border-purple-200 bg-purple-50 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          {/* Filtro Rede */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Rede</label>
            <select
              value={codigoRede}
              onChange={(e) => setCodigoRede(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand/30 min-w-[160px]"
            >
              <option value="">Todas as redes</option>
              {redes.map((r) => (
                <option key={r.codigoRede} value={r.codigoRede}>{r.redeSubrede || r.codigoRede}</option>
              ))}
            </select>
          </div>

          {/* Filtro Supervisor */}
          {supervisores.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Supervisor</label>
              <select
                value={criadoPorId}
                onChange={(e) => setCriadoPorId(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand/30 min-w-[180px]"
              >
                <option value="">Todos os supervisores</option>
                {supervisores.map((s) => (
                  <option key={s._id} value={s._id}>{s.nome}</option>
                ))}
              </select>
            </div>
          )}

          {/* Botão buscar */}
          <button
            onClick={buscar}
            disabled={loading}
            className="px-5 py-2 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-600 transition disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0 1 15-4.2M20 15a9 9 0 0 1-15 4.2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
              </svg>
            )}
            Buscar
          </button>
        </div>
      </div>

      {/* KPIs */}
      {dados && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Encartes"
              v1={p1?.totalEncartes}
              v2={p2?.totalEncartes}
              icon="📋"
            />
            <KpiCard
              label="Margem média oferta"
              v1={p1?.margemMediaOferta}
              v2={p2?.margemMediaOferta}
              isPct
              icon="📊"
            />
            <KpiCard
              label="Preço médio oferta"
              v1={p1?.precoMedioOferta}
              v2={p2?.precoMedioOferta}
              isMoeda
              inverterVariacao // preço caindo é bom
              icon="🏷️"
            />
            <KpiCard
              label="Total de itens"
              v1={p1?.totalItens}
              v2={p2?.totalItens}
              icon="📦"
            />
          </div>

          {/* Legenda de períodos */}
          {usarP2 && p2 && (
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
                <span className="text-slate-600 font-medium">P1: {fmtData(p1inicio)} – {fmtData(p1fim)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-purple-500 inline-block" />
                <span className="text-slate-600 font-medium">P2: {fmtData(p2inicio)} – {fmtData(p2fim)}</span>
              </div>
            </div>
          )}

          {/* Sellout por subcategoria */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">Sellout por Subcategoria</h2>
              <p className="text-xs text-slate-400 mt-0.5">Desconto médio concedido por subcategoria de produto</p>
            </div>
            <TabelaSellout p1={p1} p2={p2} />
          </div>

          {/* Encartes */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">Encartes</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {encartes.length} encarte{encartes.length !== 1 ? "s" : ""} encontrado{encartes.length !== 1 ? "s" : ""} · ativos e finalizados
              </p>
            </div>
            <div className="p-4">
              <TabelaEncartes encartes={encartes} temP2={usarP2 && !!p2} />
            </div>
          </div>
        </>
      )}

      {/* Loading state */}
      {loading && !dados && (
        <div className="flex items-center justify-center h-48">
          <div className="flex flex-col items-center gap-3">
            <div className="h-7 w-7 rounded-full border-2 border-brand border-t-transparent animate-spin" />
            <p className="text-sm text-slate-400">Carregando dados...</p>
          </div>
        </div>
      )}
    </div>
  );
}
