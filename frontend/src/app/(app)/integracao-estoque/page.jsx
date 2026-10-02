"use client";
import { useTituloDaPagina } from "@/components/PageTitleContext";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtData, fmtDataHora } from "@/lib/utils";
import Surface from "@/components/ui/Surface";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import ArquivoDrop from "@/components/integracao/ArquivoDrop";
import ResumoCards from "@/components/integracao/ResumoCards";
import ColunasCard from "@/components/integracao/ColunasCard";
import { LojasTabela, LojasNovasCard } from "@/components/integracao/LojasCards";
import ProdutosPendentesCard from "@/components/integracao/ProdutosPendentesCard";
import DescartadasCard from "@/components/integracao/DescartadasCard";
import RetratosLista from "@/components/integracao/RetratosLista";

const STORAGE_KEY = "integracao_estoque_rede";
const OCTET = { "Content-Type": "application/octet-stream" };
const TAMANHO_MAXIMO = 8 * 1024 * 1024;

const msgErro = (err, padrao) => err?.response?.data?.error || padrao;

export default function IntegracaoEstoquePage() {
  useTituloDaPagina("Integração Estoque", "Planilha de estoque enviada pela rede");
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [clientes, setClientes] = useState(null);
  const [codigoRede, setCodigoRede] = useState("");
  const [retratos, setRetratos] = useState([]);
  const [carregandoRetratos, setCarregandoRetratos] = useState(false);

  const [arquivo, setArquivo] = useState(null);
  const [analise, setAnalise] = useState(null);
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [baixandoId, setBaixandoId] = useState(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [resultado, setResultado] = useState(null);
  const [dataRetrato, setDataRetrato] = useState("");
  const arquivoRef = useRef(null);

  // Por enquanto so o administrador acessa
  useEffect(() => {
    if (!authLoading && user && user.role !== "admin") router.replace("/encartes");
  }, [user, authLoading, router]);

  // Clientes (redes da carteira)
  useEffect(() => {
    if (authLoading || !user || user.role !== "admin") return;
    (async () => {
      try {
        const { data } = await api.get("/integracao-estoque/clientes");
        const lista = data.clientes || [];
        setClientes(lista);
        let salvo = "";
        try { salvo = sessionStorage.getItem(STORAGE_KEY) || ""; } catch {}
        if (salvo && lista.some((c) => c.codigoRede === salvo)) setCodigoRede(salvo);
        else if (lista.length === 1) setCodigoRede(lista[0].codigoRede);
      } catch (err) {
        setClientes([]);
        setErro(msgErro(err, "Não foi possível carregar as redes."));
      }
    })();
  }, [authLoading, user]);

  const carregarRetratos = useCallback(async (rede) => {
    if (!rede) { setRetratos([]); return; }
    setCarregandoRetratos(true);
    try {
      const { data } = await api.get("/integracao-estoque/retratos", { params: { codigoRede: rede } });
      setRetratos(data.retratos || []);
    } catch {
      setRetratos([]);
    } finally {
      setCarregandoRetratos(false);
    }
  }, []);

  useEffect(() => { carregarRetratos(codigoRede); }, [codigoRede, carregarRetratos]);

  function limparEnvio() {
    arquivoRef.current = null;
    setArquivo(null);
    setAnalise(null);
    setDataRetrato("");
    setErro("");
    setAviso("");
  }

  function escolherRede(valor) {
    setCodigoRede(valor);
    try { if (valor) sessionStorage.setItem(STORAGE_KEY, valor); else sessionStorage.removeItem(STORAGE_KEY); } catch {}
    limparEnvio();
    setResultado(null);
  }

  // Le (ou re-le) o arquivo contra o cadastro atual: nada e gravado aqui.
  const ler = useCallback(async (file, rede) => {
    setLendo(true);
    setErro("");
    try {
      const buf = await file.arrayBuffer();
      const { data } = await api.post("/integracao-estoque/ler", buf, { params: { codigoRede: rede, nome: file.name }, headers: OCTET });
      if (arquivoRef.current !== file) return null; // trocaram de arquivo no meio
      setAnalise(data);
      return data;
    } catch (err) {
      setErro(msgErro(err, "Não foi possível ler o arquivo."));
      setAnalise(null);
      return null;
    } finally {
      setLendo(false);
    }
  }, []);

  async function aoEscolherArquivo(file) {
    setResultado(null);
    setAviso("");
    if (!/\.xlsx$/i.test(file.name)) { setErro("Envie uma planilha no formato .xlsx."); return; }
    if (file.size > TAMANHO_MAXIMO) { setErro("O arquivo passa de 8 MB."); return; }
    arquivoRef.current = file;
    setArquivo(file);
    setAnalise(null);
    const data = await ler(file, codigoRede);
    setDataRetrato(data?.dataInferida?.data || "");
  }

  async function reler() {
    if (arquivoRef.current) await ler(arquivoRef.current, codigoRede);
  }

  // Acao de cadastro (colunas, lojas, produtos): salva e le de novo para refletir o novo cadastro.
  async function acao(fn, sucesso) {
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      const { data } = await fn();
      await reler();
      setAviso(typeof sucesso === "function" ? sucesso(data) : sucesso);
    } catch (err) {
      setErro(msgErro(err, "Não foi possível salvar."));
    } finally {
      setSalvando(false);
    }
  }

  const aplicarColunas = (decisoes) =>
    acao(() => api.post("/integracao-estoque/colunas", { codigoRede, decisoes }), "Mapeamento salvo. Os nomes dessas colunas serão reconhecidos sozinhos nas próximas planilhas.");
  const cadastrarLojas = (lojas) =>
    acao(() => api.post("/integracao-estoque/lojas/lote", { codigoRede, lojas }), (d) => `${d.criadas} loja(s) cadastrada(s).`);
  const vincularProdutos = (vinculos) =>
    acao(() => api.post("/integracao-estoque/produtos/vinculos", { codigoRede, vinculos }), (d) => `${d.vinculados} produto(s) vinculado(s).`);
  const marcarFantasma = (itens) =>
    acao(() => api.post("/integracao-estoque/produtos/fantasma", { codigoRede, itens }), "Marcado como fantasma: fora da análise e nunca mais pendente.");

  async function confirmar() {
    if (!arquivoRef.current || !analise) return;
    setGravando(true);
    setErro("");
    setAviso("");
    try {
      const buf = await arquivoRef.current.arrayBuffer();
      const { data } = await api.post("/integracao-estoque/confirmar", buf, {
        params: { codigoRede, nome: arquivoRef.current.name, dataRetrato },
        headers: OCTET,
      });
      setResultado(data);
      limparEnvio();
      carregarRetratos(codigoRede);
    } catch (err) {
      setErro(msgErro(err, "Não foi possível gravar a importação."));
    } finally {
      setGravando(false);
    }
  }

  async function baixar(retrato) {
    setBaixandoId(retrato.id);
    try {
      const { data } = await api.get(`/integracao-estoque/retratos/${retrato.id}/arquivo`, { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = retrato.nomeArquivo;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Não foi possível baixar o arquivo original.");
    } finally {
      setBaixandoId(null);
    }
  }

  if (authLoading || !user || user.role !== "admin") return null;

  const dataValida = /^\d{4}-\d{2}-\d{2}$/.test(dataRetrato);
  const inferida = analise?.dataInferida;
  const podeGravar = analise?.podeConfirmar && dataValida && !analise.jaImportado && !gravando && !salvando;

  return (
    <div className="space-y-4">
      {/* 1. Cliente e arquivo */}
      <Surface className="space-y-4 p-4">
        <div className="max-w-md">
          <label htmlFor="sel-cliente" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Rede (cliente)</label>
          {clientes === null ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <select id="sel-cliente" className="select" value={codigoRede} onChange={(e) => escolherRede(e.target.value)}>
              <option value="">Selecione a rede dona da planilha…</option>
              {clientes.map((c) => <option key={c.codigoRede} value={c.codigoRede}>{c.nome}</option>)}
            </select>
          )}
        </div>
        <ArquivoDrop arquivo={arquivo} onArquivo={aoEscolherArquivo} desabilitado={!codigoRede || lendo || gravando} lendo={lendo} />
        {!codigoRede && clientes !== null && (
          <p className="text-xs text-neutral-500">Escolha a rede para liberar o envio. Os nomes de coluna, lojas e produtos aprendidos valem por rede.</p>
        )}
      </Surface>

      {erro && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
      {aviso && <p role="status" className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{aviso}</p>}

      {resultado && (
        <div role="status" className={`rounded-xl border p-4 ${resultado.jaExistia ? "border-warning/30 bg-warning/10" : "border-success/30 bg-success/10"}`}>
          {resultado.jaExistia ? (
            <p className="text-sm text-neutral-800">
              Este arquivo <strong>já tinha sido importado</strong> em {fmtDataHora(resultado.retrato.importadoEm)} por{" "}
              {resultado.retrato.importadoPorNome || "—"} (retrato de {fmtData(resultado.retrato.dataRetrato)}). Nada foi duplicado.
            </p>
          ) : (
            <p className="text-sm text-neutral-800">
              <strong>Retrato de {fmtData(resultado.retrato.dataRetrato)} gravado:</strong> {resultado.retrato.linhasValidas.toLocaleString("pt-BR")} linhas
              ({resultado.retrato.linhasDescartadas.toLocaleString("pt-BR")} descartadas), lojas {resultado.retrato.lojasReconhecidas}/{resultado.retrato.lojasNoArquivo}, produtos {resultado.retrato.produtosReconhecidos}/{resultado.retrato.produtosNoArquivo}.
              Pendências em aberto continuam resolvíveis depois.{" "}
              <Link href={`/acompanhamento-estoque?rede=${resultado.retrato.codigoRede}&retrato=${resultado.retrato.id}`} className="font-medium text-secondary underline">Ver no acompanhamento</Link>
            </p>
          )}
        </div>
      )}

      {/* 2. Previa da leitura */}
      {lendo && !analise && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[76px] w-full" />)}
          </div>
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {analise && (
        <div className="space-y-4">
          {analise.jaImportado && (
            <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-neutral-800">
              Este arquivo (idêntico byte a byte) <strong>já foi importado</strong> em {fmtDataHora(analise.jaImportado.importadoEm)} por{" "}
              {analise.jaImportado.importadoPorNome || "—"}, como retrato de {fmtData(analise.jaImportado.dataRetrato)}. Reenviar não duplica.
            </p>
          )}

          {!analise.bloqueada && <ResumoCards resumo={analise.resumo} />}

          <ColunasCard analise={analise} onAplicar={aplicarColunas} salvando={salvando} />

          {analise.lojas.length > 0 && <LojasTabela lojas={analise.lojas} />}

          {/* Data do retrato + gravar */}
          {!analise.bloqueada && (
            <Surface className="flex flex-wrap items-end justify-between gap-4 p-4">
              <div>
                <label htmlFor="data-retrato" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Data do retrato</label>
                <input id="data-retrato" type="date" className="input w-48" value={dataRetrato} onChange={(e) => setDataRetrato(e.target.value)} />
                <p className="mt-1.5 max-w-md text-xs text-neutral-500">
                  {inferida
                    ? <>Inferida {inferida.fonte === "titulo" ? "do título da planilha" : "do nome do arquivo"} (“{inferida.texto}”)
                      {inferida.anoInferido ? <> — o ano foi assumido, <strong>confirme</strong>.</> : "."}</>
                    : "Não foi possível inferir a data pelo título nem pelo nome do arquivo: informe o dia a que o estoque se refere."}
                </p>
              </div>
              <div className="text-right">
                <Button size="lg" disabled={!podeGravar} onClick={confirmar}>
                  {gravando ? "Gravando…" : "Confirmar importação"}
                </Button>
                <p className="mt-1.5 max-w-xs text-xs text-neutral-500">
                  Grava o retrato e o arquivo original, mesmo com pendências abaixo. O retrato não pode ser editado depois.
                </p>
              </div>
            </Surface>
          )}

          {/* Pendencias (nao bloqueiam a gravacao) */}
          {analise.lojasNaoIdentificadas.length > 0 && (
            <LojasNovasCard lojas={analise.lojasNaoIdentificadas} onCadastrar={cadastrarLojas} salvando={salvando} />
          )}
          {analise.produtosPendentes.length > 0 && (
            <ProdutosPendentesCard pendentes={analise.produtosPendentes} onVincular={vincularProdutos} onFantasma={marcarFantasma} salvando={salvando} />
          )}

          <DescartadasCard descartadas={analise.descartadas} total={analise.descartadasTotal} />
        </div>
      )}

      {/* 3. Retratos ja importados */}
      {codigoRede && <RetratosLista retratos={retratos} carregando={carregandoRetratos} onBaixar={baixar} baixandoId={baixandoId} />}
    </div>
  );
}
