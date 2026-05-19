"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { fmtDataHora } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { IcoClipboard, IcoChevronRight, IcoChevronDown, IcoCheck, IcoX, IcoSync, IcoClock, IcoUser, IcoAlert, IcoUsers, IcoStore } from "@/components/Icons";

const STATUS = {
  pendente_supervisor: { label: "Ag. Sup.",   bg: "bg-amber-50",   text: "text-amber-700",  border: "border-amber-200",   dot: "bg-amber-500" },
  aprovado_supervisor: { label: "Ag. Dir.",   bg: "bg-blue-50",    text: "text-blue-700",   border: "border-blue-200",    dot: "bg-blue-500" },
  aprovado_final:      { label: "Aprovado",   bg: "bg-emerald-50", text: "text-emerald-700",border: "border-emerald-200", dot: "bg-emerald-500" },
  rejeitado:           { label: "Rejeitado",  bg: "bg-red-50",     text: "text-red-700",    border: "border-red-200",     dot: "bg-red-500" },
  cancelado:           { label: "Cancelado",  bg: "bg-slate-100",  text: "text-slate-600",  border: "border-slate-200",   dot: "bg-slate-400" },
};

function StatusBadge({ s }) {
  const st = STATUS[s] || { label: s, bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200", dot: "bg-slate-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${st.bg} ${st.text} ${st.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
      {st.label}
    </span>
  );
}

function fmtBRL(v) {
  if (v == null) return null;
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Card individual (loja solo)
function SolCard({ s, podeDecidir, decidindo, setDecidindo, motivoDecisao, setMotivoDecisao, onDecisao }) {
  const pode = podeDecidir(s);
  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition ${pode ? "border-amber-200 ring-1 ring-amber-100" : "border-slate-200"}`}>
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-900 truncate">{s.cliente}</div>
            <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="inline-flex items-center gap-1"><IcoUser className="w-3 h-3" />{s.criadoPorNome || "—"}</span>
              <span className="inline-flex items-center gap-1"><IcoClock className="w-3 h-3" />{fmtDataHora(s.createdAt)}</span>
            </div>
          </div>
          <StatusBadge s={s.status} />
        </div>
        <div className="space-y-1.5 mt-2">
          {s.itens?.slice(0, 2).map((it, i) => (
            <div key={i} className="flex items-center justify-between text-sm gap-2">
              <span className="text-slate-700 truncate flex-1">{it.produto}</span>
              <div className="flex gap-2 items-center shrink-0">
                {it.precoOferta && <span className="text-brand font-bold text-xs">{fmtBRL(it.precoOferta)}</span>}
                {it.margemOferta != null && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${it.margemOferta >= 20 ? "bg-emerald-100 text-emerald-700" : it.margemOferta >= 10 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                    {it.margemOferta?.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          ))}
          {s.itens?.length > 2 && <div className="text-xs text-slate-400">+{s.itens.length - 2} produto(s)…</div>}
        </div>
        {s.motivo && <div className="mt-2.5 text-xs text-slate-500 italic bg-slate-50 rounded-lg px-2.5 py-1.5">"{s.motivo}"</div>}
      </div>
      <div className="border-t border-slate-100 px-4 py-2.5 flex items-center justify-between gap-2 bg-slate-50/50">
        <Link href={`/solicitacoes/${s._id}`} className="inline-flex items-center gap-1 text-xs text-brand font-semibold active:scale-95 transition">
          Ver detalhes <IcoChevronRight className="w-3.5 h-3.5" />
        </Link>
        {pode && (
          decidindo === s._id ? (
            <div className="flex items-center gap-1.5">
              <input className="input text-xs py-1 px-2 w-28" placeholder="Motivo" value={motivoDecisao} onChange={(e) => setMotivoDecisao(e.target.value)} />
              <button onClick={() => onDecisao(s._id, "aprovado")} aria-label="Aprovar" className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center active:scale-95 transition"><IcoCheck className="w-4 h-4" /></button>
              <button onClick={() => onDecisao(s._id, "rejeitado")} aria-label="Rejeitar" className="h-8 w-8 bg-red-500 hover:bg-red-600 text-white rounded-lg flex items-center justify-center active:scale-95 transition"><IcoX className="w-4 h-4" /></button>
              <button onClick={() => { setDecidindo(null); setMotivoDecisao(""); }} aria-label="Cancelar" className="h-8 w-8 text-slate-400 hover:bg-slate-100 rounded-lg flex items-center justify-center"><IcoX className="w-4 h-4" /></button>
            </div>
          ) : (
            <button onClick={() => setDecidindo(s._id)} className="inline-flex items-center gap-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg font-semibold active:scale-95 transition shadow-sm">
              <IcoCheck className="w-3.5 h-3.5" /> Decidir
            </button>
          )
        )}
      </div>
    </div>
  );
}

// Card de produto dentro de uma rede (sem header de rede — usado dentro de RedeCard)
function ProdutoGrupoCard({ prodGrupo, redeKey, podeDecidir, decidindo, setDecidindo, motivoDecisao, setMotivoDecisao, onDecisao, onDecisaoGrupo }) {
  const [expanded, setExpanded] = useState(false);
  const { produto, sols } = prodGrupo;
  const idGrupo = `${redeKey}__${produto}`;

  const ordemStatus = { pendente_supervisor: 4, aprovado_supervisor: 3, aprovado_final: 2, rejeitado: 1, cancelado: 0 };
  const statusRep = sols.reduce((a, s) => (ordemStatus[s.status] ?? 0) > (ordemStatus[a] ?? 0) ? s.status : a, sols[0].status);
  const podeDecidirAlgum = sols.some(podeDecidir);
  const qtdTotal = sols.reduce((acc, s) => acc + (s.itens?.[0]?.quantidade || 0), 0);
  const precoOferta = sols[0]?.itens?.[0]?.precoOferta;
  const margemOferta = sols[0]?.itens?.[0]?.margemOferta;
  const motivo = sols[0]?.motivo;
  const criadoPorNome = sols[0]?.criadoPorNome;
  const criadoEm = sols[0]?.createdAt;

  return (
    <div className={`rounded-xl border overflow-hidden ${podeDecidirAlgum ? "border-amber-200 bg-amber-50/20" : "border-slate-200 bg-white"}`}>
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-900 text-sm leading-snug">{produto}</div>
            <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="inline-flex items-center gap-1"><IcoStore className="w-3 h-3" />{sols.length} loja{sols.length !== 1 ? "s" : ""} · {qtdTotal} un</span>
              <span className="inline-flex items-center gap-1"><IcoUser className="w-3 h-3" />{criadoPorNome || "—"}</span>
              <span className="inline-flex items-center gap-1"><IcoClock className="w-3 h-3" />{fmtDataHora(criadoEm)}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <StatusBadge s={statusRep} />
            {precoOferta != null && (
              <div className="flex items-center gap-1.5">
                <span className="text-brand font-bold text-sm">{fmtBRL(precoOferta)}</span>
                {margemOferta != null && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${margemOferta >= 20 ? "bg-emerald-100 text-emerald-700" : margemOferta >= 10 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                    {margemOferta?.toFixed(1)}%
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {motivo && <div className="mt-2 text-xs text-slate-500 italic bg-slate-50 rounded-lg px-2.5 py-1.5">"{motivo}"</div>}
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full border-t border-slate-100 px-3 py-2 flex items-center justify-between text-xs text-slate-500 hover:bg-slate-50 transition"
      >
        <span className="font-semibold">{expanded ? "Ocultar lojas" : `Ver ${sols.length} lojas`}</span>
        <IcoChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-2.5 pb-2.5 pt-1.5 space-y-1.5 bg-slate-50/50">
          {sols.map((s) => {
            const pode = podeDecidir(s);
            return (
              <div key={s._id} className={`bg-white rounded-xl border px-3 py-2.5 flex items-center justify-between gap-2 ${pode ? "border-amber-200" : "border-slate-200"}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{s.cliente}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex gap-2 flex-wrap">
                    <span>{s.itens?.[0]?.quantidade} un · {s.itens?.[0]?.diasParaVencer}d</span>
                    <StatusBadge s={s.status} />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Link href={`/solicitacoes/${s._id}`} className="text-[10px] text-brand font-semibold whitespace-nowrap">Ver</Link>
                  {pode && (
                    decidindo === s._id ? (
                      <>
                        <input className="input text-xs py-0.5 px-1.5 w-20" placeholder="Motivo" value={motivoDecisao} onChange={(e) => setMotivoDecisao(e.target.value)} />
                        <button onClick={() => onDecisao(s._id, "aprovado")} className="h-7 w-7 bg-emerald-600 text-white rounded-lg flex items-center justify-center"><IcoCheck className="w-3.5 h-3.5" /></button>
                        <button onClick={() => onDecisao(s._id, "rejeitado")} className="h-7 w-7 bg-red-500 text-white rounded-lg flex items-center justify-center"><IcoX className="w-3.5 h-3.5" /></button>
                        <button onClick={() => { setDecidindo(null); setMotivoDecisao(""); }} className="h-7 w-7 text-slate-400 rounded-lg flex items-center justify-center"><IcoX className="w-3.5 h-3.5" /></button>
                      </>
                    ) : (
                      <button onClick={() => setDecidindo(s._id)} className="text-[10px] bg-amber-500 text-white px-2 py-1 rounded-lg font-semibold whitespace-nowrap">Decidir</button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {podeDecidirAlgum && (
        <div className="border-t border-slate-100 px-3 py-2.5 flex items-center justify-between gap-2 bg-slate-50/50">
          <span className="text-xs text-slate-500 font-medium">{sols.filter(podeDecidir).length} aguardando decisão</span>
          {decidindo === idGrupo ? (
            <div className="flex items-center gap-1.5">
              <input className="input text-xs py-1 px-2 w-28" placeholder="Motivo" value={motivoDecisao} onChange={(e) => setMotivoDecisao(e.target.value)} />
              <button onClick={() => onDecisaoGrupo(sols.filter(podeDecidir).map((s) => s._id), "aprovado")} className="h-8 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center gap-1 text-xs font-semibold active:scale-95 transition">
                <IcoCheck className="w-3.5 h-3.5" /> Aprovar todas
              </button>
              <button onClick={() => onDecisaoGrupo(sols.filter(podeDecidir).map((s) => s._id), "rejeitado")} className="h-8 w-8 bg-red-500 hover:bg-red-600 text-white rounded-lg flex items-center justify-center active:scale-95 transition"><IcoX className="w-4 h-4" /></button>
              <button onClick={() => { setDecidindo(null); setMotivoDecisao(""); }} className="h-8 w-8 text-slate-400 hover:bg-slate-100 rounded-lg flex items-center justify-center"><IcoX className="w-4 h-4" /></button>
            </div>
          ) : (
            <button onClick={() => setDecidindo(idGrupo)} className="inline-flex items-center gap-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg font-semibold active:scale-95 transition shadow-sm">
              <IcoCheck className="w-3.5 h-3.5" /> Decidir todas ({sols.filter(podeDecidir).length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Card de rede (nível superior) — expande para mostrar os produtos
function RedeCard({ redeGrupo, podeDecidir, decidindo, setDecidindo, motivoDecisao, setMotivoDecisao, onDecisao, onDecisaoGrupo }) {
  const [expanded, setExpanded] = useState(false);
  const { redeNome, codigoRede, produtos } = redeGrupo;

  const totalLojas = produtos.reduce((t, p) => t + p.sols.length, 0);
  const totalPendentes = produtos.reduce((t, p) => t + p.sols.filter(podeDecidir).length, 0);
  const podeDecidirAlguma = totalPendentes > 0;

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition ${podeDecidirAlguma ? "border-amber-200 ring-1 ring-amber-100" : "border-slate-200"}`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 pt-3.5 pb-3 flex items-center justify-between gap-2 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <IcoUsers className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="text-sm font-bold text-blue-600 truncate">{redeNome}</span>
          </div>
          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span>{produtos.length} produto{produtos.length !== 1 ? "s" : ""}</span>
            <span>{totalLojas} loja{totalLojas !== 1 ? "s" : ""}</span>
            {podeDecidirAlguma && (
              <span className="text-amber-600 font-semibold">{totalPendentes} p/ decidir</span>
            )}
          </div>
        </div>
        <IcoChevronDown className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-3 pb-3 pt-2.5 space-y-2.5 bg-slate-50/30">
          {produtos.map((pg, i) => (
            <ProdutoGrupoCard
              key={`${codigoRede}__${pg.produto}__${i}`}
              prodGrupo={pg}
              redeKey={codigoRede}
              podeDecidir={podeDecidir}
              decidindo={decidindo}
              setDecidindo={setDecidindo}
              motivoDecisao={motivoDecisao}
              setMotivoDecisao={setMotivoDecisao}
              onDecisao={onDecisao}
              onDecisaoGrupo={onDecisaoGrupo}
            />
          ))}
        </div>
      )}
    </div>
  );
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

  async function handleDecisaoGrupo(ids, decisao) {
    try {
      await Promise.all(ids.map((id) => api.post(`/solicitacoes/${id}/decidir`, { decisao, motivoDecisao })));
      setDecidindo(null);
      setMotivoDecisao("");
      carregar();
    } catch (err) {
      alert(err.response?.data?.error || "Erro ao decidir");
    }
  }

  const pendentesAprovacao = lista.filter(podeDecidir).length;

  // Agrupar por rede (nível 1) → produto (nível 2)
  // Redes com apenas 1 solicitação total → exibe como solo
  const itensRender = useMemo(() => {
    const redesMap = new Map(); // codigoRede → { redeNome, codigoRede, produtosMap }
    const solosDirectos = [];

    for (const s of lista) {
      const produtoCodigo = s.itens?.[0]?.produtoCodigo || s.itens?.[0]?.produto;
      if (s.codigoRede && produtoCodigo) {
        if (!redesMap.has(s.codigoRede)) {
          redesMap.set(s.codigoRede, {
            redeNome: s.redeSubrede || s.codigoRede,
            codigoRede: s.codigoRede,
            produtosMap: new Map(),
          });
        }
        const rg = redesMap.get(s.codigoRede);
        if (!rg.produtosMap.has(produtoCodigo)) {
          rg.produtosMap.set(produtoCodigo, { produto: s.itens?.[0]?.produto, sols: [] });
        }
        rg.produtosMap.get(produtoCodigo).sols.push(s);
      } else {
        solosDirectos.push(s);
      }
    }

    const result = [];
    const solos = [...solosDirectos];

    for (const [key, rg] of redesMap) {
      const produtos = Array.from(rg.produtosMap.values());
      const totalSols = produtos.reduce((t, p) => t + p.sols.length, 0);
      if (totalSols <= 1) {
        if (produtos[0]?.sols[0]) solos.push(produtos[0].sols[0]);
      } else {
        result.push({ tipo: "rede", key, redeGrupo: { redeNome: rg.redeNome, codigoRede: rg.codigoRede, produtos } });
      }
    }

    for (const s of solos) result.push({ tipo: "solo", sol: s });

    return result;
  }, [lista]);

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

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 w-full" style={{ touchAction: "pan-x pan-y" }}>
        {FILTROS.map(({ v, l }) => (
          <button key={v} onClick={() => setFiltro(v)} className={`chip ${status === v ? "chip-active" : ""}`}>{l}</button>
        ))}
        <button onClick={() => carregar()} aria-label="Atualizar" className="chip"><IcoSync className="w-3.5 h-3.5" /></button>
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
          {itensRender.map((item) =>
            item.tipo === "rede" ? (
              <RedeCard
                key={item.key}
                redeGrupo={item.redeGrupo}
                podeDecidir={podeDecidir}
                decidindo={decidindo}
                setDecidindo={setDecidindo}
                motivoDecisao={motivoDecisao}
                setMotivoDecisao={setMotivoDecisao}
                onDecisao={handleDecisao}
                onDecisaoGrupo={handleDecisaoGrupo}
              />
            ) : (
              <SolCard
                key={item.sol._id}
                s={item.sol}
                podeDecidir={podeDecidir}
                decidindo={decidindo}
                setDecidindo={setDecidindo}
                motivoDecisao={motivoDecisao}
                setMotivoDecisao={setMotivoDecisao}
                onDecisao={handleDecisao}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}