"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { fmtDataHora } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const STATUS = {
  pendente_supervisor: { label: "Aguard. Supervisor", bg: "bg-amber-100",  text: "text-amber-800",  border: "border-amber-200" },
  aprovado_supervisor: { label: "Aguard. Diretoria",  bg: "bg-blue-100",   text: "text-blue-800",   border: "border-blue-200" },
  aprovado_final:      { label: "Aprovado",           bg: "bg-emerald-100",text: "text-emerald-800",border: "border-emerald-200" },
  rejeitado:           { label: "Rejeitado",          bg: "bg-red-100",    text: "text-red-800",    border: "border-red-200" },
  cancelado:           { label: "Cancelado",          bg: "bg-slate-100",  text: "text-slate-600",  border: "border-slate-200" },
  // legado
  pendente:            { label: "Pendente",           bg: "bg-amber-100",  text: "text-amber-800",  border: "border-amber-200" },
  aprovada:            { label: "Aprovada",           bg: "bg-emerald-100",text: "text-emerald-800",border: "border-emerald-200" },
  rejeitada:           { label: "Rejeitada",          bg: "bg-red-100",    text: "text-red-800",    border: "border-red-200" },
  cancelada:           { label: "Cancelada",          bg: "bg-slate-100",  text: "text-slate-600",  border: "border-slate-200" },
};

function StatusBadge({ s }) {
  const st = STATUS[s] || { label: s, bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" };
  return (
    <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full border ${st.bg} ${st.text} ${st.border}`}>
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
  const [decidindo, setDecidindo] = useState(null); // id da solicitação sendo decidida
  const [motivoDecisao, setMotivoDecisao] = useState("");

  async function carregar() {
    setLoading(true);
    try {
      const params = {};
      if (status) params.status = status;
      const { data } = await api.get("/solicitacoes", { params });
      setLista(data.solicitacoes || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  // Pode o usuário decidir sobre esta solicitação?
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pedidos</h1>
          <p className="text-slate-500 text-sm">Rebaixas e ofertas</p>
        </div>
        {pendentesAprovacao > 0 && (
          <span className="bg-amber-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
            {pendentesAprovacao} p/ aprovar
          </span>
        )}
      </div>

      {/* Filtro status */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {[
          { v: "", l: "Todos" },
          { v: "pendente_supervisor", l: "Ag. Supervisor" },
          { v: "aprovado_supervisor", l: "Ag. Diretoria" },
          { v: "aprovado_final", l: "Aprovados" },
          { v: "rejeitado", l: "Rejeitados" },
        ].map(({ v, l }) => (
          <button
            key={v}
            onClick={() => { setStatus(v); }}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium border transition ${status === v ? "bg-brand text-white border-brand" : "bg-white text-slate-600 border-slate-200"}`}
          >
            {l}
          </button>
        ))}
        <button onClick={carregar} className="shrink-0 text-xs px-3 py-1.5 rounded-full font-medium border bg-white border-slate-200 text-slate-600">
          ↻
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">Carregando...</div>
      ) : lista.length === 0 ? (
        <div className="text-center py-16 text-slate-400">Nenhuma solicitação</div>
      ) : (
        <div className="space-y-3">
          {lista.map((s) => (
            <div key={s._id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${podeDecidir(s) ? "border-amber-300" : "border-slate-200"}`}>
              {/* Cabeçalho do card */}
              <div className="px-4 pt-3.5 pb-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{s.cliente}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {s.criadoPorNome || s.supervisorNome} · {fmtDataHora(s.createdAt)}
                    </div>
                  </div>
                  <StatusBadge s={s.status} />
                </div>

                {/* Itens resumidos */}
                <div className="space-y-1">
                  {s.itens?.slice(0, 2).map((it, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700 truncate flex-1">{it.produto}</span>
                      <div className="flex gap-2 items-center ml-2 shrink-0">
                        {it.precoOferta && (
                          <span className="text-brand font-semibold text-xs">{fmtBRL(it.precoOferta)}</span>
                        )}
                        {it.margemCalculada != null && (
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${it.margemCalculada >= 20 ? "bg-emerald-100 text-emerald-700" : it.margemCalculada >= 10 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                            {it.margemCalculada}%
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {s.itens?.length > 2 && (
                    <div className="text-xs text-slate-400">+{s.itens.length - 2} produto(s)...</div>
                  )}
                </div>

                {s.motivo && (
                  <div className="mt-2 text-xs text-slate-500 italic">"{s.motivo}"</div>
                )}
              </div>

              {/* Rodapé: ações */}
              <div className="border-t border-slate-100 px-4 py-2.5 flex items-center justify-between">
                <Link href={`/solicitacoes/${s._id}`} className="text-xs text-brand font-medium">
                  Ver detalhes →
                </Link>

                {podeDecidir(s) && (
                  decidindo === s._id ? (
                    <div className="flex items-center gap-2">
                      <input
                        className="input text-xs py-1 px-2 w-32"
                        placeholder="Motivo (opcional)"
                        value={motivoDecisao}
                        onChange={(e) => setMotivoDecisao(e.target.value)}
                      />
                      <button onClick={() => handleDecisao(s._id, "aprovado")} className="text-xs bg-emerald-600 text-white px-3 py-1 rounded-lg font-semibold">
                        ✓
                      </button>
                      <button onClick={() => handleDecisao(s._id, "rejeitado")} className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg font-semibold">
                        ✕
                      </button>
                      <button onClick={() => setDecidindo(null)} className="text-xs text-slate-400">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDecidindo(s._id)}
                      className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg font-semibold"
                    >
                      Decidir
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SolicitacoesPage() {
  const [lista, setLista] = useState([]);
  const [status, setStatus] = useState("");
  const [tipo, setTipo] = useState("");
  const [loading, setLoading] = useState(true);

  async function carregar() {
    setLoading(true);
    try {
      const params = {};
      if (status) params.status = status;
      if (tipo) params.tipo = tipo;
      const { data } = await api.get("/solicitacoes", { params });
      setLista(data.solicitacoes || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Solicitacoes</h1>
      <p className="text-slate-500 mb-6">Acompanhe rebaixas e ofertas internas</p>

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="aprovada">Aprovada</option>
            <option value="rejeitada">Rejeitada</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            <option value="rebaixa">Rebaixa</option>
            <option value="oferta_interna">Oferta interna</option>
          </select>
        </div>
        <button className="btn-primary" onClick={carregar}>Filtrar</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Itens</th>
              <th className="px-3 py-2">Supervisor</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Carregando...</td></tr>
            ) : lista.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Nenhuma solicitacao</td></tr>
            ) : (
              lista.map((s) => (
                <tr key={s._id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 text-xs text-slate-600">{fmtDataHora(s.createdAt)}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{s.cliente}</div>
                    <div className="text-xs text-slate-500">Cod {s.clienteCodigo}</div>
                  </td>
                  <td className="px-3 py-2 capitalize">{s.tipo.replace("_", " ")}</td>
                  <td className="px-3 py-2">{s.itens?.length || 0}</td>
                  <td className="px-3 py-2">{s.supervisorNome}</td>
                  <td className="px-3 py-2">
                    <span className={`badge border ${STATUS[s.status]}`}>{s.status}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/solicitacoes/${s._id}`} className="text-brand hover:underline text-sm">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
