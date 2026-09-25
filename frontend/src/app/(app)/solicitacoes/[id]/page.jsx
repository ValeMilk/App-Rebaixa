"use client";
import { useTituloDaPagina } from "@/components/PageTitleContext";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtData, fmtDataHora, formatarRede } from "@/lib/utils";
import { TONE, toneMargem } from "@/lib/tones";
import Badge from "@/components/ui/Badge";

const STATUS_LABEL = {
  pendente_supervisor: { l: "Ag. Supervisor", tone: "warning" },
  aprovado_supervisor: { l: "Ag. Diretoria",  tone: "info" },
  aprovado_final:      { l: "Aprovado",       tone: "success" },
  rejeitado:           { l: "Rejeitado",      tone: "danger" },
  cancelado:           { l: "Cancelado",      tone: "neutral" },
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
  const t = TONE[toneMargem(m)];
  return `${t.bg} ${t.text}`;
}

function CampoValor({ label, valor, sub, destaque }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${destaque ? "border-secondary/30 bg-secondary/5" : "border-neutral-200 bg-white"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`text-sm font-bold mt-0.5 ${destaque ? "text-secondary" : "text-neutral-900"}`}>{valor}</div>
      {sub && <div className="text-[10px] text-neutral-500 mt-0.5">{sub}</div>}
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
  useTituloDaPagina(s ? `${s.tipo === "oferta_interna" ? "Oferta interna" : "Rebaixa"} · ${s.cliente}` : "Solicitação", s ? `Cód. ${s.clienteCodigo}` : undefined);

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

  if (loading) return <p className="text-neutral-500">Carregando...</p>;
  if (!s) return <p className="text-neutral-500">Solicitacao nao encontrada.</p>;

  const podeDecidir =
    (user?.role === "supervisor" && s.status === "pendente_supervisor" &&
      (s.podeDecidirSupervisor !== undefined ? !!s.podeDecidirSupervisor : true)) ||
    ((user?.role === "diretoria" || user?.role === "admin") &&
      (s.status === "pendente_supervisor" || s.status === "aprovado_supervisor"));

  const podeCancelar = ["pendente_supervisor", "aprovado_supervisor"].includes(s.status);
  const statusInfo = STATUS_LABEL[s.status] || { l: s.status, tone: "neutral" };

  return (
    <div>
      <button onClick={() => router.back()} className="btn-ghost mb-3">← Voltar</button>

      <div className="surface p-6 mb-4">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-neutral-800 capitalize">
              {s.tipo.replace("_", " ")} - {s.cliente}
            </h2>
            <p className="text-neutral-500">Cod {s.clienteCodigo} • criada em {fmtDataHora(s.createdAt)}</p>
            {formatarRede(s) && <p className="text-info text-sm font-semibold">Rede: {formatarRede(s)}</p>}
            <p className="text-neutral-500 text-sm">Criado por: {s.criadoPorNome} ({s.criadoPorCodigo})</p>
            {s.supervisorNome && <p className="text-neutral-500 text-sm">Supervisor: {s.supervisorNome} ({s.supervisorCodigo})</p>}
          </div>
          <Badge tone={statusInfo.tone} dot className="self-start">{statusInfo.l}</Badge>
        </div>

        {s.motivo && (<p className="mt-4 text-sm"><strong>Motivo:</strong> {s.motivo}</p>)}
        {s.observacoes && (<p className="mt-1 text-sm"><strong>Observacoes:</strong> {s.observacoes}</p>)}

        {(s.inicioAcao || s.fimAcao) && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-neutral-50 border border-neutral-200 px-3 py-2 text-xs">
            <span className="font-bold uppercase tracking-wide text-neutral-500">Período da ação</span>
            <span className="font-semibold text-neutral-800">
              {s.inicioAcao ? fmtData(s.inicioAcao) : "—"} até {s.fimAcao ? fmtData(s.fimAcao) : "—"}
            </span>
          </div>
        )}
      </div>

      {/* Itens da solicitacao com detalhes de preco/margem */}
      <div className="space-y-4 mb-4">
        {s.itens.map((i, idx) => (
          <div key={idx} className="surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-neutral-900 text-base">{i.produto}</div>
                {i.produtoCodigo && <div className="text-xs text-neutral-500 mt-0.5">Cod {i.produtoCodigo}</div>}
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded-lg bg-neutral-100 text-neutral-700 font-medium">{i.quantidade} un</span>
                {i.dataValidade && <span className="px-2 py-1 rounded-lg bg-neutral-100 text-neutral-700 font-medium">Val. {fmtData(i.dataValidade)}</span>}
                {i.diasParaVencer != null && (
                  <span className={`px-2 py-1 rounded-lg font-medium ${i.diasParaVencer <= 15 ? "bg-danger/15 text-danger" : i.diasParaVencer <= 30 ? "bg-warning/15 text-warning" : "bg-success/15 text-success"}`}>
                    {i.diasParaVencer} dias
                  </span>
                )}
              </div>
            </div>

            {/* Bloco: Visao do vendedor */}
            <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-400 mb-1.5">Análise do vendedor</div>
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
        <div className="surface p-4 mb-4">
          <label className="block text-xs font-medium text-neutral-600 mb-1">Comentario da decisao</label>
          <textarea className="input" rows={2} value={motivoDecisao} onChange={(e) => setMotivoDecisao(e.target.value)} />
          <div className="mt-3 flex gap-2">
            <button onClick={() => decidir("aprovado")} className="btn-primary">Aprovar</button>
            <button onClick={() => decidir("rejeitado")} className="btn-secondary border-danger text-danger hover:bg-danger/10">Rejeitar</button>
          </div>
        </div>
      )}

      {podeCancelar && (
        <button onClick={cancelar} className="btn-ghost text-danger">Cancelar solicitacao</button>
      )}

      <div className="surface p-4 mt-6">
        <h2 className="font-semibold mb-3">Historico</h2>
        <ul className="space-y-2 text-sm">
          {s.historico?.map((h, i) => (
            <li key={i} className="flex justify-between gap-3 border-b border-neutral-100 pb-2 last:border-0">
              <span>
                <strong className="capitalize">{h.acao}</strong> por {h.porNome} ({h.porRole})
                {h.comentario ? ` - ${h.comentario}` : ""}
              </span>
              <span className="text-neutral-500 text-xs">{fmtDataHora(h.em)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}