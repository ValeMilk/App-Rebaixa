"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { IcoChevronRight, IcoCalendar } from "@/components/Icons";

// ---------------------------------------------------------------------------
// Paleta: uma cor por rede
// ---------------------------------------------------------------------------
const PALETTE = [
  { bg: "bg-brand",       text: "text-white" },
  { bg: "bg-emerald-500", text: "text-white" },
  { bg: "bg-violet-500",  text: "text-white" },
  { bg: "bg-amber-500",   text: "text-white" },
  { bg: "bg-rose-500",    text: "text-white" },
  { bg: "bg-cyan-500",    text: "text-white" },
  { bg: "bg-orange-500",  text: "text-white" },
  { bg: "bg-pink-500",    text: "text-white" },
];

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

function isoToYMD(iso) { return iso ? iso.slice(0, 10) : null; }
function ymd(ano, mes, dia) {
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function CalendarioGeralPage() {
  const router = useRouter();
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState(null);
  const tooltipCache = useMemo(() => ({}), []);

  const hoje = new Date();
  const [mesAno, setMesAno] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/encartes");
      setGrupos(data.grupos || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Achata todos os encartes — uma cor por rede
  const encartesFlat = useMemo(() => {
    const result = [];
    grupos.forEach((g, gi) => {
      const cor = PALETTE[gi % PALETTE.length];
      g.encartes.forEach((e) => {
        result.push({ ...e, cor, redeNome: g.redeSubrede || g.codigoRede });
      });
    });
    return result;
  }, [grupos]);

  // Redes que têm pelo menos 1 encarte (para legenda)
  const redesComEncartes = useMemo(() =>
    grupos
      .filter((g) => g.encartes.length > 0)
      .map((g, gi) => ({ nome: g.redeSubrede || g.codigoRede, cor: PALETTE[gi % PALETTE.length] })),
    [grupos]
  );

  const diasDoMes = useMemo(() => {
    const { ano, mes } = mesAno;
    const totalDias = new Date(ano, mes + 1, 0).getDate();
    const offset = new Date(ano, mes, 1).getDay();
    const dias = [];
    for (let i = 0; i < offset; i++) dias.push(null);
    for (let d = 1; d <= totalDias; d++) {
      const dataStr = ymd(ano, mes, d);
      const encartesNoDia = encartesFlat.filter((e) => {
        const ini = isoToYMD(e.periodoInicio);
        const fim = isoToYMD(e.periodoFim);
        return ini && fim && dataStr >= ini && dataStr <= fim;
      });
      dias.push({ d, dataStr, encartes: encartesNoDia });
    }
    return dias;
  }, [mesAno, encartesFlat]);

  const fmtBRL = (v) => v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';

  async function onHover(ev, enc) {
    const rect = ev.currentTarget.getBoundingClientRect();
    setTooltip({ id: enc._id, x: rect.left + rect.width / 2, y: rect.top, data: tooltipCache[enc._id] || null });
    if (!tooltipCache[enc._id]) {
      try {
        const { data } = await api.get(`/encartes/${enc._id}`);
        const itens = data.itens || [];
        const subs = [...new Set(itens.map(it => it.subcategoria).filter(Boolean))];
        const ofertas = itens.map(it => it.precoOferta).filter(v => v != null);
        const sellouts = itens.map(it => it.sellout).filter(v => v != null);
        const info = {
          rede: enc.redeNome,
          subs,
          ofertaMin: ofertas.length ? fmtBRL(Math.min(...ofertas)) : '—',
          ofertaMax: ofertas.length ? fmtBRL(Math.max(...ofertas)) : '—',
          selloutMedio: sellouts.length ? fmtBRL(sellouts.reduce((a, b) => a + b, 0) / sellouts.length) : '—',
          totalItens: itens.length,
        };
        tooltipCache[enc._id] = info;
        setTooltip(prev => prev?.id === enc._id ? { ...prev, data: info } : prev);
      } catch { /* silencioso */ }
    }
  }

  function onLeave() { setTooltip(null); }

  const nomeMes = new Date(mesAno.ano, mesAno.mes, 1)
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const hojeStr = ymd(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  function prevMes() {
    setMesAno((p) => { const d = new Date(p.ano, p.mes - 1, 1); return { ano: d.getFullYear(), mes: d.getMonth() }; });
  }
  function nextMes() {
    setMesAno((p) => { const d = new Date(p.ano, p.mes + 1, 1); return { ano: d.getFullYear(), mes: d.getMonth() }; });
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 safe-area-pt">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition shrink-0">
            <IcoChevronRight className="w-5 h-5 rotate-180" />
          </button>
          <div>
            <h1 className="font-bold text-slate-900 text-lg leading-tight">Calendário Geral</h1>
            <p className="text-slate-500 text-xs mt-0.5">Todos os encartes de todas as redes</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 pb-24">
        {loading ? (
          <div className="space-y-3">
            <div className="h-8 bg-slate-100 rounded-xl animate-pulse w-2/3" />
            <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
          </div>
        ) : (
          <>
            {/* Legenda de redes */}
            {redesComEncartes.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-2 mb-4 p-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
                {redesComEncartes.map((r) => (
                  <div key={r.nome} className="flex items-center gap-1.5">
                    <span className={`inline-block w-2.5 h-2.5 rounded-sm shrink-0 ${r.cor.bg}`} />
                    <span className="text-xs text-slate-700 font-medium">{r.nome}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              {/* Navegação de mês */}
              <div className="flex items-center justify-between mb-4">
                <button onClick={prevMes}
                  className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition">
                  <IcoChevronRight className="w-5 h-5 rotate-180" />
                </button>
                <span className="font-bold text-slate-800 capitalize text-base">{nomeMes}</span>
                <button onClick={nextMes}
                  className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition">
                  <IcoChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* Cabeçalho dias da semana */}
              <div className="grid grid-cols-7 mb-1">
                {DIAS_SEMANA.map((d) => (
                  <div key={d} className="text-center text-xs font-semibold text-slate-400 py-1">{d}</div>
                ))}
              </div>

              {/* Grid de dias */}
              <div className="grid grid-cols-7 gap-1">
                {diasDoMes.map((dia, i) => {
                  if (!dia) return <div key={`v${i}`} />;
                  const isHoje = dia.dataStr === hojeStr;
                  return (
                    <div key={dia.d}
                      className={`rounded-xl overflow-hidden min-h-[52px] ${dia.encartes.length > 0 ? "ring-1 ring-slate-200" : ""}`}>
                      <div className={`text-xs font-bold text-center py-1 leading-none ${isHoje ? "bg-brand text-white" : "text-slate-600"}`}>
                        {dia.d}
                      </div>
                      <div className="space-y-[2px] pb-[3px] px-[3px]">
                        {dia.encartes.map((e) => (
                          <button
                            key={e._id}
                            onClick={() => router.push(`/encartes/${e._id}`)}
                            onMouseEnter={(ev) => onHover(ev, e)}
                            onMouseLeave={onLeave}
                            className={`w-full rounded-[4px] py-[3px] px-1 text-left text-[9px] font-bold leading-none truncate ${e.cor.bg} ${e.cor.text}`}>
                            {e.nome}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Sem encartes */}
              {encartesFlat.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <IcoCalendar className="w-12 h-12 text-slate-200 mb-3" />
                  <p className="text-slate-400 text-sm">Nenhum encarte cadastrado ainda</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>

      {tooltip && (
        <div
          style={{ position: 'fixed', left: tooltip.x, top: tooltip.y - 8, transform: 'translate(-50%, -100%)', zIndex: 9999 }}
          className="pointer-events-none bg-slate-900 text-white rounded-xl shadow-xl px-3 py-2.5 text-xs min-w-[190px] max-w-[250px]"
        >
          {!tooltip.data ? (
            <div className="text-slate-400 text-center py-1 text-[11px]">Carregando...</div>
          ) : (
            <>
              <div className="font-bold text-sm mb-1.5">{tooltip.data.rede}</div>
              {tooltip.data.subs.length > 0 && (
                <div className="mb-1.5">
                  <div className="text-[9px] text-slate-400 uppercase tracking-wide mb-0.5">Subcategorias</div>
                  {tooltip.data.subs.map(s => (
                    <div key={s} className="text-[11px] text-slate-200 leading-snug">• {s}</div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-slate-700 pt-1.5 mt-1">
                <div>
                  <div className="text-[9px] text-slate-400 uppercase tracking-wide">Preço oferta</div>
                  <div className="text-[11px] font-semibold text-emerald-400">
                    {tooltip.data.ofertaMin === tooltip.data.ofertaMax ? tooltip.data.ofertaMin : tooltip.data.ofertaMin + ' – ' + tooltip.data.ofertaMax}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-400 uppercase tracking-wide">Sellout médio</div>
                  <div className="text-[11px] font-semibold text-amber-400">{tooltip.data.selloutMedio}</div>
                </div>
              </div>
              <div className="text-[9px] text-slate-500 mt-1.5 text-right">{tooltip.data.totalItens} produto{tooltip.data.totalItens !== 1 ? 's' : ''}</div>
            </>
          )}
          <div style={{ position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid #0f172a' }} />
        </div>
      )}
}
