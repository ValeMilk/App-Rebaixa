"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { fmtDataHora } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { IcoClipboard, IcoChevronRight, IcoCheck, IcoX, IcoSync, IcoClock, IcoUser, IcoAlert } from "@/components/Icons";

const STATUS = {
  pendente_supervisor: { label: "Aguard. Supervisor", bg: "bg-amber-50",   text: "text-amber-700",  border: "border-amber-200",   dot: "bg-amber-500" },
  aprovado_supervisor: { label: "Aguard. Diretoria",  bg: "bg-blue-50",    text: "text-blue-700",   border: "border-blue-200",    dot: "bg-blue-500" },
  aprovado_final:      { label: "Aprovado",           bg: "bg-emerald-50", text: "text-emerald-700",border: "border-emerald-200", dot: "bg-emerald-500" },
  rejeitado:           { label: "Rejeitado",          bg: "bg-red-50",     text: "text-red-700",    border: "border-red-200",     dot: "bg-red-500" },
  cancelado:           { label: "Cancelado",          bg: "bg-slate-100",  text: "text-slate-600",  border: "border-slate-200",   dot: "bg-slate-400" },
  pendente:            { label: "Pendente",           bg: "bg-amber-50",   text: "text-amber-700",  border: "border-amber-200",   dot: "bg-amber-500" },
  aprovada:            { label: "Aprovada",           bg: "bg-emerald-50", text: "text-emerald-700",border: "border-emerald-200", dot: "bg-emerald-500" },
  rejeitada:           { label: "Rejeitada",          bg: "bg-red-50",     text: "text-red-700",    border: "border-red-200",     dot: "bg-red-500" },
  cancelada:           { label: "Cancelada",          bg: "bg-slate-100",  text: "text-slate-600",  border: "border-slate-200",   dot: "bg-slate-400" },
};

function StatusBadge({ s }) {
  const st = STATUS[s] || { label: s, bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200", dot: "bg-slate-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${st.bg} ${st.text} ${st.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
      {st.label}
    </span>
  );
}

function fmtBRL(v) {
  if (v == null) return null;
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function SolicitacoesPage() {
  const { user } = useAuth();
  const [lista, setLista] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [decidindo, setDecidindo] = useState(null);
  const [motivoDecisao, setMotivoDecisao] = useState("");

  async function carregar(stOverride) {
    setLoading(true);
    try {
      const params = {};
      const st = stOverride !== undefined ? stOverride : status;
      if (st) params.status = st;
      const { data } = await api.get("/solicitacoes", { params });
      setLista(data.solicitacoes || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(""); }, []);

  function setFiltro(v) {
    setStatus(v);
    carregar(v);
  }

  function podeDecidir(sol) {
    if (user?.role === "supervisor") return sol.status === "pendente_supervisor";
    if (user?.role === "diretoria" || user?.role === "admin")
      return sol.status === "pendente_supervisor" || sol.status === "aprovado_supervisor";
    return false;
  }

  async function handleDecisao(id, decisao) {
    try {
      await api.post(`/solicitacoes/${id}/decidir`, { decisao, motivoDecisao });
      setDecidindo(null);
      setMotivoDecisao("");
      carregar();
    } catch (err) {
      alert(err.response?.data?.error || "Erro ao decidir");
    }
  }

  const pendentesAprovacao = lista.filter(podeDecidir).length;

  const FILTROS = [
    { v: "", l: "Todos" },
    { v: "pendente_supervisor", l: "Ag. Supervisor" },
    { v: "aprovado_supervisor", l: "Ag. Diretoria" },
    { v: "aprovado_final", l: "Aprovados" },
    { v: "rejeitado", l: "Rejeitados" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Pedidos</h1>
          <p className="text-slate-500 text-sm mt-0.5">Rebaixas e ofertas</p>
        </div>
        <div className="flex items-center gap-2">
          {pendentesAprovacao > 0 && (
            <span className="inline-flex items-center gap-1.5 bg-amber-500 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-full shadow-sm">
              <IcoAlert className="w-3.5 h-3.5" />
              {pendentesAprovacao} p/ aprovar
            </span>
          )}
          <div className="w-10 h-10 rounded-2xl bg-brand/10 text-brand flex items-center justify-center">
            <IcoClipboard className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filtro horizontal scroll */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        {FILTROS.map(({ v, l }) => (
          <button
            key={v}
            onClick={() => setFiltro(v)}
            className={`chip ${status === v ? "chip-active" : ""}`}
          >
            {l}
          </button>
        ))}
        <button onClick={() => carregar()} aria-label="Atualizar" className="chip">
          <IcoSync className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-9 h-9 rounded-full border-4 border-slate-200 border-t-brand animate-spin" />
          <p className="text-sm text-slate-400">Carregando...</p>
        </div>
      ) : lista.length === 0 ? (
        <div className="text-center py-16 px-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
            <IcoClipboard className="w-7 h-7" />
          </div>
          <p className="text-slate-500 font-medium">Nenhuma solicitação</p>
          <p className="text-slate-400 text-sm mt-1">As solicitações aparecerão aqui</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map((s) => {
            const pode = podeDecidir(s);
            return (
              <div key={s._id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition ${pode ? "border-amber-200 ring-1 ring-amber-100" : "border-slate-200"}`}>
                {/* Cabeçalho */}
                <div className="px-4 pt-3.5 pb-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900 truncate">{s.cliente}</div>
                      <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <span className="inline-flex items-center gap-1">
                          <IcoUser className="w-3 h-3" />
                          {s.criadoPorNome || s.supervisorNome || "—"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <IcoClock className="w-3 h-3" />
                          {fmtDataHora(s.createdAt)}
                        </span>
                      </div>
                    </div>
                    <StatusBadge s={s.status} />
                  </div>

                  {/* Itens resumidos */}
                  <div className="space-y-1.5 mt-2">
                    {s.itens?.slice(0, 2).map((it, i) => (
                      <div key={i} className="flex items-center justify-between text-sm gap-2">
                        <span className="text-slate-700 truncate flex-1">{it.produto}</span>
                        <div className="flex gap-2 items-center shrink-0">
                          {it.precoOferta && (
                            <span className="text-brand font-bold text-xs">{fmtBRL(it.precoOferta)}</span>
                          )}
                          {it.margemCalculada != null && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${it.margemCalculada >= 20 ? "bg-emerald-100 text-emerald-700" : it.margemCalculada >= 10 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                              {it.margemCalculada}%
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {s.itens?.length > 2 && (
                      <div className="text-xs text-slate-400">+{s.itens.length - 2} produto(s)…</div>
                    )}
                  </div>

                  {s.motivo && (
                    <div className="mt-2.5 text-xs text-slate-500 italic bg-slate-50 rounded-lg px-2.5 py-1.5">"{s.motivo}"</div>
                  )}
                </div>

                {/* Rodapé */}
                <div className="border-t border-slate-100 px-4 py-2.5 flex items-center justify-between gap-2 bg-slate-50/50">
                  <Link href={`/solicitacoes/${s._id}`} className="inline-flex items-center gap-1 text-xs text-brand font-semibold active:scale-95 transition">
                    Ver detalhes <IcoChevronRight className="w-3.5 h-3.5" />
                  </Link>

                  {pode && (
                    decidindo === s._id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          className="input text-xs py-1 px-2 w-28"
                          placeholder="Motivo"
                          value={motivoDecisao}
                          onChange={(e) => setMotivoDecisao(e.target.value)}
                        />
                        <button onClick={() => handleDecisao(s._id, "aprovado")} aria-label="Aprovar" className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center active:scale-95 transition">
                          <IcoCheck className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDecisao(s._id, "rejeitado")} aria-label="Rejeitar" className="h-8 w-8 bg-red-500 hover:bg-red-600 text-white rounded-lg flex items-center justify-center active:scale-95 transition">
                          <IcoX className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setDecidindo(null); setMotivoDecisao(""); }} aria-label="Cancelar" className="h-8 w-8 text-slate-400 hover:bg-slate-100 rounded-lg flex items-center justify-center">
                          <IcoX className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDecidindo(s._id)}
                        className="inline-flex items-center gap-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg font-semibold active:scale-95 transition shadow-sm"
                      >
                        <IcoCheck className="w-3.5 h-3.5" />
                        Decidir
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
