"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtData, fmtDataHora } from "@/lib/utils";

const STATUS_LABEL = {
  pendente_supervisor: { l: "Ag. Supervisor", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  aprovado_supervisor: { l: "Ag. Diretoria",  cls: "bg-blue-50 text-blue-700 border-blue-200" },
  aprovado_final:      { l: "Aprovado",       cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejeitado:           { l: "Rejeitado",      cls: "bg-red-50 text-red-700 border-red-200" },
  cancelado:           { l: "Cancelado",      cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

function fmtBRL(v) {
  if (v == null || isNaN(v)) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtPct(v) {
  if (v == null || isNaN(v)) return "—";
  return `${Number(v).toFixed(1)}%`;
}
function corMargem(m) {
  if (m == null) return "bg-slate-100 text-slate-600";
  if (m >= 20) return "bg-emerald-100 text-emerald-700";
  if (m >= 10) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function CampoValor({ label, valor, sub, destaque }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${destaque ? "border-brand/30 bg-brand/5" : "border-slate-200 bg-white"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-sm font-bold mt-0.5 ${destaque ? "text-brand" : "text-slate-900"}`}>{valor}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

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

  useEffect(() => { if (id) carregar(); /* eslint-disable-next-line */ }, [id]);

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

  const podeDecidir =
    (user?.role === "supervisor" && s.status === "pendente_supervisor") ||
    ((user?.role === "diretoria" || user?.role === "admin") &&
      (s.status === "pendente_supervisor" || s.status === "aprovado_supervisor"));

  const podeCancelar = ["pendente_supervisor", "aprovado_supervisor"].includes(s.status);
  const statusInfo = STATUS_LABEL[s.status] || { l: s.status, cls: "bg-slate-100 text-slate-600 border-slate-200" };

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
            {s.redeSubrede && <p className="text-blue-600 text-sm font-semibold">Rede: {s.redeSubrede}</p>}
            <p className="text-slate-500 text-sm">Criado por: {s.criadoPorNome} ({s.criadoPorCodigo})</p>
            {s.supervisorNome && <p className="text-slate-500 text-sm">Supervisor: {s.supervisorNome} ({s.supervisorCodigo})</p>}
          </div>
          <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border self-start ${statusInfo.cls}`}>
            {statusInfo.l}
          </span>
        </div>

        {s.motivo && (<p className="mt-4 text-sm"><strong>Motivo:</strong> {s.motivo}</p>)}
        {s.observacoes && (<p className="mt-1 text-sm"><strong>Observacoes:</strong> {s.observacoes}</p>)}
      </div>

      {/* Itens da solicitacao com detalhes de preco/margem */}
      <div className="space-y-4 mb-4">
        {s.itens.map((i, idx) => (
          <div key={idx} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-900 text-base">{i.produto}</div>
                {i.produtoCodigo && <div className="text-xs text-slate-500 mt-0.5">Cod {i.produtoCodigo}</div>}
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium">{i.quantidade} un</span>
                {i.dataValidade && <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium">Val. {fmtData(i.dataValidade)}</span>}
                {i.diasParaVencer != null && (
                  <span className={`px-2 py-1 rounded-lg font-medium ${i.diasParaVencer <= 15 ? "bg-red-100 text-red-700" : i.diasParaVencer <= 30 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {i.diasParaVencer} dias
                  </span>
                )}
              </div>
            </div>

            {/* Bloco: Visao do vendedor */}
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Análise do vendedor</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
              <CampoValor
                label="Última compra"
                valor={fmtBRL(i.precoUltimaCompra ?? i.precoTabela)}
                sub={i.dataUltimaCompra ? fmtData(i.dataUltimaCompra) : "preço tabela"}
              />
              <CampoValor
                label="Preço PDV"
                valor={fmtBRL(i.precoPDV)}
                sub={i.margemPDV != null ? (
                  <span className={`inline-block px-1.5 py-0.5 rounded font-bold ${corMargem(i.margemPDV)}`}>
                    Margem {fmtPct(i.margemPDV)}
                  </span>
                ) : null}
              />
              <CampoValor
                label="Preço oferta"
                valor={fmtBRL(i.precoOferta)}
                sub={i.margemOferta != null ? (
                  <span className={`inline-block px-1.5 py-0.5 rounded font-bold ${corMargem(i.margemOferta)}`}>
                    Margem {fmtPct(i.margemOferta)}
                  </span>
                ) : null}
                destaque
              />
              <CampoValor
                label="Sellout"
                valor={i.sellout != null ? Number(i.sellout).toLocaleString("pt-BR") : "—"}
                sub="unidades"
              />
              {i.descontoPercentual != null && (
                <CampoValor
                  label="Desconto"
                  valor={fmtPct(i.descontoPercentual)}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {podeDecidir && (
        <div className="card p-4 mb-4">
          <label className="block text-xs font-medium text-slate-600 mb-1">Comentario da decisao</label>
          <textarea className="input" rows={2} value={motivoDecisao} onChange={(e) => setMotivoDecisao(e.target.value)} />
          <div className="mt-3 flex gap-2">
            <button onClick={() => decidir("aprovado")} className="btn-primary">Aprovar</button>
            <button onClick={() => decidir("rejeitado")} className="btn-secondary border-red-500 text-red-600 hover:bg-red-50">Rejeitar</button>
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