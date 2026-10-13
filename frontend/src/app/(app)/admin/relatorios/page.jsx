"use client";
import { useTituloDaPagina } from "@/components/PageTitleContext";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import api from "@/lib/api";
import { fmtDataHora } from "@/lib/utils";
import { abrirPdf, renderizarPagina, sugerirTitulo, rotuloReferencia } from "@/lib/pdfParaImagens";
import Surface from "@/components/ui/Surface";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { IcoUpload, IcoFileText } from "@/components/Icons";

const TAMANHO_MAXIMO = 60 * 1024 * 1024;
const MAX_PAGINAS = 60;
const msgErro = (err, padrao) => err?.response?.data?.error || err?.message || padrao;

// Campos de titulo e mes de referencia (criacao e edicao)
function CamposRelatorio({ titulo, referencia, onTitulo, onReferencia, idPrefixo }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px]">
      <div>
        <label htmlFor={`${idPrefixo}-titulo`} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Título</label>
        <input id={`${idPrefixo}-titulo`} className="input" value={titulo} maxLength={120} onChange={(e) => onTitulo(e.target.value)} placeholder="Ex.: Fechamento de Setembro/2026" required />
      </div>
      <div>
        <label htmlFor={`${idPrefixo}-ref`} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Mês de referência</label>
        <input id={`${idPrefixo}-ref`} type="month" className="input" value={referencia} onChange={(e) => onReferencia(e.target.value)} />
      </div>
    </div>
  );
}

function EditarDialog({ relatorio, onClose, onSalvo }) {
  const [titulo, setTitulo] = useState(relatorio.titulo);
  const [referencia, setReferencia] = useState(relatorio.referencia || "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    try {
      await api.put(`/relatorios/${relatorio.id}`, { titulo, referencia: referencia || null });
      onSalvo();
    } catch (err) {
      setErro(msgErro(err, "Não foi possível salvar."));
      setSalvando(false);
    }
  }

  return (
    <Dialog open onClose={onClose} size="lg" ariaLabel="Editar relatório">
      <form onSubmit={salvar} className="flex flex-col gap-4 p-5" id="form-editar-relatorio">
        <h2 className="text-base font-semibold text-neutral-900">Editar relatório</h2>
        {erro && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
        <CamposRelatorio idPrefixo="ed" titulo={titulo} referencia={referencia} onTitulo={setTitulo} onReferencia={setReferencia} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button type="submit" disabled={salvando || titulo.trim().length < 2}>{salvando ? "Salvando..." : "Salvar"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function ImportarRelatorioPage() {
  useTituloDaPagina("Importar Relatório", "Envie um PDF: cada página vira uma imagem para os supervisores");

  const [relatorios, setRelatorios] = useState(null);
  const [fase, setFase] = useState("inicio"); // inicio | convertendo | revisao | enviando
  const [arquivo, setArquivo] = useState(null);
  const [paginas, setPaginas] = useState([]); // { numero, blob, miniatura, miniaturaUrl, largura, altura, incluir }
  const [titulo, setTitulo] = useState("");
  const [referencia, setReferencia] = useState("");
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const [editando, setEditando] = useState(null);
  const urlsRef = useRef([]);

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get("/relatorios");
      setRelatorios(data.relatorios || []);
    } catch (err) {
      setErro(msgErro(err, "Não foi possível carregar os relatórios."));
      setRelatorios([]);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const liberarUrls = useCallback(() => {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = [];
  }, []);
  useEffect(() => liberarUrls, [liberarUrls]);

  function recomecar() {
    liberarUrls();
    setArquivo(null);
    setPaginas([]);
    setTitulo("");
    setReferencia("");
    setProgresso({ atual: 0, total: 0 });
    setFase("inicio");
  }

  async function escolher(lista) {
    const f = lista && lista[0];
    if (!f) return;
    setErro("");
    setAviso("");
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") return setErro("Escolha um arquivo PDF.");
    if (f.size > TAMANHO_MAXIMO) return setErro("O PDF passa de 60 MB. Reduza o arquivo e tente de novo.");

    liberarUrls();
    setArquivo(f);
    setPaginas([]);
    const sugestao = sugerirTitulo(f.name);
    setTitulo(sugestao.titulo);
    setReferencia(sugestao.referencia);
    setFase("convertendo");
    try {
      const pdf = await abrirPdf(f);
      if (pdf.numPages > MAX_PAGINAS) throw new Error(`O PDF tem ${pdf.numPages} páginas; o limite é ${MAX_PAGINAS}.`);
      setProgresso({ atual: 0, total: pdf.numPages });
      const lidas = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const p = await renderizarPagina(pdf, n);
        const miniaturaUrl = URL.createObjectURL(p.miniatura);
        urlsRef.current.push(miniaturaUrl);
        lidas.push({ ...p, miniaturaUrl, incluir: true });
        setProgresso({ atual: n, total: pdf.numPages });
      }
      setPaginas(lidas);
      setFase("revisao");
    } catch (err) {
      setErro(msgErro(err, "Não foi possível converter o PDF."));
      recomecar();
    }
  }

  const incluidas = paginas.filter((p) => p.incluir);

  async function publicar(e) {
    e.preventDefault();
    if (!incluidas.length) return setErro("Marque ao menos uma página.");
    setErro("");
    setFase("enviando");
    const bruto = { headers: { "Content-Type": "application/octet-stream" } };
    let id = null;
    try {
      const { data } = await api.post("/relatorios", { titulo, referencia: referencia || null, arquivoNome: arquivo?.name, totalPaginas: incluidas.length });
      id = data.relatorio.id;
      setProgresso({ atual: 0, total: incluidas.length });
      await api.put(`/relatorios/${id}/paginas/0`, incluidas[0].miniatura, bruto); // miniatura da lista
      for (let i = 0; i < incluidas.length; i++) {
        const p = incluidas[i];
        await api.put(`/relatorios/${id}/paginas/${i + 1}?largura=${p.largura}&altura=${p.altura}`, p.blob, bruto);
        setProgresso({ atual: i + 1, total: incluidas.length });
      }
      await api.post(`/relatorios/${id}/publicar`);
      setAviso(`Relatório "${titulo.trim()}" publicado com ${incluidas.length} ${incluidas.length === 1 ? "página" : "páginas"}.`);
      recomecar();
      carregar();
    } catch (err) {
      // rascunho incompleto: tenta apagar (se falhar, expira sozinho em 1 dia)
      if (id) api.delete(`/relatorios/${id}`).catch(() => {});
      setErro(msgErro(err, "Não foi possível publicar o relatório.") + " Nada foi publicado; tente de novo.");
      setFase("revisao");
    }
  }

  async function excluir(r) {
    if (!confirm(`Excluir o relatório "${r.titulo}"? Ele deixa de aparecer para todos os usuários.`)) return;
    setErro("");
    setAviso("");
    try {
      await api.delete(`/relatorios/${r.id}`);
      setAviso(`Relatório "${r.titulo}" excluído.`);
      carregar();
    } catch (err) {
      setErro(msgErro(err, "Não foi possível excluir."));
    }
  }

  const ocupado = fase === "convertendo" || fase === "enviando";

  return (
    <div className="space-y-4">
      <Surface className="p-4">
        <p className="mb-3 max-w-3xl text-sm text-neutral-600">
          Escolha um PDF (por exemplo, o fechamento mensal do mercado). Cada página é convertida em imagem aqui no navegador, você confere o resultado e publica.
          Quem tem a permissão <strong className="font-semibold text-neutral-800">Relatórios</strong> (por padrão supervisores, diretoria e administrador) passa a ver as imagens na tela Relatórios.
        </p>

        {fase === "inicio" || fase === "convertendo" ? (
          <label
            onDragOver={(e) => { e.preventDefault(); if (!ocupado) setArrastando(true); }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); if (!ocupado) escolher(e.dataTransfer.files); }}
            className={clsx(
              "flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-6 py-8 text-center transition focus-within:ring-2 focus-within:ring-primary-400/40",
              ocupado ? "cursor-wait border-neutral-200 bg-neutral-50" : "cursor-pointer",
              !ocupado && (arrastando ? "border-secondary bg-secondary/5" : "border-neutral-300 bg-white hover:border-secondary/60 hover:bg-accent")
            )}
            id="area-pdf"
          >
            <IcoUpload className="h-7 w-7 text-secondary" aria-hidden />
            <span className="text-sm font-medium text-neutral-800">
              {fase === "convertendo"
                ? `Convertendo página ${Math.min(progresso.atual + 1, progresso.total || 1)} de ${progresso.total || "…"}`
                : "Arraste o PDF aqui ou clique para escolher"}
            </span>
            <span className="text-xs text-neutral-500">
              {fase === "convertendo" ? arquivo?.name : `Até ${MAX_PAGINAS} páginas e 60 MB.`}
            </span>
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="sr-only"
              id="arquivo-pdf"
              disabled={ocupado}
              onChange={(e) => { escolher(e.target.files); e.target.value = ""; }}
            />
          </label>
        ) : (
          <form onSubmit={publicar} className="space-y-4" id="form-publicar">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm text-neutral-700">
                <IcoFileText className="h-4 w-4 text-neutral-500" aria-hidden />
                <span className="font-medium">{arquivo?.name}</span>
                <span className="text-neutral-500">· {paginas.length} {paginas.length === 1 ? "página" : "páginas"}</span>
              </p>
              <Button variant="ghost" size="sm" onClick={recomecar} disabled={fase === "enviando"}>Trocar arquivo</Button>
            </div>

            <CamposRelatorio idPrefixo="novo" titulo={titulo} referencia={referencia} onTitulo={setTitulo} onReferencia={setReferencia} />

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Páginas <span className="font-normal normal-case text-neutral-400">({incluidas.length} {incluidas.length === 1 ? "será publicada" : "serão publicadas"}; desmarque as que não devem aparecer)</span>
              </p>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" id="miniaturas">
                {paginas.map((p) => (
                  <li key={p.numero}>
                    <label className={clsx("block cursor-pointer overflow-hidden rounded-lg border bg-white transition", p.incluir ? "border-neutral-200" : "border-neutral-200 opacity-50")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.miniaturaUrl} alt={`Página ${p.numero}`} className="block w-full bg-neutral-100" />
                      <span className="flex items-center gap-2 border-t border-neutral-100 px-2.5 py-1.5 text-xs text-neutral-700">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-neutral-300 accent-secondary"
                          checked={p.incluir}
                          disabled={fase === "enviando"}
                          onChange={() => setPaginas((ps) => ps.map((x) => (x.numero === p.numero ? { ...x, incluir: !x.incluir } : x)))}
                          aria-label={`Incluir a página ${p.numero}`}
                        />
                        Página {p.numero}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              {fase === "enviando" && (
                <span className="text-sm text-neutral-600" role="status">Enviando página {Math.min(progresso.atual + 1, progresso.total)} de {progresso.total}…</span>
              )}
              <Button type="submit" disabled={fase === "enviando" || incluidas.length === 0 || titulo.trim().length < 2} id="btn-publicar">
                {fase === "enviando" ? "Publicando..." : "Publicar relatório"}
              </Button>
            </div>
          </form>
        )}
      </Surface>

      {erro && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
      {aviso && <p role="status" className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{aviso}</p>}

      <Surface className="overflow-x-auto">
        <div className="border-b border-neutral-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-900">Relatórios publicados</h2>
        </div>
        {!relatorios ? (
          <div className="space-y-2 p-4"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
        ) : relatorios.length === 0 ? (
          <EmptyState icon={IcoFileText} titulo="Nenhum relatório publicado" descricao="Importe um PDF acima para começar." />
        ) : (
          <table className="w-full min-w-[640px] text-sm" id="tabela-relatorios">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-600">
              <tr>
                <th className="px-4 py-2 font-semibold">Título</th>
                <th className="px-3 py-2 font-semibold">Referência</th>
                <th className="px-3 py-2 text-right font-semibold">Páginas</th>
                <th className="px-3 py-2 font-semibold">Publicado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {relatorios.map((r) => (
                <tr key={r.id} className="border-t border-neutral-100" data-relatorio={r.id}>
                  <td className="px-4 py-2 font-medium text-neutral-800">{r.titulo}</td>
                  <td className="px-3 py-2 capitalize text-neutral-600">{rotuloReferencia(r.referencia) || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-700">{r.totalPaginas}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-neutral-500">
                    {fmtDataHora(r.publicadoEm)}{r.criadoPorNome ? ` · ${r.criadoPorNome}` : ""}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <Link href={`/relatorios/${r.id}`} className="mr-3 text-sm text-secondary hover:underline">Ver</Link>
                    <button type="button" onClick={() => setEditando(r)} className="mr-3 text-sm text-secondary hover:underline">Editar</button>
                    <button type="button" onClick={() => excluir(r)} className="text-sm text-danger hover:underline">Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Surface>

      {editando && (
        <EditarDialog
          relatorio={editando}
          onClose={() => setEditando(null)}
          onSalvo={() => { setEditando(null); setAviso("Relatório atualizado."); carregar(); }}
        />
      )}
    </div>
  );
}
