"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { fmtData } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  IcoChevronRight,
  IcoX,
  IcoCalendar,
} from "@/components/Icons";

// ---------------------------------------------------------------------------
// Paleta de cores para distinguir encartes no calendario
// ---------------------------------------------------------------------------
const PALETTE = [
  { bg: "bg-brand",       text: "text-white", light: "bg-brand/10",    border: "border-brand/25"    },
  { bg: "bg-emerald-500", text: "text-white", light: "bg-emerald-50",  border: "border-emerald-200" },
  { bg: "bg-violet-500",  text: "text-white", light: "bg-violet-50",   border: "border-violet-200"  },
  { bg: "bg-amber-500",   text: "text-white", light: "bg-amber-50",    border: "border-amber-200"   },
  { bg: "bg-rose-500",    text: "text-white", light: "bg-rose-50",     border: "border-rose-200"    },
  { bg: "bg-cyan-500",    text: "text-white", light: "bg-cyan-50",     border: "border-cyan-200"    },
  { bg: "bg-orange-500",  text: "text-white", light: "bg-orange-50",   border: "border-orange-200"  },
  { bg: "bg-pink-500",    text: "text-white", light: "bg-pink-50",     border: "border-pink-200"    },
];

function isoToYMD(iso) { return iso ? iso.slice(0, 10) : null; }

function ymd(ano, mes, dia) {
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Modal Novo Encarte
// ---------------------------------------------------------------------------
function NovoEncarteModal({ codigoRede, redeSubrede, onClose, onCriado }) {
  const [nome, setNome] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    if (!nome.trim()) { setErro("Informe o nome do encarte"); return; }
    if (!inicio || !fim) { setErro("Informe o periodo (inicio e fim)"); return; }
    if (fim < inicio) { setErro("Fim nao pode ser anterior ao inicio"); return; }
    setSalvando(true);
    try {
      const { data } = await api.post("/encartes", {
        nome: nome.trim(),
        codigoRede,
        periodoInicio: inicio,
        periodoFim: fim,
      });
      onCriado(data);
      onClose();
    } catch (err) {
      setErro(err.response?.data?.error || "Erro ao criar encarte");
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
            <div className="text-[10px] font-semibold text-brand uppercase tracking-wider">Novo Encarte</div>
            <h2 className="font-bold text-slate-900 text-base">{redeSubrede || codigoRede}</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition">
            <IcoX className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Nome do encarte</label>
            <input
              autoFocus
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
              placeholder="Ex: Encarte Junho 2026"
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

  const encartesComCor = useMemo(() =>
    grupo.encartes.map((e, i) => ({ ...e, cor: PALETTE[i % PALETTE.length] })),
    [grupo.encartes]
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

  const nomeMes = new Date(mesAno.ano, mesAno.mes, 1)
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const hojeStr = ymd(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const mesStr = ymd(mesAno.ano, mesAno.mes, 1).slice(0, 7);

  const encartesNoMes = encartesComCor.filter((e) => {
    const ini = isoToYMD(e.periodoInicio);
    const fim = isoToYMD(e.periodoFim);
    return ini && fim && (
      ini.slice(0, 7) === mesStr ||
      fim.slice(0, 7) === mesStr ||
      (ini.slice(0, 7) < mesStr && fim.slice(0, 7) > mesStr)
    );
  });

  function prevMes() {
    setMesAno((p) => { const d = new Date(p.ano, p.mes - 1, 1); return { ano: d.getFullYear(), mes: d.getMonth() }; });
  }
  function nextMes() {
    setMesAno((p) => { const d = new Date(p.ano, p.mes + 1, 1); return { ano: d.getFullYear(), mes: d.getMonth() }; });
  }

  return (
    <div>
      {/* Navegacao de mes */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMes}
          className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition">
          <IcoChevronRight className="w-4 h-4 rotate-180" />
        </button>
        <span className="font-bold text-slate-800 capitalize text-sm">{nomeMes}</span>
        <button onClick={nextMes}
          className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition">
          <IcoChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Cabecalho dias da semana */}
      <div className="grid grid-cols-7 mb-1">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-slate-400 py-1">{d}</div>
        ))}
      </div>

      {/* Grid de dias */}
      <div className="grid grid-cols-7 gap-[3px]">
        {diasDoMes.map((dia, i) => {
          if (!dia) return <div key={`v${i}`} />;
          const isHoje = dia.dataStr === hojeStr;
          return (
            <div key={dia.d} className={`rounded-lg overflow-hidden ${dia.encartes.length > 0 ? "ring-1 ring-slate-200" : ""}`}>
              <div className={`text-[11px] font-bold text-center py-[3px] leading-none ${isHoje ? "bg-brand text-white" : "text-slate-600"}`}>
                {dia.d}
              </div>
              <div className="space-y-[2px] pb-[2px] px-[2px]">
                {dia.encartes.map((e) => {
                  const isInicio = isoToYMD(e.periodoInicio) === dia.dataStr;
                  return (
                    <button key={e._id} onClick={() => onClickEncarte(e._id)} title={e.nome}
                      className={`w-full rounded-[3px] py-[2px] px-[2px] text-left text-[7px] font-bold leading-none truncate ${e.cor.bg} ${e.cor.text}`}>
                      {isInicio ? e.nome : "\u00A0"}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legenda */}
      <div className="mt-5 space-y-2">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Encartes {encartesNoMes.length === 0 ? "— nenhum neste mes" : `(${encartesNoMes.length})`}
        </div>
        {encartesNoMes.map((e) => (
          <button key={e._id} onClick={() => onClickEncarte(e._id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border ${e.cor.light} ${e.cor.border} text-left hover:opacity-80 transition`}>
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${e.cor.bg}`} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-800 text-sm truncate">{e.nome}</div>
              <div className="text-xs text-slate-500">{fmtData(e.periodoInicio)} ate {fmtData(e.periodoFim)}</div>
            </div>
            {!e.podeEditar && (
              <span className="text-[10px] bg-white/80 text-slate-500 font-semibold px-2 py-0.5 rounded-full shrink-0 border border-slate-200">Vis.</span>
            )}
            <IcoChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>
        ))}
        {encartesNoMes.length === 0 && encartesComCor.length > 0 && (
          <p className="text-slate-400 text-xs text-center py-1">Nenhum encarte neste mes. Navegue para ver outros meses.</p>
        )}
        {encartesComCor.length === 0 && (
          <p className="text-slate-400 text-sm text-center py-2">Nenhum encarte cadastrado ainda para esta rede</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagina principal
// ---------------------------------------------------------------------------
const STORAGE_KEY = "encartes_rede_sel";

export default function EncartesPage() {
  const router = useRouter();
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [redeSel, setRedeSel] = useState(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem(STORAGE_KEY) || "";
    return "";
  });
  const [modalAberto, setModalAberto] = useState(false);

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

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Header com título + botão Novo Encarte */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 safe-area-pt">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-bold text-slate-900 text-lg leading-tight">Agenda de Encartes</h1>
            <p className="text-slate-500 text-xs mt-0.5">Selecione uma rede para ver o calendário</p>
          </div>
          {grupoSel?.podeEditar && (
            <button
              onClick={() => setModalAberto(true)}
              className="shrink-0 h-9 px-4 rounded-xl bg-brand text-white text-xs font-bold hover:opacity-90 active:scale-95 transition shadow-sm shadow-brand/20">
              + Novo Encarte
            </button>
          )}
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

      {modalAberto && grupoSel && (
        <NovoEncarteModal
          codigoRede={grupoSel.codigoRede}
          redeSubrede={grupoSel.redeSubrede}
          onClose={() => setModalAberto(false)}
          onCriado={handleCriado}
        />
      )}
    </div>
  );
}
