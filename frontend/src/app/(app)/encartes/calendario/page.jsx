"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { IcoChevronRight, IcoCalendar } from "@/components/Icons";

// ---------------------------------------------------------------------------
// Paleta: uma cor por rede (expandida para suportar mais redes)
// ---------------------------------------------------------------------------
const PALETTE = [
  { bg: "bg-brand",          text: "text-white" },
  { bg: "bg-emerald-500",    text: "text-white" },
  { bg: "bg-violet-500",     text: "text-white" },
  { bg: "bg-amber-500",      text: "text-white" },
  { bg: "bg-rose-500",       text: "text-white" },
  { bg: "bg-cyan-500",       text: "text-white" },
  { bg: "bg-orange-500",     text: "text-white" },
  { bg: "bg-pink-500",       text: "text-white" },
  { bg: "bg-indigo-500",     text: "text-white" },
  { bg: "bg-lime-500",       text: "text-white" },
  { bg: "bg-fuchsia-500",    text: "text-white" },
  { bg: "bg-red-500",        text: "text-white" },
  { bg: "bg-green-600",      text: "text-white" },
  { bg: "bg-blue-600",       text: "text-white" },
  { bg: "bg-purple-600",     text: "text-white" },
  { bg: "bg-teal-600",       text: "text-white" },
];

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

function isoToYMD(iso) { return iso ? iso.slice(0, 10) : null; }
function ymd(ano, mes, dia) {
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
const STORAGE_KEY_SUPERVISOR = "calendario_supervisor_sel";

export default function CalendarioGeralPage() {
  const router = useRouter();
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState(null);
  const [redeFiltrada, setRedeFiltrada] = useState(null); // Nome da rede filtrada
  const [supervisores, setSupervisores] = useState([]); // Lista de supervisores
  const [supervisorFiltrado, setSupervisorFiltrado] = useState(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem(STORAGE_KEY_SUPERVISOR) || null;
    return null;
  }); // ID ou null
  const [userRole, setUserRole] = useState(null); // admin ou diretoria
  const tooltipCache = useMemo(() => ({}), []);

  const hoje = new Date();
  const [mesAno, setMesAno] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() });

  // Salva filtro de supervisor em sessionStorage
  useEffect(() => {
    if (supervisorFiltrado) {
      sessionStorage.setItem(STORAGE_KEY_SUPERVISOR, supervisorFiltrado);
    } else {
      sessionStorage.removeItem(STORAGE_KEY_SUPERVISOR);
    }
  }, [supervisorFiltrado]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/encartes");
      setGrupos(data.grupos || []);
      
      // Buscar lista de supervisores (apenas para admin/diretoria)
      try {
        const { data: userInfo } = await api.get("/auth/me");
        const role = userInfo.user?.role;
        console.log("[CalendarioGeral] User role:", role);
        setUserRole(role);
        
        if (role === "admin" || role === "diretoria") {
          const { data: supData } = await api.get("/responsaveis-rede/supervisores-disponiveis");
          console.log("[CalendarioGeral] Supervisores carregados:", supData.supervisores);
          setSupervisores(supData.supervisores || []);
        } else {
          console.log("[CalendarioGeral] User role não é admin/diretoria, pulando supervisores");
        }
      } catch (err) {
        console.error("[CalendarioGeral] Erro ao buscar supervisores:", err);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Mapa de cores FIXO por nome de rede (para consistência)
  const mapeoCores = useMemo(() => {
    const mapa = {};
    grupos.forEach((g, gi) => {
      const redeNome = g.redeSubrede || g.codigoRede;
      if (!mapa[redeNome]) {
        mapa[redeNome] = PALETTE[gi % PALETTE.length];
      }
    });
    return mapa;
  }, [grupos]);

  // Achata todos os encartes — usa mapa fixo de cores, aplica filtro de supervisor
  const encartesFlat = useMemo(() => {
    const result = [];
    grupos.forEach((g) => {
      const redeNome = g.redeSubrede || g.codigoRede;
      const cor = mapeoCores[redeNome] || PALETTE[0];
      g.encartes.forEach((e) => {
        // Filtro de supervisor: se tem supervisor filtrado, verifica se o encarte foi criado por ele
        if (supervisorFiltrado) {
          if (String(e.criadoPorId) === supervisorFiltrado) {
            result.push({ ...e, cor, redeNome });
          }
        } else {
          result.push({ ...e, cor, redeNome });
        }
      });
    });
    return result;
  }, [grupos, mapeoCores, supervisorFiltrado]);

  // Redes que têm pelo menos 1 encarte (para legenda)
  const redesComEncartes = useMemo(() =>
    grupos
      .filter((g) => g.encartes.length > 0)
      .map((g) => {
        const redeNome = g.redeSubrede || g.codigoRede;
        return { nome: redeNome, cor: mapeoCores[redeNome] || PALETTE[0] };
      }),
    [grupos, mapeoCores]
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
        // Agrupar por subcategoria
        const mapasSub = {};
        itens.forEach(it => {
          const sub = it.subcategoria || 'Sem categoria';
          if (!mapasSub[sub]) mapasSub[sub] = { ofertas: [], sellouts: [], uc: [], custoPromos: [], margens: [] };
          if (it.precoOferta != null) mapasSub[sub].ofertas.push(it.precoOferta);
          if (it.sellout != null) mapasSub[sub].sellouts.push(it.sellout);
          // Calcula margem para cada item
          const uc = Number(it.precoUltimaCompra) || 0;
          const sell = Number(it.sellout) || 0;
          const custoPromo = Math.max(0, uc - sell);
          const oferta = Number(it.precoOferta) || 0;
          if (custoPromo > 0 && oferta > 0) {
            const margem = ((oferta - custoPromo) / oferta) * 100;
            mapasSub[sub].margens.push(margem);
          }
          if (uc > 0) mapasSub[sub].uc.push(uc);
          if (custoPromo > 0) mapasSub[sub].custoPromos.push(custoPromo);
        });
        const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
        const categorias = Object.entries(mapasSub).map(([sub, v]) => ({
          sub,
          ofertaMedia: avg(v.ofertas),
          selloutMedio: avg(v.sellouts),
          custoPromoMedio: avg(v.custoPromos),
          margemMedia: avg(v.margens),
          qtd: v.ofertas.length || v.sellouts.length,
        }));
        const info = {
          rede: enc.redeNome,
          categorias,
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
    <>
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
            {/* Legenda de redes — clicável para filtrar */}
            {redesComEncartes.length > 0 && (
              <div className="mb-4 p-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">Filtrar por rede (clique para selecionar)</div>
                <div className="flex flex-wrap gap-x-3 gap-y-2">
                  {/* Botão "Mostrar tudo" */}
                  <button
                    onClick={() => setRedeFiltrada(null)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      redeFiltrada === null
                        ? "bg-slate-200 text-slate-900"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-150"
                    }`}
                  >
                    <span>✓ Todas</span>
                  </button>
                  
                  {/* Legendas por rede */}
                  {redesComEncartes.map((r) => (
                    <button
                      key={r.nome}
                      onClick={() => setRedeFiltrada(redeFiltrada === r.nome ? null : r.nome)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        redeFiltrada === r.nome
                          ? `${r.cor.bg} ${r.cor.text} shadow-md`
                          : `bg-slate-100 text-slate-600 hover:bg-slate-150`
                      }`}
                    >
                      <span className={`inline-block w-2.5 h-2.5 rounded-sm shrink-0 ${r.cor.bg}`} />
                      {r.nome}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Filtro de supervisor — apenas para admin/diretoria */}
            {(userRole === "admin" || userRole === "diretoria") && supervisores.length > 0 && (
              <div className="mb-4 p-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">Filtrar por supervisor</div>
                <select
                  value={supervisorFiltrado || ""}
                  onChange={(e) => setSupervisorFiltrado(e.target.value || null)}
                  className="w-full md:w-64 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition"
                >
                  <option value="">Todos os supervisores</option>
                  {supervisores.map((sup) => (
                    <option key={sup._id} value={sup._id}>{sup.nome}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Debug: mostrar status do filtro de supervisor */}
            {process.env.NODE_ENV === "development" && (
              <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
                <div>userRole: {userRole}</div>
                <div>supervisores.length: {supervisores.length}</div>
                <div>Mostrando dropdown? {((userRole === "admin" || userRole === "diretoria") && supervisores.length > 0) ? "SIM" : "NÃO"}</div>
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
                        {dia.encartes.map((e) => {
                          const selecionado = redeFiltrada === null || e.redeNome === redeFiltrada;
                          return (
                            <button
                              key={e._id}
                              onClick={() => router.push(`/encartes/${e._id}`)}
                              onMouseEnter={(ev) => onHover(ev, e)}
                              onMouseLeave={onLeave}
                              className={`w-full rounded-[4px] py-[3px] px-1 text-left text-[9px] font-bold leading-none truncate transition ${e.cor.bg} ${e.cor.text} ${
                                selecionado ? "opacity-100" : "opacity-30"
                              }`}>
                              {e.nome}
                            </button>
                          );
                        })}
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
          className="pointer-events-none bg-slate-900 text-white rounded-xl shadow-xl px-3 py-2.5 text-xs min-w-[220px] max-w-[300px]"
        >
          {!tooltip.data ? (
            <div className="text-slate-400 text-center py-1 text-[11px]">Carregando...</div>
          ) : (
            <>
              <div className="font-bold text-sm mb-2">{tooltip.data.rede}</div>
              {/* Cabeçalho da tabela */}
              <div className="grid grid-cols-4 gap-x-2 text-[9px] text-slate-400 uppercase tracking-wide border-b border-slate-700 pb-1 mb-1">
                <div className="col-span-1">Subcategoria</div>
                <div className="text-right">Preço oferta</div>
                <div className="text-right">Sellout</div>
                <div className="text-right">Margem %</div>
              </div>
              {/* Linhas por subcategoria */}
              {tooltip.data.categorias.map(c => (
                <div key={c.sub} className="grid grid-cols-4 gap-x-2 py-[3px] border-b border-slate-800 last:border-0">
                  <div className="col-span-1 text-[10px] text-slate-200 leading-tight truncate">{c.sub}</div>
                  <div className="text-right text-[10px] font-semibold text-emerald-400">{c.ofertaMedia != null ? fmtBRL(c.ofertaMedia) : '—'}</div>
                  <div className="text-right text-[10px] font-semibold text-amber-400">{c.selloutMedio != null ? fmtBRL(c.selloutMedio) : '—'}</div>
                  <div className={`text-right text-[10px] font-semibold ${c.margemMedia != null ? (c.margemMedia >= 20 ? 'text-emerald-300' : c.margemMedia >= 10 ? 'text-yellow-300' : 'text-red-300') : 'text-slate-400'}`}>
                    {c.margemMedia != null ? `${c.margemMedia.toFixed(1)}%` : '—'}
                  </div>
                </div>
              ))}
              <div className="text-[9px] text-slate-500 mt-1.5 text-right">{tooltip.data.totalItens} produto{tooltip.data.totalItens !== 1 ? 's' : ''}</div>
            </>
          )}
          <div style={{ position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid #0f172a' }} />
        </div>
      )}
    </>
  );
}
