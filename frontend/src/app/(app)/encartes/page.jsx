"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { fmtData } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import {
  IcoChevronRight,
  IcoX,
  IcoCalendar,
} from "@/components/Icons";

// ---------------------------------------------------------------------------
// Paleta de cores para distinguir encartes no calendario (expandida)
// ---------------------------------------------------------------------------
const PALETTE = [
  { bg: "bg-brand",          text: "text-white", light: "bg-brand/10",       border: "border-brand/25"       },
  { bg: "bg-emerald-500",    text: "text-white", light: "bg-emerald-50",     border: "border-emerald-200"    },
  { bg: "bg-violet-500",     text: "text-white", light: "bg-violet-50",      border: "border-violet-200"     },
  { bg: "bg-amber-500",      text: "text-white", light: "bg-amber-50",       border: "border-amber-200"      },
  { bg: "bg-rose-500",       text: "text-white", light: "bg-rose-50",        border: "border-rose-200"       },
  { bg: "bg-cyan-500",       text: "text-white", light: "bg-cyan-50",        border: "border-cyan-200"       },
  { bg: "bg-orange-500",     text: "text-white", light: "bg-orange-50",      border: "border-orange-200"     },
  { bg: "bg-pink-500",       text: "text-white", light: "bg-pink-50",        border: "border-pink-200"       },
  { bg: "bg-indigo-500",     text: "text-white", light: "bg-indigo-50",      border: "border-indigo-200"     },
  { bg: "bg-lime-500",       text: "text-white", light: "bg-lime-50",        border: "border-lime-200"       },
  { bg: "bg-fuchsia-500",    text: "text-white", light: "bg-fuchsia-50",     border: "border-fuchsia-200"    },
  { bg: "bg-red-500",        text: "text-white", light: "bg-red-50",         border: "border-red-200"        },
  { bg: "bg-green-600",      text: "text-white", light: "bg-green-50",       border: "border-green-200"      },
  { bg: "bg-blue-600",       text: "text-white", light: "bg-blue-50",        border: "border-blue-200"       },
  { bg: "bg-purple-600",     text: "text-white", light: "bg-purple-50",      border: "border-purple-200"     },
  { bg: "bg-teal-600",       text: "text-white", light: "bg-teal-50",        border: "border-teal-200"       },
];

function isoToYMD(iso) { return iso ? iso.slice(0, 10) : null; }

function ymd(ano, mes, dia) {
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Modal Seleção de Tipo de Ação
// ---------------------------------------------------------------------------
function SelecaoTipoModal({ onClose, onSelecionar }) {
  const [tipoSel, setTipoSel] = useState(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-900 text-lg">Selecione o tipo de ação</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition">
            <IcoX className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3">
          <button
            onClick={() => setTipoSel("oferta_interna")}
            className={`w-full p-4 rounded-xl border-2 text-left transition ${
              tipoSel === "oferta_interna"
                ? "border-brand bg-brand/5"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="font-semibold text-slate-900">Oferta Interna</div>
            <div className="text-xs text-slate-500 mt-1">Ação promocional interna da rede</div>
          </button>
          <button
            onClick={() => setTipoSel("encarte")}
            className={`w-full p-4 rounded-xl border-2 text-left transition ${
              tipoSel === "encarte"
                ? "border-brand bg-brand/5"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="font-semibold text-slate-900">Encarte</div>
            <div className="text-xs text-slate-500 mt-1">Encarte promocional tradicional</div>
          </button>
        </div>
        <div className="flex gap-2 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={() => tipoSel && onSelecionar(tipoSel)}
            disabled={!tipoSel}
            className="flex-1 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:opacity-90 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal Novo Encarte / Nova Oferta Interna
// ---------------------------------------------------------------------------
function NovoEncarteModal({ codigoRede, redeSubrede, tipo, onClose, onCriado }) {
  const isOfertaInterna = tipo === "oferta_interna";
  const titulo = isOfertaInterna ? "Nova Oferta Interna" : "Novo Encarte";
  const labelNome = isOfertaInterna ? "Nome da oferta interna" : "Nome do encarte";
  const placeholderNome = isOfertaInterna ? "Ex: Oferta Junho 2026" : "Ex: Encarte Junho 2026";

  const [nome, setNome] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    if (!nome.trim()) {
      setErro(`Informe o ${isOfertaInterna ? "nome da oferta interna" : "nome do encarte"}`);
      return;
    }
    if (!inicio || !fim) { setErro("Informe o periodo (inicio e fim)"); return; }
    if (fim < inicio) { setErro("Fim nao pode ser anterior ao inicio"); return; }
    setSalvando(true);
    try {
      const { data } = await api.post("/encartes", {
        nome: nome.trim(),
        codigoRede,
        tipo,
        periodoInicio: inicio,
        periodoFim: fim,
      });
      onCriado(data);
      onClose();
    } catch (err) {
      setErro(err.response?.data?.error || `Erro ao criar ${isOfertaInterna ? "oferta interna" : "encarte"}`);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10px] font-semibold text-brand uppercase tracking-wider">{titulo}</div>
            <h2 className="font-bold text-slate-900 text-base">{redeSubrede || codigoRede}</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition">
            <IcoX className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{labelNome}</label>
            <input
              autoFocus
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
              placeholder={placeholderNome}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Inicio</label>
              <input type="date" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Fim</label>
              <input type="date" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>
          {erro && <p className="text-red-600 text-xs">{erro}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button type="submit" disabled={salvando}
              className="flex-1 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:opacity-90 active:scale-95 transition disabled:opacity-60">
              {salvando ? "Salvando..." : "Criar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendario da rede
// ---------------------------------------------------------------------------
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

function CalendarioRede({ grupo, onClickEncarte }) {
  const hoje = new Date();
  const [mesAno, setMesAno] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() });
  const [tooltip, setTooltip] = useState(null);
  const [filtroNegociacao, setFiltroNegociacao] = useState("todos"); // "todos", "negociados", "nao-negociados"
  const [filtroTipo, setFiltroTipo] = useState("todos"); // "todos", "encartes", "ofertas_internas"
  const tooltipCache = useMemo(() => ({}), []);

  // Cor fixa para ofertas internas (preto)
  const COR_OFERTA_INTERNA = { bg: "bg-slate-900", text: "text-white", light: "bg-slate-100", border: "border-slate-300" };

  const encartesComCor = useMemo(() =>
    grupo.encartes
      .filter(e => {
        // Filtro negociação
        if (filtroNegociacao === "negociados" && e.negociado !== true) return false;
        if (filtroNegociacao === "nao-negociados" && e.negociado === true) return false;
        // Filtro tipo
        if (filtroTipo === "encartes" && e.tipo !== "encarte") return false;
        if (filtroTipo === "ofertas_internas" && e.tipo !== "oferta_interna") return false;
        return true;
      })
      .map((e, i) => {
        // Se for oferta_interna, usa cor preta fixa; senão usa paleta
        const cor = e.tipo === "oferta_interna" ? COR_OFERTA_INTERNA : PALETTE[i % PALETTE.length];
        return { ...e, cor };
      }),
    [grupo.encartes, filtroNegociacao, filtroTipo]
  );

  const diasDoMes = useMemo(() => {
    const { ano, mes } = mesAno;
    const totalDias = new Date(ano, mes + 1, 0).getDate();
    const offset = new Date(ano, mes, 1).getDay();
    const dias = [];
    for (let i = 0; i < offset; i++) dias.push(null);
    for (let d = 1; d <= totalDias; d++) {
      const dataStr = ymd(ano, mes, d);
      const encartesNoDia = encartesComCor.filter((e) => {
        const ini = isoToYMD(e.periodoInicio);
        const fim = isoToYMD(e.periodoFim);
        return ini && fim && dataStr >= ini && dataStr <= fim;
      });
      dias.push({ d, dataStr, encartes: encartesNoDia });
    }
    return dias;
  }, [mesAno, encartesComCor]);

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
          rede: grupo.redeSubrede || grupo.codigoRede,
          categorias,
          totalItens: itens.length,
          dataUltimaCompra: enc.dataUltimaCompraRecente || null,
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
    <div>
      {/* Dropdowns de filtro */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Filtro negociação */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">Negociação:</label>
          <select
            value={filtroNegociacao}
            onChange={(e) => setFiltroNegociacao(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/40 bg-white"
          >
            <option value="todos">Todos ({grupo.encartes.length})</option>
            <option value="negociados">Negociados ({grupo.encartes.filter(e => e.negociado).length})</option>
            <option value="nao-negociados">Não negociados ({grupo.encartes.filter(e => !e.negociado).length})</option>
          </select>
        </div>

        {/* Filtro tipo */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">Tipo:</label>
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/40 bg-white"
          >
            <option value="todos">Todos ({grupo.encartes.length})</option>
            <option value="encartes">Encartes ({grupo.encartes.filter(e => e.tipo === "encarte" || !e.tipo).length})</option>
            <option value="ofertas_internas">Ofertas Internas ({grupo.encartes.filter(e => e.tipo === "oferta_interna").length})</option>
          </select>
        </div>
      </div>

      {/* Legenda de cores */}
      <div className="mb-4 p-3 bg-gradient-to-r from-slate-50 to-slate-100 rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-slate-900 shrink-0"></div>
            <span className="text-xs text-slate-600 font-medium">Oferta Interna</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-gradient-to-r from-brand via-emerald-500 to-violet-500 shrink-0"></div>
            <span className="text-xs text-slate-600 font-medium">Encarte</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base shrink-0">✅</span>
            <span className="text-xs text-slate-600 font-medium">Negociado</span>
          </div>
        </div>
      </div>

      {/* Navegacao de mes */}
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

      {/* Cabecalho dias da semana */}
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
            <div key={dia.d} className={`rounded-xl overflow-hidden min-h-[52px] ${dia.encartes.length > 0 ? "ring-1 ring-slate-200" : ""}`}>
              <div className={`text-xs font-bold text-center py-1 leading-none ${isHoje ? "bg-brand text-white" : "text-slate-600"}`}>
                {dia.d}
              </div>
              <div className="space-y-[2px] pb-[3px] px-[3px]">
                {dia.encartes.map((e) => {
                  const isInicio = isoToYMD(e.periodoInicio) === dia.dataStr;
                  return (
                    <button key={e._id} onClick={() => onClickEncarte(e._id)} title={e.nome}
                      onMouseEnter={(ev) => onHover(ev, e)}
                      onMouseLeave={onLeave}
                      className={`w-full rounded-[4px] py-[3px] px-1 text-left text-[9px] font-bold leading-none truncate ${e.cor.bg} ${e.cor.text} flex items-center gap-0.5`}>
                      {e.negociado && <span className="text-[11px] shrink-0 drop-shadow-sm">✅</span>}
                      <span className="truncate">{e.nome}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mensagem quando nao ha encartes */}
      {encartesComCor.length === 0 && (
        <p className="text-slate-400 text-sm text-center py-6">Nenhum encarte cadastrado ainda para esta rede</p>
      )}

      {/* Tooltip ao passar mouse */}
      {tooltip && (
        <div
          style={{ position: 'fixed', left: tooltip.x, top: tooltip.y - 8, transform: 'translate(-50%, -100%)', zIndex: 9999 }}
          className="pointer-events-none bg-slate-900 text-white rounded-xl shadow-xl px-3 py-2.5 text-xs min-w-[220px] max-w-[300px]"
        >
          {!tooltip.data ? (
            <div className="text-slate-400 text-center py-1 text-[11px]">Carregando...</div>
          ) : (
            <>
              <div className="font-bold text-sm mb-1">{tooltip.data.rede}</div>
              {tooltip.data.dataUltimaCompra && (
                <div className="text-slate-400 text-[9px] mb-2">Última compra: {new Date(tooltip.data.dataUltimaCompra).toLocaleDateString('pt-BR')}</div>
              )}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagina principal
// ---------------------------------------------------------------------------
const STORAGE_KEY = "encartes_rede_sel";

export default function EncartesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [redeSel, setRedeSel] = useState(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem(STORAGE_KEY) || "";
    return "";
  });
  const [modalSelecaoTipo, setModalSelecaoTipo] = useState(false);
  const [modalCriacao, setModalCriacao] = useState(false);
  const [tipoSelecionado, setTipoSelecionado] = useState(null);

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

  // Detectar parâmetro ?rede= da URL e selecionar automaticamente
  useEffect(() => {
    const redeParam = searchParams.get('rede');
    if (redeParam && grupos.length > 0) {
      const redeExiste = grupos.some(g => g.codigoRede === redeParam);
      if (redeExiste) {
        setRedeSel(redeParam);
        if (typeof window !== "undefined") {
          sessionStorage.setItem(STORAGE_KEY, redeParam);
        }
      }
    }
  }, [searchParams, grupos]);

  function selecionarRede(codigo) {
    setRedeSel(codigo);
    if (typeof window !== "undefined") {
      if (codigo) sessionStorage.setItem(STORAGE_KEY, codigo);
      else sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  const grupoSel = grupos.find((g) => g.codigoRede === redeSel) || null;

  function handleCriado(novoEncarte) {
    router.push(`/encartes/${novoEncarte._id}`);
  }

  function handleSelecaoTipo(tipo) {
    setTipoSelecionado(tipo);
    setModalSelecaoTipo(false);
    setModalCriacao(true);
  }

  function handleFecharCriacao() {
    setModalCriacao(false);
    setTipoSelecionado(null);
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Header com título + botão Novo Encarte */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 safe-area-pt">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-bold text-slate-900 text-lg leading-tight">Agenda de Encartes</h1>
            <p className="text-slate-500 text-xs mt-0.5">Selecione uma rede para ver o calendário</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/encartes/calendario"
              className="shrink-0 h-9 px-3 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-200 transition">
              <IcoCalendar className="w-4 h-4" />
              <span className="hidden sm:inline">Cal. Geral</span>
            </Link>
            {grupoSel?.podeEditar && (
              <button
                onClick={() => setModalSelecaoTipo(true)}
                className="shrink-0 h-9 px-4 rounded-xl bg-brand text-white text-xs font-bold hover:opacity-90 active:scale-95 transition shadow-sm shadow-brand/20">
                + Nova Ação
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 pb-24 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Rede</label>
          {loading ? (
            <div className="h-11 bg-slate-100 rounded-xl animate-pulse" />
          ) : (
            <select
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/40"
              value={redeSel}
              onChange={(e) => selecionarRede(e.target.value)}>
              <option value="">Selecione uma rede...</option>
              {grupos.map((g) => (
                <option key={g.codigoRede} value={g.codigoRede}>
                  {g.redeSubrede || g.codigoRede}
                </option>
              ))}
            </select>
          )}
        </div>

        {!redeSel && !loading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <IcoCalendar className="w-12 h-12 text-slate-200 mb-3" />
            <p className="text-slate-400 text-sm">Selecione uma rede para ver o calendário de encartes</p>
          </div>
        )}

        {grupoSel && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <CalendarioRede
              grupo={grupoSel}
              onClickEncarte={(id) => router.push(`/encartes/${id}`)}
            />
          </div>
        )}
      </div>

      {modalSelecaoTipo && grupoSel && (
        <SelecaoTipoModal
          onClose={() => setModalSelecaoTipo(false)}
          onSelecionar={handleSelecaoTipo}
        />
      )}

      {modalCriacao && grupoSel && tipoSelecionado && (
        <NovoEncarteModal
          codigoRede={grupoSel.codigoRede}
          redeSubrede={grupoSel.redeSubrede}
          tipo={tipoSelecionado}
          onClose={handleFecharCriacao}
          onCriado={handleCriado}
        />
      )}
    </div>
  );
}
