"use client";
import { useTituloDaPagina } from "@/components/PageTitleContext";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { pode } from "@/lib/permissoes";
import { fmtBRL } from "@/lib/utils";
import { normalizar } from "@/lib/estoque";
import { fmtNum, fmtDias, diaMesAno } from "@/lib/acompanhamentoEstoque";
import Surface from "@/components/ui/Surface";
import StatTile from "@/components/ui/StatTile";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import { IcoPackage } from "@/components/Icons";
import Ranking from "@/components/dashboard/Ranking";
import Variacao from "@/components/acompanhamento/Variacao";
import SerieChart from "@/components/acompanhamento/SerieChart";
import StatusBar from "@/components/acompanhamento/StatusBar";
import TabelaEstoque from "@/components/acompanhamento/TabelaEstoque";

const STORAGE_KEY = "acompanhamento_estoque_rede";
const PAGINA = 50;
const FILTROS_VAZIOS = { q: "", loja: "", produto: "", categoria: "", status: "" };
const msgErro = (err, padrao) => err?.response?.data?.error || padrao;

const ORDENS_LOJAS = {
  valor: { label: "Valor em estoque", cmp: (a, b) => b.valorEstoque - a.valorEstoque },
  rupturas: { label: "Rupturas", cmp: (a, b) => b.rupturas - a.rupturas || b.valorEstoque - a.valorEstoque },
  cobertura: { label: "Menor cobertura", cmp: (a, b) => (a.cobertura ?? Infinity) - (b.cobertura ?? Infinity) },
  parado: { label: "Estoque parado", cmp: (a, b) => b.semGiroValor - a.semGiroValor },
};
const ORDENS_PRODUTOS = {
  valor: { label: "Valor em estoque", cmp: (a, b) => b.valorEstoque - a.valorEstoque },
  rupturas: { label: "Lojas em ruptura", cmp: (a, b) => b.rupturas - a.rupturas || b.valorEstoque - a.valorEstoque },
  parado: { label: "Estoque parado", cmp: (a, b) => b.semGiroValor - a.semGiroValor },
};

export default function AcompanhamentoEstoquePage() {
  useTituloDaPagina("Acompanhamento de Estoque", "Evolução do estoque da rede entre os retratos importados");
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const [redes, setRedes] = useState(null);
  const [codigoRede, setCodigoRede] = useState("");
  const [serie, setSerie] = useState([]);
  const [retratoId, setRetratoId] = useState("");
  const [compararCom, setCompararCom] = useState("anterior");
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [ordem, setOrdem] = useState({ campo: "status", dir: 1 });
  const [visiveis, setVisiveis] = useState(PAGINA);
  const [ordemLojas, setOrdemLojas] = useState("valor");
  const [ordemProdutos, setOrdemProdutos] = useState("valor");
  const tabelaRef = useRef(null);
  const queryAplicada = useRef(false);

  // Redes que ja tem retratos
  useEffect(() => {
    if (authLoading || !user || !pode(user, "acompanhamento_estoque.ver")) return;
    (async () => {
      try {
        const { data } = await api.get("/acompanhamento-estoque/redes");
        const lista = data.redes || [];
        setRedes(lista);
        let alvo = params.get("rede") || "";
        if (!alvo) { try { alvo = sessionStorage.getItem(STORAGE_KEY) || ""; } catch {} }
        if (alvo && lista.some((r) => r.codigoRede === alvo)) setCodigoRede(alvo);
        else if (lista.length === 1) setCodigoRede(lista[0].codigoRede);
      } catch (err) {
        setRedes([]);
        setErro(msgErro(err, "Não foi possível carregar as redes."));
      }
    })();
  }, [authLoading, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Retratos da rede (serie historica)
  useEffect(() => {
    if (!codigoRede) { setSerie([]); setRetratoId(""); setDados(null); return; }
    (async () => {
      try {
        const { data } = await api.get("/acompanhamento-estoque/retratos", { params: { codigoRede } });
        const lista = data.retratos || [];
        setSerie(lista);
        const pedido = !queryAplicada.current ? params.get("retrato") : null;
        queryAplicada.current = true;
        setRetratoId(pedido && lista.some((r) => r.id === pedido) ? pedido : lista.length ? lista[lista.length - 1].id : "");
        setCompararCom("anterior");
      } catch (err) {
        setSerie([]);
        setErro(msgErro(err, "Não foi possível carregar os retratos."));
      }
    })();
  }, [codigoRede]); // eslint-disable-line react-hooks/exhaustive-deps

  // Painel do retrato escolhido
  const carregarPainel = useCallback(async () => {
    if (!retratoId) { setDados(null); return; }
    setCarregando(true);
    setErro("");
    try {
      const { data } = await api.get("/acompanhamento-estoque/painel", { params: { retratoId, compararCom } });
      setDados(data);
    } catch (err) {
      setErro(msgErro(err, "Não foi possível carregar o retrato."));
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [retratoId, compararCom]);

  useEffect(() => { carregarPainel(); }, [carregarPainel]);
  useEffect(() => { setVisiveis(PAGINA); }, [filtros, ordem, retratoId]);

  function escolherRede(valor) {
    setCodigoRede(valor);
    setFiltros(FILTROS_VAZIOS);
    try { if (valor) sessionStorage.setItem(STORAGE_KEY, valor); else sessionStorage.removeItem(STORAGE_KEY); } catch {}
  }

  const statusMap = useMemo(() => Object.fromEntries((dados?.status || []).map((s) => [s.key, s])), [dados]);
  const ordemStatus = useMemo(() => Object.fromEntries((dados?.status || []).map((s, i) => [s.key, i])), [dados]);

  // Tabela: filtros e ordenacao locais (os indicadores e rankings sempre cobrem o retrato inteiro)
  const itensFiltrados = useMemo(() => {
    if (!dados) return [];
    const q = normalizar(filtros.q);
    return dados.itens.filter((l) =>
      (!filtros.loja || l.lojaCodigo === filtros.loja) &&
      (!filtros.produto || l.produtoCodigo === filtros.produto) &&
      (!filtros.categoria || l.categoria === filtros.categoria) &&
      (!filtros.status || l.status === filtros.status) &&
      (!q || normalizar(l.lojaNome).includes(q) || normalizar(l.produtoNome).includes(q))
    );
  }, [dados, filtros]);

  const itensOrdenados = useMemo(() => {
    const { campo, dir } = ordem;
    const valor = (l) => (campo === "status" ? ordemStatus[l.status] ?? 99 : l[campo]);
    return [...itensFiltrados].sort((a, b) => {
      const va = valor(a), vb = valor(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;   // vazios sempre no fim
      if (vb == null) return -1;
      const c = typeof va === "string" ? va.localeCompare(vb, "pt-BR") : va - vb;
      return c * dir || b.valorEstoque - a.valorEstoque;
    });
  }, [itensFiltrados, ordem, ordemStatus]);

  const opcoes = useMemo(() => ({
    lojas: (dados?.lojas || []).map((l) => ({ codigo: l.codigo, nome: l.nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    categorias: [...new Set((dados?.itens || []).map((l) => l.categoria))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    status: (dados?.status || []).filter((s) => s.itens > 0),
    produtoNome: (codigo) => dados?.produtos.find((p) => p.codigo === codigo)?.nome || codigo,
  }), [dados]);

  const rankingLojas = useMemo(() => [...(dados?.lojas || [])].sort(ORDENS_LOJAS[ordemLojas].cmp).slice(0, 10), [dados, ordemLojas]);
  const rankingProdutos = useMemo(() => [...(dados?.produtos || [])].sort(ORDENS_PRODUTOS[ordemProdutos].cmp).slice(0, 10), [dados, ordemProdutos]);

  function irParaTabela() {
    requestAnimationFrame(() => tabelaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  const alternar = (campo, valor) => {
    setFiltros((f) => ({ ...f, [campo]: f[campo] === valor ? "" : valor }));
    irParaTabela();
  };
  const onOrdenar = (campo) => setOrdem((o) => (o.campo === campo ? { campo, dir: -o.dir } : { campo, dir: 1 }));

  if (authLoading || !user || !pode(user, "acompanhamento_estoque.ver")) return null;

  const k = dados?.kpis;
  const c = dados?.comparacao;

  return (
    <div className="space-y-4">
      {/* Selecao: rede, retrato e comparacao */}
      <Surface className="flex flex-wrap items-end gap-4 p-4">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="ac-rede" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Rede</label>
          {redes === null ? <Skeleton className="h-10 w-full" /> : (
            <select id="ac-rede" className="select" value={codigoRede} onChange={(e) => escolherRede(e.target.value)}>
              <option value="">Selecione a rede…</option>
              {redes.map((r) => <option key={r.codigoRede} value={r.codigoRede}>{r.nome} ({r.retratos} {r.retratos === 1 ? "retrato" : "retratos"})</option>)}
            </select>
          )}
        </div>
        <div className="min-w-[12rem]">
          <label htmlFor="ac-retrato" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Retrato</label>
          <select id="ac-retrato" className="select" value={retratoId} disabled={!serie.length} onChange={(e) => { setRetratoId(e.target.value); setCompararCom("anterior"); }}>
            {[...serie].reverse().map((r) => <option key={r.id} value={r.id}>{diaMesAno(r.dataRetrato)} · {r.nomeArquivo}</option>)}
          </select>
        </div>
        <div className="min-w-[12rem]">
          <label htmlFor="ac-comparar" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Comparar com</label>
          <select id="ac-comparar" className="select" value={compararCom} disabled={!serie.length} onChange={(e) => setCompararCom(e.target.value)}>
            <option value="anterior">Retrato anterior</option>
            <option value="nenhum">Nenhum</option>
            {[...serie].reverse().filter((r) => r.id !== retratoId).map((r) => <option key={r.id} value={r.id}>{diaMesAno(r.dataRetrato)}</option>)}
          </select>
        </div>
        <Link href="/integracao-estoque" className="btn-secondary ml-auto h-10 text-sm">Importar planilha</Link>
      </Surface>

      {erro && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}

      {redes !== null && redes.length === 0 && !erro && (
        <Surface>
          <EmptyState
            icon={IcoPackage}
            titulo="Nenhum retrato de estoque importado ainda"
            descricao="Envie a primeira planilha da rede na Integração Estoque para acompanhar o estoque aqui."
            acao={<Link href="/integracao-estoque" className="btn text-sm">Ir para a Integração Estoque</Link>}
          />
        </Surface>
      )}

      {redes !== null && redes.length > 0 && !codigoRede && (
        <Surface><EmptyState icon={IcoPackage} titulo="Escolha uma rede para ver o acompanhamento" /></Surface>
      )}

      {carregando && !dados && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[88px] w-full" />)}</div>
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {dados && k && (
        <div className={`space-y-4 transition-opacity ${carregando ? "opacity-60" : ""}`}>
          {/* Contexto do retrato */}
          <p className="text-sm text-neutral-600">
            Retrato de <strong className="text-neutral-800">{diaMesAno(dados.retrato.dataRetrato)}</strong> · {dados.retrato.redeNome}
            {dados.anterior ? <> · comparado com <strong className="text-neutral-800">{diaMesAno(dados.anterior.dataRetrato)}</strong></> : <> · sem retrato de comparação</>}
          </p>

          {(dados.pendencias.produtosNaoIdentificados > 0 || dados.pendencias.lojasSemCadastro > 0 || k.negativos > 0) && (
            <div className="space-y-1 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-neutral-800">
              {dados.pendencias.produtosNaoIdentificados > 0 && (
                <p>{fmtNum(dados.pendencias.produtosNaoIdentificados)} produto(s) ainda não identificados e {fmtNum(dados.pendencias.lojasSemCadastro)} loja(s) sem cadastro continuam entrando nos números pelo código do cliente.{" "}
                  <Link href="/integracao-estoque" className="font-medium text-secondary underline">Resolver na Integração Estoque</Link></p>
              )}
              {dados.pendencias.produtosNaoIdentificados === 0 && dados.pendencias.lojasSemCadastro > 0 && (
                <p>{fmtNum(dados.pendencias.lojasSemCadastro)} loja(s) sem cadastro aparecem pela razão social do arquivo.</p>
              )}
              {k.negativos > 0 && <p>{fmtNum(k.negativos)} linha(s) com saldo negativo no cliente (inconsistência do arquivo; mantidas como vieram).</p>}
            </div>
          )}

          {/* Macro: indicadores */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile label="Valor em estoque" valor={fmtBRL(k.valorEstoque)} apoio={`${fmtNum(k.itens)} linhas · ${fmtNum(k.lojas)} lojas`} direita={<Variacao v={c?.valorEstoque} />} tone="primary" />
            <StatTile label="Venda de 30 dias" valor={fmtBRL(k.vendaReais)} apoio={`≈ ${fmtBRL(k.vendaDiariaReais)} por dia`} direita={<Variacao v={c?.vendaReais} bom="subir" />} />
            <StatTile label="Cobertura" valor={fmtDias(k.cobertura)} apoio="nas linhas com venda" direita={<Variacao v={c?.cobertura} tipo="dias" />} tone={k.cobertura == null ? "neutral" : k.cobertura <= 7 ? "warning" : k.cobertura > 60 ? "caution" : "success"} />
            <StatTile label="Rupturas" valor={fmtNum(k.rupturas)} apoio="sem estoque e com venda" direita={<Variacao v={c?.rupturas} tipo="abs" bom="descer" />} tone="danger" destaque={k.rupturas > 0} />
            <StatTile label="Estoque parado" valor={fmtBRL(k.semGiro.valorEstoque)} apoio={`${fmtNum(k.semGiro.itens)} linhas sem venda`} direita={<Variacao v={c?.semGiroValor} bom="descer" />} tone="caution" />
            <StatTile label="Excesso" valor={fmtBRL(k.excesso.valorEstoque)} apoio={`${fmtNum(k.excesso.itens)} linhas · mais de 60 d`} direita={<Variacao v={c?.excessoValor} bom="descer" />} tone="caution" />
          </div>

          <StatusBar status={dados.status} selecionado={filtros.status} onSelect={(s) => { setFiltros((f) => ({ ...f, status: s })); if (s) irParaTabela(); }} />

          {/* Evolucao entre retratos */}
          <Surface as="section" className="p-5">
            <div className="mb-3">
              <h2 className="text-base font-semibold text-neutral-800">Evolução entre retratos</h2>
              <p className="mt-0.5 text-xs text-neutral-500">Valor em estoque e venda dos últimos 30 dias em cada planilha recebida.</p>
            </div>
            {serie.length >= 2 ? (
              <SerieChart pontos={serie} selecionadoId={retratoId} onSelect={(id) => { setRetratoId(id); setCompararCom("anterior"); }} />
            ) : (
              <p className="py-6 text-center text-sm text-neutral-500">A evolução aparece a partir do segundo retrato importado desta rede.</p>
            )}
          </Surface>

          {/* Rankings */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Ranking
              titulo="Lojas"
              subtitulo="Cobertura e risco por loja"
              itens={rankingLojas}
              chave="codigo"
              selecionada={filtros.loja}
              onSelect={(l) => alternar("loja", l.codigo)}
              renderLabel={(l) => l.nome}
              renderSub={(l) => [`${l.itens} linhas`, l.rupturas ? `${l.rupturas} ruptura${l.rupturas === 1 ? "" : "s"}` : null, l.semGiroItens ? `${l.semGiroItens} sem giro` : null].filter(Boolean).join(" · ")}
              renderValor={(l) => (ordemLojas === "rupturas" ? `${l.rupturas} rupt.` : ordemLojas === "cobertura" ? fmtDias(l.cobertura) : ordemLojas === "parado" ? fmtBRL(l.semGiroValor) : fmtBRL(l.valorEstoque))}
              renderValorSub={(l) => (ordemLojas === "cobertura" ? fmtBRL(l.valorEstoque) : `cobertura ${fmtDias(l.cobertura)}`)}
              controle={(
                <select value={ordemLojas} onChange={(e) => setOrdemLojas(e.target.value)} className="select h-8 w-auto py-0 text-xs" aria-label="Ordenar lojas">
                  {Object.entries(ORDENS_LOJAS).map(([key, o]) => <option key={key} value={key}>{o.label}</option>)}
                </select>
              )}
              vazio="Nenhuma loja neste retrato."
            />
            <Ranking
              titulo="Produtos"
              subtitulo="Somando todas as lojas"
              itens={rankingProdutos}
              chave="codigo"
              selecionada={filtros.produto}
              onSelect={(p) => alternar("produto", p.codigo)}
              renderLabel={(p) => p.nome}
              renderSub={(p) => [`${p.lojas} ${p.lojas === 1 ? "loja" : "lojas"}`, p.categoria, p.rupturas ? `${p.rupturas} em ruptura` : null].filter(Boolean).join(" · ")}
              renderValor={(p) => (ordemProdutos === "rupturas" ? `${p.rupturas} lojas` : ordemProdutos === "parado" ? fmtBRL(p.semGiroValor) : fmtBRL(p.valorEstoque))}
              renderValorSub={(p) => `cobertura ${fmtDias(p.cobertura)}`}
              controle={(
                <select value={ordemProdutos} onChange={(e) => setOrdemProdutos(e.target.value)} className="select h-8 w-auto py-0 text-xs" aria-label="Ordenar produtos">
                  {Object.entries(ORDENS_PRODUTOS).map(([key, o]) => <option key={key} value={key}>{o.label}</option>)}
                </select>
              )}
              vazio="Nenhum produto neste retrato."
            />
          </div>

          {/* Micro: detalhe */}
          <div ref={tabelaRef} className="scroll-mt-20">
            <TabelaEstoque
              linhas={itensOrdenados.slice(0, visiveis)}
              totalFiltrado={itensOrdenados.length}
              totalGeral={dados.itensTotal}
              filtros={filtros}
              setFiltros={setFiltros}
              opcoes={opcoes}
              statusMap={statusMap}
              ordem={ordem}
              onOrdenar={onOrdenar}
              onMais={() => setVisiveis((v) => v + PAGINA)}
              onLimpar={() => setFiltros(FILTROS_VAZIOS)}
            />
          </div>

          <p className="text-xs text-neutral-500">
            Cobertura = estoque ÷ venda diária (venda de 30 dias ÷ 30). Faixas: baixa até 7 dias, adequada até 30, alta até 60 e excesso acima disso.
            A cobertura geral compara o estoque a custo com o custo da venda diária, nas linhas que vendem. O DDE do cliente é só conferência.
            Produtos marcados como fantasma ficam fora de todos os números.
          </p>
        </div>
      )}
    </div>
  );
}
