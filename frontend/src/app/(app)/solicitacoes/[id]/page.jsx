"use client";
import { useTituloDaPagina } from "@/components/PageTitleContext";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { pode } from "@/lib/permissoes";
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

const ORIGEM_OFERTA = { rede: "Preço da rede", item: "Preço do item", vendedor: "Sugerido pelo vendedor" };
const ORIGEM_SELLOUT = { automatico: "automático (margem da rede)", sugerido_pdv: "sugerido (margem do PDV)", manual: "informado" };

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
function paraInputData(d) {
  if (!d) return "";
  const x = new Date(d);
  return isNaN(x) ? "" : x.toISOString().slice(0, 10);
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

/** Foto da solicitacao: a rota exige o token, entao carrega como blob e mostra por object URL. */
function FotoSolicitacao({ id }) {
  const [url, setUrl] = useState(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    let objeto = null;
    api.get(`/solicitacoes/${id}/foto`, { responseType: "blob" })
      .then(({ data }) => { objeto = URL.createObjectURL(data); setUrl(objeto); })
      .catch(() => setErro(true));
    return () => { if (objeto) URL.revokeObjectURL(objeto); };
  }, [id]);
  if (erro) return <p className="text-xs text-neutral-500">Foto indisponível.</p>;
  if (!url) return <p className="text-xs text-neutral-500">Carregando foto…</p>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <img src={url} alt="Foto da ação" className="max-h-72 rounded-xl border border-neutral-200 object-contain" />
    </a>
  );
}

export default function DetalheSolicitacao() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);
  const [motivoDecisao, setMotivoDecisao] = useState("");
  const [ajustar, setAjustar] = useState(false);
  const [ajuste, setAjuste] = useState({ precoOferta: "", sellout: "", inicioAcao: "", fimAcao: "" });
  useTituloDaPagina(s ? `${s.tipo === "oferta_interna" ? "Oferta interna" : "Rebaixa"} · ${s.cliente}` : "Solicitação", s ? `Cód. ${s.clienteCodigo}` : undefined);

  const veMargens = pode(user, "solicitacoes.ver_margens") && !s?.margensOcultas;

  async function carregar() {
    setLoading(true);
    try {
      const { data } = await api.get(`/solicitacoes/${id}`);
      setS(data.solicitacao);
      const it = data.solicitacao?.itens?.[0] || {};
      setAjuste({
        precoOferta: it.precoOferta != null ? String(it.precoOferta) : "",
        sellout: it.sellout != null ? String(it.sellout) : "",
        inicioAcao: paraInputData(data.solicitacao?.inicioAcao),
        fimAcao: paraInputData(data.solicitacao?.fimAcao),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (id) carregar(); /* eslint-disable-next-line */ }, [id]);

  async function decidir(decisao) {
    if (!confirm(`Confirmar ${decisao}?`)) return;
    try {
      const body = { decisao, motivoDecisao };
      if (decisao === "aprovado" && ajustar) body.ajustes = ajuste;
      await api.post(`/solicitacoes/${id}/decidir`, body);
      setAjustar(false);
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

  const podeDecidir = pode(user, "solicitacoes.decidir") && (
    (user?.role === "supervisor" && s.status === "pendente_supervisor" &&
      (s.podeDecidirSupervisor !== undefined ? !!s.podeDecidirSupervisor : true)) ||
    ((user?.role === "diretoria" || user?.role === "admin") &&
      (s.status === "pendente_supervisor" || s.status === "aprovado_supervisor")));

  const podeCancelar = ["pendente_supervisor", "aprovado_supervisor"].includes(s.status) && (String(s.criadoPorId) === user?.id || user?.role === "admin");
  const statusInfo = STATUS_LABEL[s.status] || { l: s.status, tone: "neutral" };
  const travado = s.itens?.some((i) => i.precoOfertaTravado);
  const ofertaBloqueada = travado && user?.role === "supervisor";

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
          <div className="flex flex-col items-end gap-1.5">
            <Badge tone={statusInfo.tone} dot className="self-start">{statusInfo.l}</Badge>
            {s.contraConcorrente && <Badge tone="warning" className="text-[10px] font-semibold">Contra concorrente</Badge>}
          </div>
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

        {/* v2.0: etapas exigidas */}
        {s.aprovacao && ["pendente_supervisor", "aprovado_supervisor"].includes(s.status) && (
          <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${s.aprovacao.exigeDiretoria ? "border-warning/30 bg-warning/10 text-warning" : "border-success/30 bg-success/10 text-success"}`}>
            <b>{s.aprovacao.exigeDiretoria ? "Exige diretoria" : "Aprovação do supervisor encerra o fluxo"}</b>
            {veMargens && s.aprovacao.motivoEscalada ? ` · ${s.aprovacao.motivoEscalada}` : ""}
          </div>
        )}

        {s.temFoto && (
          <div className="mt-4">
            <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-400 mb-1.5">Foto</div>
            <FotoSolicitacao id={id} />
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

            {/* Bloco: precos de referencia (v2.0) */}
            <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-400 mb-1.5">Referências</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
              <CampoValor
                label={i.precoTabelaRede != null ? "Tabela da rede" : "Tabela 70"}
                valor={fmtBRL(i.precoTabelaRede ?? i.precoTabela)}
                sub={i.precoTabelaRede != null && i.precoTabela ? `item ${fmtBRL(i.precoTabela)}` : null}
              />
              <CampoValor label="Preço mínimo" valor={fmtBRL(i.precoMinimo)} />
              <CampoValor
                label="Última compra"
                valor={fmtBRL(i.precoUltimaCompra)}
                sub={i.dataUltimaCompra ? fmtData(i.dataUltimaCompra) : "sem histórico"}
              />
              <CampoValor
                label="Desc. cliente"
                valor={i.descontoContratoPercentual != null ? fmtPct(i.descontoContratoPercentual) : "—"}
                sub={i.descontoContratoTipo || null}
              />
              <CampoValor
                label="Preço líquido"
                valor={fmtBRL(i.precoLiquido ?? i.precoUltimaCompraComDesconto)}
                sub="últ. compra − desconto"
                destaque
              />
            </div>

            {/* Bloco: negociacao */}
            <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-400 mb-1.5">Negociação</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
              <CampoValor
                label="Preço PDV"
                valor={fmtBRL(i.precoPDV)}
                sub={veMargens && i.margemPDV != null ? (
                  <span className={`inline-block px-1.5 py-0.5 rounded font-bold ${corMargem(i.margemPDV)}`}>
                    Margem {fmtPct(i.margemPDV)}
                  </span>
                ) : null}
              />
              <CampoValor
                label="Preço oferta"
                valor={fmtBRL(i.precoOferta)}
                sub={
                  <>
                    {i.precoOfertaOrigem && <span className="block">{ORIGEM_OFERTA[i.precoOfertaOrigem]}{i.precoOfertaTravado ? " 🔒" : ""}</span>}
                    {veMargens && i.margemOferta != null && (
                      <span className={`inline-block px-1.5 py-0.5 rounded font-bold ${corMargem(i.margemOferta)}`}>
                        Margem {fmtPct(i.margemOferta)}
                      </span>
                    )}
                  </>
                }
                destaque
              />
              {veMargens && (
                <>
                  <CampoValor
                    label="Sellout"
                    valor={fmtBRL(i.sellout)}
                    sub={i.selloutOrigem ? ORIGEM_SELLOUT[i.selloutOrigem] : "R$ por unidade"}
                  />
                  <CampoValor
                    label="Valemilk recebe"
                    valor={fmtBRL(i.valorRecebido)}
                    sub={i.precoPiso != null ? `piso ${fmtBRL(i.precoPiso)} (${i.pisoTipo === "p3" ? "P#3" : "mínimo"})` : "líquido − sellout"}
                  />
                  {(i.margemRedeAplicada != null || i.custoRedeAplicado != null) && (
                    <CampoValor
                      label="Rede"
                      valor={i.margemRedeAplicada != null ? `margem ${fmtPct(i.margemRedeAplicada)}` : "—"}
                      sub={i.custoRedeAplicado != null ? `custo ${fmtBRL(i.custoRedeAplicado)} (${i.custoRedeOrigem === "custo_medio" ? "custo médio" : "preço líquido"})` : null}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {podeDecidir && (
        <div className="surface p-4 mb-4 space-y-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700">
            <input type="checkbox" className="h-4 w-4" checked={ajustar} onChange={(e) => setAjustar(e.target.checked)} />
            Ajustar as condições antes de aprovar
          </label>
          {ajustar && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Preço da oferta (R$)</label>
                <input type="number" step="0.01" min="0" inputMode="decimal" className={`input ${ofertaBloqueada ? "bg-neutral-50" : ""}`} readOnly={ofertaBloqueada}
                  value={ajuste.precoOferta} onChange={(e) => setAjuste((a) => ({ ...a, precoOferta: e.target.value }))} />
                {ofertaBloqueada && <div className="mt-1 text-[10px] text-neutral-400">Preço da rede: só a diretoria altera.</div>}
              </div>
              {veMargens && (
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Sellout (R$)</label>
                  <input type="number" step="0.01" min="0" inputMode="decimal" className="input"
                    value={ajuste.sellout} onChange={(e) => setAjuste((a) => ({ ...a, sellout: e.target.value }))} />
                </div>
              )}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Início</label>
                <input type="date" className="input" value={ajuste.inicioAcao} onChange={(e) => setAjuste((a) => ({ ...a, inicioAcao: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Fim</label>
                <input type="date" className="input" value={ajuste.fimAcao} onChange={(e) => setAjuste((a) => ({ ...a, fimAcao: e.target.value }))} />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Comentario da decisao</label>
            <textarea className="input" rows={2} value={motivoDecisao} onChange={(e) => setMotivoDecisao(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => decidir("aprovado")} className="btn-primary">{ajustar ? "Ajustar e aprovar" : "Aprovar"}</button>
            <button onClick={() => decidir("rejeitado")} className="btn-secondary border-danger text-danger hover:bg-danger/10">Rejeitar</button>
          </div>
        </div>
      )}

      {podeCancelar && (
        <button onClick={cancelar} className="btn-ghost text-danger">Cancelar solicitacao</button>
      )}

      {s.ajustes?.length > 0 && (
        <div className="surface p-4 mt-6">
          <h2 className="font-semibold mb-3">Ajustes</h2>
          <ul className="space-y-2 text-sm">
            {s.ajustes.map((a, k) => (
              <li key={k} className="flex flex-wrap justify-between gap-3 border-b border-neutral-100 pb-2 last:border-0">
                <span>
                  <strong>{a.porNome}</strong> ({a.porRole}): oferta {fmtBRL(a.antes?.precoOferta)} → {fmtBRL(a.depois?.precoOferta)}
                  {veMargens && a.antes && "sellout" in a.antes ? ` · sellout ${fmtBRL(a.antes.sellout)} → ${fmtBRL(a.depois?.sellout)}` : ""}
                  {" · "}{fmtData(a.depois?.inicioAcao)} até {fmtData(a.depois?.fimAcao)}
                </span>
                <span className="text-neutral-500 text-xs">{fmtDataHora(a.em)}</span>
              </li>
            ))}
          </ul>
        </div>
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
