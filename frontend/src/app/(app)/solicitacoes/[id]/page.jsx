"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtData, fmtDataHora } from "@/lib/utils";

export default function DetalheSolicitacao() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);
  const [motivoDecisao, setMotivoDecisao] = useState("");

  async function carregar() {
    setLoading(true);
    try {
      const { data } = await api.get(`/solicitacoes/${id}`);
      setS(data.solicitacao);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) carregar();
    // eslint-disable-next-line
  }, [id]);

  async function decidir(decisao) {
    if (!confirm(`Confirmar ${decisao}?`)) return;
    try {
      await api.post(`/solicitacoes/${id}/decidir`, { decisao, motivoDecisao });
      await carregar();
    } catch (err) {
      alert(err.response?.data?.error || "Erro");
    }
  }

  async function cancelar() {
    if (!confirm("Cancelar solicitacao?")) return;
    try {
      await api.post(`/solicitacoes/${id}/cancelar`);
      await carregar();
    } catch (err) {
      alert(err.response?.data?.error || "Erro");
    }
  }

  if (loading) return <p className="text-slate-500">Carregando...</p>;
  if (!s) return <p className="text-slate-500">Solicitacao nao encontrada.</p>;

  const podeDecidir = (user.role === "diretoria" || user.role === "admin") && s.status === "pendente";
  const podeCancelar = s.status === "pendente";

  return (
    <div>
      <button onClick={() => router.back()} className="btn-ghost mb-3">← Voltar</button>

      <div className="card p-6 mb-4">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 capitalize">
              {s.tipo.replace("_", " ")} - {s.cliente}
            </h1>
            <p className="text-slate-500">Cod {s.clienteCodigo} • criada em {fmtDataHora(s.createdAt)}</p>
            <p className="text-slate-500 text-sm">Supervisor: {s.supervisorNome} ({s.supervisorCodigo})</p>
          </div>
          <span className="badge bg-slate-100 text-slate-800 border border-slate-200 self-start uppercase">
            {s.status}
          </span>
        </div>

        {s.motivo && (
          <p className="mt-4 text-sm"><strong>Motivo:</strong> {s.motivo}</p>
        )}
        {s.observacoes && (
          <p className="mt-1 text-sm"><strong>Observacoes:</strong> {s.observacoes}</p>
        )}
      </div>

      <div className="card overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-3 py-2">Produto</th>
              <th className="px-3 py-2 text-right">Quantidade</th>
              <th className="px-3 py-2">Validade</th>
              <th className="px-3 py-2 text-right">Dias</th>
              <th className="px-3 py-2 text-right">Preco atual</th>
              <th className="px-3 py-2 text-right">Preco sugerido</th>
              <th className="px-3 py-2 text-right">Desconto %</th>
            </tr>
          </thead>
          <tbody>
            {s.itens.map((i, idx) => (
              <tr key={idx} className="border-t border-slate-100">
                <td className="px-3 py-2">{i.produto}</td>
                <td className="px-3 py-2 text-right">{i.quantidade}</td>
                <td className="px-3 py-2">{fmtData(i.dataValidade)}</td>
                <td className="px-3 py-2 text-right">{i.diasParaVencer ?? "-"}</td>
                <td className="px-3 py-2 text-right">{i.precoAtual ?? "-"}</td>
                <td className="px-3 py-2 text-right">{i.precoSugerido ?? "-"}</td>
                <td className="px-3 py-2 text-right">{i.descontoPercentual ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {podeDecidir && (
        <div className="card p-4 mb-4">
          <label className="block text-xs font-medium text-slate-600 mb-1">Comentario da decisao</label>
          <textarea
            className="input"
            rows={2}
            value={motivoDecisao}
            onChange={(e) => setMotivoDecisao(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <button onClick={() => decidir("aprovada")} className="btn-primary">Aprovar</button>
            <button
              onClick={() => decidir("rejeitada")}
              className="btn-secondary border-red-500 text-red-600 hover:bg-red-50"
            >
              Rejeitar
            </button>
          </div>
        </div>
      )}

      {podeCancelar && (
        <button onClick={cancelar} className="btn-ghost text-red-600">Cancelar solicitacao</button>
      )}

      <div className="card p-4 mt-6">
        <h2 className="font-semibold mb-3">Historico</h2>
        <ul className="space-y-2 text-sm">
          {s.historico?.map((h, i) => (
            <li key={i} className="flex justify-between gap-3 border-b border-slate-100 pb-2 last:border-0">
              <span>
                <strong className="capitalize">{h.acao}</strong> por {h.porNome} ({h.porRole})
                {h.comentario ? ` - ${h.comentario}` : ""}
              </span>
              <span className="text-slate-500 text-xs">{fmtDataHora(h.em)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
