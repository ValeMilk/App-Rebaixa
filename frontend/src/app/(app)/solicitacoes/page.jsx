"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { fmtDataHora } from "@/lib/utils";

const STATUS = {
  pendente: "bg-amber-100 text-amber-800 border-amber-200",
  aprovada: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejeitada: "bg-red-100 text-red-800 border-red-200",
  cancelada: "bg-slate-100 text-slate-700 border-slate-200",
};

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
