"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTituloDaPagina } from "@/components/PageTitleContext";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { pode } from "@/lib/permissoes";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import StatTile from "@/components/ui/StatTile";
import { IcoBell, IcoCheck } from "@/components/Icons";
import RebaixaModal from "@/components/RebaixaModal";
import PendenciaCard from "@/components/pendencias/PendenciaCard";
import JaResolviDialog from "@/components/pendencias/JaResolviDialog";
import AtivarPushBanner from "@/components/pendencias/AtivarPushBanner";

const msgErro = (err, padrao) => err?.response?.data?.error || padrao;

function diasAte(d) {
  if (!d) return null;
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const alvo = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / 86400000);
}

// Item no formato que o RebaixaModal espera
function itemDaPendencia(p) {
  return {
    _id: null,
    cliente: p.cliente,
    clienteCodigo: p.clienteCodigo,
    codigoRede: p.codigoRede,
    redeSubrede: p.redeSubrede,
    subrede: null,
    produto: p.produto,
    produtoCodigo: p.produtoCodigo,
    quantidade: p.quantidade,
    dataValidade: p.dataValidade,
    diasParaVencer: diasAte(p.dataValidade),
    precoTabela: null,
    statusShelf: p.evento,
  };
}

export default function PendenciasPage() {
  useTituloDaPagina("Pendências", "Contagens em giro, rebaixa e ruptura nas lojas da sua carteira");
  const { user } = useAuth();
  const podeSolicitar = pode(user, "solicitacoes.criar");

  const [filtro, setFiltro] = useState("abertas"); // "abertas" | "todas"
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");
  const [novas, setNovas] = useState(() => new Set()); // nao vistas quando a tela abriu
  const [ocupadoId, setOcupadoId] = useState(null);
  const [modal, setModal] = useState(null); // { p, item, tipo }
  const [resolver, setResolver] = useState(null); // pendencia do "Ja resolvi"
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  function avisar(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }

  const carregar = useCallback(async (f) => {
    setErro("");
    try {
      const { data } = await api.get("/pendencias", { params: { abertas: f === "abertas" ? 1 : 0 } });
      const itens = data.pendencias || [];
      setLista(itens);
      // Marca como vistas as que aparecem (mantem "Nova" na tela ate recarregar)
      const naoVistas = itens.filter((p) => p.minha && !p.minha.vistaEm).map((p) => p._id);
      setNovas(new Set(naoVistas));
      if (naoVistas.length) api.post("/pendencias/vistas", { ids: naoVistas }).catch(() => {});
    } catch (err) {
      setErro(msgErro(err, "Não foi possível carregar as pendências."));
      setLista([]);
    }
  }, []);

  useEffect(() => {
    setLista(null);
    carregar(filtro);
  }, [filtro, carregar]);

  const resumo = useMemo(() => {
    const l = lista || [];
    return {
      abertas: l.filter((p) => p.aberta).length,
      novas: novas.size,
      rebaixa: l.filter((p) => p.aberta && p.evento === "rebaixa").length,
      ruptura: l.filter((p) => p.aberta && p.evento === "ruptura").length,
    };
  }, [lista, novas]);

  async function registrar(p, tipo, motivo) {
    setOcupadoId(p._id);
    try {
      const { data } = await api.post(`/pendencias/${p._id}/acao`, { tipo, motivo });
      avisar(tipo === "pedido_feito" ? "Pedido marcado como feito." : "Pendência resolvida.");
      setResolver(null);
      // Reflete a acao nas demais pendencias abertas da mesma loja+produto
      setLista((l) => (l || []).map((x) => (x.clienteCodigo === p.clienteCodigo && x.produtoCodigo === p.produtoCodigo && x.aberta ? { ...x, acao: data.pendencia.acao, aberta: false } : x)));
    } catch (err) {
      if (tipo === "ja_resolvi") throw err;
      avisar(msgErro(err, "Não foi possível registrar a ação."));
    } finally {
      setOcupadoId(null);
    }
  }

  function abrirSolicitacao(p) {
    setModal({ p, item: itemDaPendencia(p), tipo: p.evento === "giro" ? "oferta_interna" : "rebaixa" });
  }

  function solicitacaoEnviada() {
    const p = modal?.p;
    setModal(null);
    avisar("Solicitação enviada. A pendência ficou com ação.");
    // O backend marca a acao ao criar a solicitacao; recarrega para mostrar
    if (p) carregar(filtro);
  }

  const carregando = lista === null;

  return (
    <div className="flex flex-col gap-5">
      <AtivarPushBanner />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Abertas" valor={carregando ? "…" : resumo.abertas} tone={resumo.abertas ? "secondary" : "neutral"} />
        <StatTile label="Novas" valor={carregando ? "…" : resumo.novas} tone={resumo.novas ? "info" : "neutral"} destaque={resumo.novas > 0} />
        <StatTile label="Em rebaixa" valor={carregando ? "…" : resumo.rebaixa} tone={resumo.rebaixa ? "danger" : "neutral"} />
        <StatTile label="Em ruptura" valor={carregando ? "…" : resumo.ruptura} tone={resumo.ruptura ? "danger" : "neutral"} />
      </div>

      <div className="flex items-center gap-2" role="group" aria-label="Filtro">
        {[["abertas", "Abertas"], ["todas", "Todas"]].map(([v, rotulo]) => (
          <button key={v} type="button" aria-pressed={filtro === v} onClick={() => setFiltro(v)} className={`chip ${filtro === v ? "chip-active" : ""}`}>
            {rotulo}
          </button>
        ))}
        {!carregando && <span className="ml-auto text-xs text-neutral-500">{lista.length} {lista.length === 1 ? "pendência" : "pendências"}</span>}
      </div>

      {erro && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}

      {carregando ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : lista.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={filtro === "abertas" ? IcoCheck : IcoBell}
            titulo={filtro === "abertas" ? "Nenhuma pendência aberta" : "Nenhuma pendência"}
            descricao={filtro === "abertas" ? "Quando uma contagem entrar em giro, rebaixa ou ruptura numa loja sua, ela aparece aqui." : "Ainda não chegou nenhuma pendência para você."}
          />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {lista.map((p) => (
            <PendenciaCard
              key={p._id}
              p={p}
              user={user}
              nova={novas.has(p._id)}
              podeSolicitar={podeSolicitar}
              ocupado={ocupadoId === p._id}
              onSolicitar={abrirSolicitacao}
              onPedidoFeito={(x) => registrar(x, "pedido_feito")}
              onJaResolvi={setResolver}
            />
          ))}
        </div>
      )}

      {modal && <RebaixaModal item={modal.item} tipo={modal.tipo} onClose={() => setModal(null)} onEnviado={solicitacaoEnviada} />}

      {resolver && <JaResolviDialog pendencia={resolver} onClose={() => setResolver(null)} onConfirmar={(motivo) => registrar(resolver, "ja_resolvi", motivo)} />}

      {toast && (
        <div role="status" className="fixed bottom-20 left-1/2 z-40 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl bg-neutral-900 px-4 py-2.5 text-sm text-white shadow-float animate-slide-up lg:bottom-6">
          {toast}
        </div>
      )}
    </div>
  );
}
