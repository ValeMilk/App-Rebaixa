"use client";
import { useTituloDaPagina } from "@/components/PageTitleContext";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { fmtDataHora } from "@/lib/utils";
import {
  STATUS_SHELF,
  STATUS_SHELF_MAP,
  PESO_SHELF,
  scoreShelf,
  indexarAtivas,
  acaoAtivaDe,
  normalizar,
} from "@/lib/estoque";
import Ranking from "@/components/dashboard/Ranking";
import TabelaVencimentos from "@/components/dashboard/TabelaVencimentos";
import RebaixaModal from "@/components/RebaixaModal";
import RebaixaLoteModal from "@/components/RebaixaLoteModal";
import Button from "@/components/ui/Button";
import StatTile from "@/components/ui/StatTile";

const HORIZONTES = [
  { value: "todos", label: "Todos" },
  { value: 15, label: "≤ 15 dias" },
  { value: 30, label: "≤ 30 dias" },
];
const PAGINA = 50;
const FILTROS_VAZIOS = { busca: "", rede: "", loja: "", produtoCodigo: "", venceAte: "" };
const PRINCIPAIS = new Set(["rebaixa", "giro"]);

const fmtNum = (n) => Number(n || 0).toLocaleString("pt-BR");
const chaveProduto = (it) => it.produtoCodigo || it.produto;

// ── Pequenos blocos visuais ──────────────────────────────────────────────────
function ChipsHorizonte({ value, onChange }) {
  return (
    <div className="flex items-center gap-1.5">
      {HORIZONTES.map((h) => (
        <button
          key={h.value}
          type="button"
          onClick={() => onChange(h.value)}
          className={`chip ${value === h.value ? "chip-active" : ""}`}
        >
          {h.label}
        </button>
      ))}
    </div>
  );
}

function BarraComposicao({ resumo }) {
  const total = resumo.totalItens;
  if (!total) return null;
  const segs = STATUS_SHELF.filter((s) => resumo.por[s.key].itens > 0);
  const pct = (s) => (resumo.por[s.key].itens / total) * 100;
  return (
    <div className="surface px-5 py-4 mb-5">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full gap-0.5">
        {segs.map((s) => (pct(s) < 0.5 ? null : (
          <div
            key={s.key}
            title={`${s.label}: ${pct(s).toFixed(1)}%`}
            className="h-full transition-all duration-500"
            style={{ width: `${pct(s)}%`, backgroundColor: s.hex }}
          />
        )))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {segs.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs text-neutral-500">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.hex }} />
            {s.label}
            <span className="font-semibold text-neutral-700 tabular-nums">{pct(s).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Spinner({ texto }) {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="h-7 w-7 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
        <p className="text-sm text-neutral-400">{texto}</p>
      </div>
    </div>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  useTituloDaPagina("Painel de Vencimentos", "Estoque em giro/rebaixa · fonte: relatório BI (Ativmob)");
  const router = useRouter();
  const { user, loading } = useAuth();

  const [itens, setItens] = useState([]);
  const [ativas, setAtivas] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [atualizado, setAtualizado] = useState(null);

  const [horizonte, setHorizonte] = useState("todos");
  const [ordemLojas, setOrdemLojas] = useState("unidades");
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [ordem, setOrdem] = useState({ campo: "dias", dir: 1 });
  const [visiveis, setVisiveis] = useState(PAGINA);

  const [formItem, setFormItem] = useState(null);
  const [selecionados, setSelecionados] = useState(() => new Set());
  const [loteAberto, setLoteAberto] = useState(false);
  const [toast, setToast] = useState("");
  const tabelaRef = useRef(null);

  // Proteger rota: apenas admin
  useEffect(() => {
    if (!loading && user && user.role !== "admin") {
      router.replace("/encartes");
    }
  }, [user, loading, router]);

  const carregarAtivas = useCallback(async () => {
    try {
      const { data } = await api.get("/solicitacoes/ativas");
      setAtivas(data.ativas || []);
    } catch {
      setAtivas([]);
    }
  }, []);

  const carregar = useCallback(async () => {
    setPageLoading(true);
    setErro("");
    try {
      const { data } = await api.get("/estoque", { params: { limit: 5000 } });
      setItens(data.itens || []);
      setAtualizado(new Date());
    } catch {
      setErro("Não foi possível carregar o estoque. Tente atualizar.");
    } finally {
      setPageLoading(false);
    }
    carregarAtivas();
  }, [carregarAtivas]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { setVisiveis(PAGINA); }, [filtros, ordem, horizonte]);
  // Descarta da selecao itens que sairam do estoque apos um recarregamento
  useEffect(() => {
    setSelecionados((s) => {
      if (s.size === 0) return s;
      const ids = new Set(itens.map((it) => it._id));
      const filtrado = new Set([...s].filter((id) => ids.has(id)));
      return filtrado.size === s.size ? s : filtrado;
    });
  }, [itens]);

  // ── Derivações ─────────────────────────────────────────────────────────────
  const itensBase = useMemo(
    () => itens.map((it) => {
      const dias = it.diasParaVencer ?? null;
      const status = STATUS_SHELF_MAP[it.statusShelf] ? it.statusShelf : "sem_shelf";
      const pct = it.pctShelf ?? null;
      return { ...it, diasParaVencer: dias, quantidade: Number(it.quantidade) || 0, status, pct };
    }),
    [itens]
  );

  const itensJanela = useMemo(
    () => (horizonte === "todos"
      ? itensBase
      : itensBase.filter((it) => it.diasParaVencer != null && it.diasParaVencer <= horizonte)),
    [itensBase, horizonte]
  );

  const resumo = useMemo(() => {
    const por = {};
    for (const s of STATUS_SHELF) por[s.key] = { itens: 0, unidades: 0 };
    let totalItens = 0;
    let totalUnidades = 0;
    for (const it of itensJanela) {
      por[it.status].itens += 1;
      por[it.status].unidades += it.quantidade;
      totalItens += 1;
      totalUnidades += it.quantidade;
    }
    return { por, totalItens, totalUnidades };
  }, [itensJanela]);

  const rankingLojas = useMemo(() => {
    const map = new Map();
    for (const it of itensJanela) {
      let l = map.get(it.clienteCodigo);
      if (!l) {
        l = {
          clienteCodigo: it.clienteCodigo,
          nome: it.cliente,
          codigoRede: it.codigoRede || "",
          redeSubrede: it.redeSubrede || "",
          itens: [],
          unidades: 0,
          rebaixa: 0,
          giro: 0,
          menorDias: null,
        };
        map.set(it.clienteCodigo, l);
      }
      l.itens.push(it);
      l.unidades += it.quantidade;
      if (it.status === "rebaixa") l.rebaixa += 1;
      else if (it.status === "giro") l.giro += 1;
      if (it.diasParaVencer != null && (l.menorDias == null || it.diasParaVencer < l.menorDias)) l.menorDias = it.diasParaVencer;
    }
    const dias = (l) => (l.menorDias == null ? Infinity : l.menorDias);
    const lista = [...map.values()].map(({ itens: its, ...l }) => ({ ...l, qtdItens: its.length, score: scoreShelf(its) }));
    lista.sort((a, b) => (ordemLojas === "unidades"
      ? (b.unidades - a.unidades) || (b.score - a.score) || (dias(a) - dias(b))
      : (b.score - a.score) || (b.unidades - a.unidades) || (dias(a) - dias(b))));
    return lista.slice(0, 10);
  }, [itensJanela, ordemLojas]);

  const rankingProdutos = useMemo(() => {
    const map = new Map();
    for (const it of itensJanela) {
      const k = chaveProduto(it);
      let p = map.get(k);
      if (!p) {
        p = { chave: k, nome: it.produto, unidades: 0, lojas: new Set(), rebaixa: 0, menorDias: null };
        map.set(k, p);
      }
      p.unidades += it.quantidade;
      p.lojas.add(it.clienteCodigo);
      if (it.status === "rebaixa") p.rebaixa += 1;
      if (it.diasParaVencer != null && (p.menorDias == null || it.diasParaVencer < p.menorDias)) p.menorDias = it.diasParaVencer;
    }
    const dias = (p) => (p.menorDias == null ? Infinity : p.menorDias);
    return [...map.values()]
      .map((p) => ({ ...p, lojas: p.lojas.size }))
      .sort((a, b) => (b.unidades - a.unidades) || (dias(a) - dias(b)))
      .slice(0, 10);
  }, [itensJanela]);

  const opcoesRede = useMemo(() => {
    const m = new Map();
    for (const it of itensJanela) if (it.codigoRede) m.set(it.codigoRede, it.redeSubrede || it.codigoRede);
    return [...m.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [itensJanela]);

  const opcoesLoja = useMemo(() => {
    const m = new Map();
    for (const it of itensJanela) {
      if (filtros.rede && it.codigoRede !== filtros.rede) continue;
      const o = m.get(it.clienteCodigo) || { value: it.clienteCodigo, label: it.cliente, n: 0 };
      o.n += 1;
      m.set(it.clienteCodigo, o);
    }
    return [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [itensJanela, filtros.rede]);

  const produtoFiltradoNome = useMemo(() => {
    if (!filtros.produtoCodigo) return "";
    const it = itensBase.find((x) => chaveProduto(x) === filtros.produtoCodigo);
    return it ? it.produto : filtros.produtoCodigo;
  }, [itensBase, filtros.produtoCodigo]);

  const linhasTodas = useMemo(() => {
    const busca = normalizar(filtros.busca).trim();
    const lista = itensJanela.filter((it) =>
      (!filtros.rede || it.codigoRede === filtros.rede) &&
      (!filtros.loja || it.clienteCodigo === filtros.loja) &&
      (!filtros.produtoCodigo || chaveProduto(it) === filtros.produtoCodigo) &&
      // dataValidade vem como ISO a meia-noite UTC; comparar o prefixo yyyy-mm-dd evita fuso
      (!filtros.venceAte || (it.dataValidade && String(it.dataValidade).slice(0, 10) <= filtros.venceAte)) &&
      (!busca || normalizar(`${it.cliente} ${it.produto}`).includes(busca))
    );

    const dir = ordem.dir;
    const str = (a, b) => (a || "").localeCompare(b || "", "pt-BR", { sensitivity: "base" });
    // null sempre por ultimo, independente da direcao
    const num = (a, b, d) => {
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return (a - b) * d;
    };
    const cmp = {
      cliente:    (a, b) => str(a.cliente, b.cliente) * dir,
      produto:    (a, b) => str(a.produto, b.produto) * dir,
      quantidade: (a, b) => num(a.quantidade, b.quantidade, dir),
      validade:   (a, b) => num(a.diasParaVencer, b.diasParaVencer, dir),
      dias:       (a, b) => num(a.diasParaVencer, b.diasParaVencer, dir),
      status:     (a, b) => (PESO_SHELF[b.status] - PESO_SHELF[a.status]) * dir,
    }[ordem.campo] || (() => 0);
    const desempate = (a, b) =>
      num(a.diasParaVencer, b.diasParaVencer, 1) || str(a.cliente, b.cliente) || str(a.produto, b.produto);

    lista.sort((a, b) => cmp(a, b) || desempate(a, b));
    return lista;
  }, [itensJanela, filtros, ordem]);

  const linhas = useMemo(() => linhasTodas.slice(0, visiveis), [linhasTodas, visiveis]);

  const ativasIdx = useMemo(() => indexarAtivas(ativas), [ativas]);
  const getAcaoAtiva = useCallback((it) => acaoAtivaDe(ativasIdx, it), [ativasIdx]);

  const itensSelecionados = useMemo(
    () => itensBase.filter((it) => selecionados.has(it._id)),
    [itensBase, selecionados]
  );
  const lojasSelecionadas = useMemo(
    () => new Set(itensSelecionados.map((it) => it.clienteCodigo)).size,
    [itensSelecionados]
  );

  // ── Interações ─────────────────────────────────────────────────────────────
  function irParaTabela() {
    requestAnimationFrame(() => tabelaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  function selecionarLoja(l) {
    setFiltros((f) => (f.loja === l.clienteCodigo
      ? { ...f, loja: "" }
      : { ...f, loja: l.clienteCodigo, rede: l.codigoRede || "", produtoCodigo: "" }));
    irParaTabela();
  }
  function selecionarProduto(p) {
    setFiltros((f) => ({ ...f, produtoCodigo: f.produtoCodigo === p.chave ? "" : p.chave }));
    irParaTabela();
  }
  function limpar() {
    setFiltros(FILTROS_VAZIOS);
  }
  function ordenar(campo) {
    setOrdem((o) => ({ campo, dir: o.campo === campo ? -o.dir : 1 }));
  }
  function enviado(n = 1) {
    setToast(n > 1 ? `${n} solicitações enviadas!` : "Solicitação enviada!");
    setTimeout(() => setToast(""), 3000);
    carregarAtivas();
  }
  function toggleItem(id) {
    setSelecionados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleVisiveis(ids, marcar) {
    setSelecionados((s) => {
      const n = new Set(s);
      for (const id of ids) { if (marcar) n.add(id); else n.delete(id); }
      return n;
    });
  }
  function limparSelecao() {
    setSelecionados(new Set());
  }

  const tilesExtras = STATUS_SHELF.filter((s) => !PRINCIPAIS.has(s.key) && resumo.por[s.key].itens > 0);
  const gridTiles = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" }[1 + PRINCIPAIS.size + tilesExtras.length] || "lg:grid-cols-5";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-end gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <ChipsHorizonte value={horizonte} onChange={setHorizonte} />
          {atualizado && <span className="hidden sm:block text-xs text-neutral-400">{fmtDataHora(atualizado)}</span>}
          <Button variant="outline" size="sm" onClick={carregar} disabled={pageLoading}>
            <svg className={`h-3.5 w-3.5 ${pageLoading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0 1 15-4.2M20 15a9 9 0 0 1-15 4.2" strokeLinecap="round" />
            </svg>
            Atualizar
          </Button>
        </div>
      </div>

      {pageLoading ? (
        <Spinner texto="Carregando dados..." />
      ) : erro ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{erro}</div>
      ) : (
        <>
          {/* Resumo */}
          <div className={`grid grid-cols-2 ${gridTiles} gap-3 mb-3`}>
            <StatTile label="Total" valor={fmtNum(resumo.totalItens)} apoio="itens monitorados" direita={`${fmtNum(resumo.totalUnidades)} un`} tone="primary" />
            {STATUS_SHELF.filter((s) => PRINCIPAIS.has(s.key)).map((s) => (
              <StatTile
                key={s.key}
                label={s.label}
                valor={fmtNum(resumo.por[s.key].itens)}
                apoio={s.faixa}
                direita={`${fmtNum(resumo.por[s.key].unidades)} un`}
                tone={s.tone}
                destaque={s.key === "rebaixa" && resumo.por.rebaixa.itens > 0}
              />
            ))}
            {tilesExtras.map((s) => (
              <StatTile key={s.key} label={s.label} valor={fmtNum(resumo.por[s.key].itens)} apoio={s.faixa} direita={`${fmtNum(resumo.por[s.key].unidades)} un`} tone={s.tone} />
            ))}
          </div>
          <BarraComposicao resumo={resumo} />

          {/* Macro: rankings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <Ranking
              titulo="Lojas mais críticas"
              subtitulo={ordemLojas === "unidades" ? "Por unidades a vencer" : "Por score de criticidade"}
              itens={rankingLojas}
              chave="clienteCodigo"
              selecionada={filtros.loja}
              onSelect={selecionarLoja}
              renderLabel={(l) => l.nome}
              renderSub={(l) => [
                l.redeSubrede || null,
                `${l.qtdItens} ${l.qtdItens === 1 ? "item" : "itens"}`,
                l.rebaixa ? `${l.rebaixa} rebaixa` : null,
                l.giro ? `${l.giro} giro` : null,
              ].filter(Boolean).join(" · ")}
              renderValor={(l) => (ordemLojas === "unidades" ? `${fmtNum(l.unidades)} un` : fmtNum(l.score))}
              renderValorSub={(l) => (ordemLojas === "unidades"
                ? (l.menorDias != null ? `vence em ${l.menorDias}d` : null)
                : `${fmtNum(l.unidades)} un`)}
              controle={(
                <select
                  value={ordemLojas}
                  onChange={(e) => setOrdemLojas(e.target.value)}
                  className="select h-8 w-auto py-0 text-xs"
                >
                  <option value="unidades">Unidades</option>
                  <option value="criticidade">Criticidade</option>
                </select>
              )}
              vazio="Nenhuma loja nesse horizonte."
            />
            <Ranking
              titulo="Produtos com mais unidades a vencer"
              subtitulo="Somando todas as lojas"
              itens={rankingProdutos}
              chave="chave"
              selecionada={filtros.produtoCodigo}
              onSelect={selecionarProduto}
              renderLabel={(p) => p.nome}
              renderSub={(p) => [
                `${p.lojas} ${p.lojas === 1 ? "loja" : "lojas"}`,
                p.menorDias != null ? `vence em ${p.menorDias}d` : null,
              ].filter(Boolean).join(" · ")}
              renderValor={(p) => `${fmtNum(p.unidades)} un`}
              renderValorSub={(p) => (p.rebaixa ? `${p.rebaixa} em rebaixa` : null)}
              vazio="Nenhum produto nesse horizonte."
            />
          </div>

          {/* Micro: tabela */}
          <div ref={tabelaRef} className="scroll-mt-20">
            <TabelaVencimentos
              linhas={linhas}
              totalLinhas={linhasTodas.length}
              filtros={filtros}
              setFiltros={setFiltros}
              opcoesRede={opcoesRede}
              opcoesLoja={opcoesLoja}
              produtoFiltradoNome={produtoFiltradoNome}
              ordem={ordem}
              onOrdenar={ordenar}
              onMais={() => setVisiveis((v) => v + PAGINA)}
              onLimpar={limpar}
              getAcaoAtiva={getAcaoAtiva}
              onSolicitar={setFormItem}
              selecionados={selecionados}
              onToggleItem={toggleItem}
              onToggleVisiveis={toggleVisiveis}
            />
          </div>
        </>
      )}

      {itensSelecionados.length > 0 && !loteAberto && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl bg-neutral-900 text-white shadow-2xl px-4 py-2.5 animate-slide-up max-w-[calc(100vw-2rem)]">
          <span className="text-sm whitespace-nowrap">
            <b>{itensSelecionados.length}</b> {itensSelecionados.length === 1 ? "item" : "itens"} · <b>{lojasSelecionadas}</b> {lojasSelecionadas === 1 ? "loja" : "lojas"}
          </span>
          <button type="button" onClick={limparSelecao} className="text-xs text-neutral-300 hover:text-white underline whitespace-nowrap">
            Limpar
          </button>
          <Button size="sm" onClick={() => setLoteAberto(true)}>Criar rebaixa</Button>
        </div>
      )}

      {formItem && (
        <RebaixaModal
          item={formItem}
          tipo={STATUS_SHELF_MAP[formItem.status]?.acao || "rebaixa"}
          onClose={() => setFormItem(null)}
          onEnviado={enviado}
        />
      )}

      {loteAberto && (
        <RebaixaLoteModal
          itens={itensSelecionados}
          onClose={() => setLoteAberto(false)}
          onEnviado={(n) => { enviado(n); limparSelecao(); }}
        />
      )}

      {toast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 bg-success text-white text-sm font-medium px-5 py-2.5 rounded-full shadow-float z-50 pointer-events-none animate-fade-in flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          {toast}
        </div>
      )}
    </div>
  );
}
