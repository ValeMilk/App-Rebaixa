"use client";
import { useTituloDaPagina } from "@/components/PageTitleContext";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import api from "@/lib/api";
import { fmtDataHora } from "@/lib/utils";
import { abrirPdf, renderizarPagina, sugerirParaVarios, rotuloReferencia } from "@/lib/pdfParaImagens";
import Surface from "@/components/ui/Surface";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import EditarRelatorioDialog, { CamposRelatorio } from "@/components/relatorios/EditarRelatorioDialog";
import { IcoUpload, IcoFileText, IcoX, IcoChevronDown } from "@/components/Icons";

const TAMANHO_MAXIMO = 60 * 1024 * 1024; // por PDF
const MAX_PAGINAS = 150; // por relatorio, somando os PDFs
const msgErro = (err, padrao) => err?.response?.data?.error || err?.message || padrao;
const bruto = { headers: { "Content-Type": "application/octet-stream" } };

let seq = 0;

export default function ImportarRelatorioPage() {
  useTituloDaPagina("Importar Relatório", "Junte um ou mais PDFs: cada página vira uma imagem para os supervisores");

  const [relatorios, setRelatorios] = useState(null);
  const [arquivos, setArquivos] = useState([]); // { chave, nome, estado: convertendo|pronto|erro, erro, total, feitas, paginas[] }
  const [modo, setModo] = useState("novo"); // novo | existente
  const [destinoId, setDestinoId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [referencia, setReferencia] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const [editando, setEditando] = useState(null);
  const urlsRef = useRef([]);
  const cadeiaRef = useRef(Promise.resolve());
  const removidosRef = useRef(new Set());
  const tituloEditadoRef = useRef(false);
  const topoRef = useRef(null);

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

  useEffect(() => () => { urlsRef.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  const convertendo = arquivos.some((a) => a.estado === "convertendo");
  const incluidas = useMemo(() => arquivos.flatMap((a) => a.paginas.filter((p) => p.incluir).map((p) => ({ ...p, origem: a.nome }))), [arquivos]);
  const totalConvertidas = useMemo(() => arquivos.reduce((n, a) => n + a.paginas.length, 0), [arquivos]);
  const destino = modo === "existente" ? (relatorios || []).find((r) => r.id === destinoId) || null : null;

  // Sugestao de nome/mes a partir dos arquivos (enquanto o usuario nao digitou o proprio)
  const nomesChave = arquivos.map((a) => a.nome).join("|");
  useEffect(() => {
    if (tituloEditadoRef.current) return;
    const s = sugerirParaVarios(arquivos.map((a) => a.nome));
    setTitulo(s.titulo);
    setReferencia(s.referencia);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomesChave]);

  const atualizar = useCallback((chave, fn) => setArquivos((as) => as.map((a) => (a.chave === chave ? fn(a) : a))), []);

  // Converte um arquivo (uma por vez, em fila) e vai mostrando as paginas
  const converter = useCallback(async (entrada, arquivo) => {
    try {
      const pdf = await abrirPdf(arquivo);
      atualizar(entrada.chave, (a) => ({ ...a, total: pdf.numPages }));
      for (let n = 1; n <= pdf.numPages; n++) {
        if (removidosRef.current.has(entrada.chave)) return;
        const p = await renderizarPagina(pdf, n);
        if (removidosRef.current.has(entrada.chave)) return;
        const miniaturaUrl = URL.createObjectURL(p.miniatura);
        urlsRef.current.push(miniaturaUrl);
        atualizar(entrada.chave, (a) => ({ ...a, feitas: n, paginas: [...a.paginas, { ...p, miniaturaUrl, incluir: true }] }));
      }
      atualizar(entrada.chave, (a) => ({ ...a, estado: "pronto" }));
    } catch (err) {
      atualizar(entrada.chave, (a) => ({ ...a, estado: "erro", erro: msgErro(err, "Não foi possível converter este PDF.") }));
    }
  }, [atualizar]);

  function escolher(lista) {
    const files = Array.from(lista || []);
    if (!files.length) return;
    setErro("");
    setAviso("");
    const problemas = [];
    const novas = [];
    for (const f of files) {
      if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") problemas.push(`"${f.name}" não é um PDF.`);
      else if (f.size > TAMANHO_MAXIMO) problemas.push(`"${f.name}" passa de 60 MB.`);
      else novas.push(f);
    }
    if (problemas.length) setErro(problemas.join(" "));
    if (!novas.length) return;
    const entradas = novas.map((f) => ({ chave: `a${++seq}`, nome: f.name, estado: "convertendo", erro: "", total: 0, feitas: 0, paginas: [] }));
    setArquivos((as) => [...as, ...entradas]);
    entradas.forEach((e, i) => { cadeiaRef.current = cadeiaRef.current.then(() => converter(e, novas[i])); });
  }

  function removerArquivo(chave) {
    removidosRef.current.add(chave);
    setArquivos((as) => as.filter((a) => a.chave !== chave));
  }
  function mover(chave, delta) {
    setArquivos((as) => {
      const i = as.findIndex((a) => a.chave === chave);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= as.length) return as;
      const c = [...as];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  }
  function alternarPagina(chave, numero) {
    atualizar(chave, (a) => ({ ...a, paginas: a.paginas.map((p) => (p.numero === numero ? { ...p, incluir: !p.incluir } : p)) }));
  }
  function marcarTodas(chave, valor) {
    atualizar(chave, (a) => ({ ...a, paginas: a.paginas.map((p) => ({ ...p, incluir: valor })) }));
  }

  function recomecar() {
    arquivos.forEach((a) => removidosRef.current.add(a.chave));
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = [];
    tituloEditadoRef.current = false;
    setArquivos([]);
    setTitulo("");
    setReferencia("");
    setProgresso({ atual: 0, total: 0 });
  }

  function adicionarAoExistente(r) {
    setModo("existente");
    setDestinoId(r.id);
    setAviso("");
    topoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const urlPagina = (id, numero, p) => `/relatorios/${id}/paginas/${numero}?largura=${p.largura}&altura=${p.altura}&origem=${encodeURIComponent(p.origem)}`;

  async function publicar(e) {
    e.preventDefault();
    if (!incluidas.length) return setErro("Marque ao menos uma página.");
    if (modo === "existente" && !destino) return setErro("Escolha o relatório que vai receber as páginas.");
    setErro("");
    setAviso("");
    setEnviando(true);
    setProgresso({ atual: 0, total: incluidas.length });
    let rascunhoId = null;
    let adicaoId = null;
    try {
      if (modo === "novo") {
        const { data } = await api.post("/relatorios", {
          titulo,
          referencia: referencia || null,
          arquivoNome: arquivos.map((a) => a.nome).join(", ").slice(0, 200),
          totalPaginas: incluidas.length,
        });
        rascunhoId = data.relatorio.id;
        await api.put(`/relatorios/${rascunhoId}/paginas/0`, incluidas[0].miniatura, bruto); // miniatura da lista
        for (let i = 0; i < incluidas.length; i++) {
          await api.put(urlPagina(rascunhoId, i + 1, incluidas[i]), incluidas[i].blob, bruto);
          setProgresso({ atual: i + 1, total: incluidas.length });
        }
        await api.post(`/relatorios/${rascunhoId}/publicar`);
        setAviso(`Relatório "${titulo.trim()}" publicado com ${incluidas.length} ${incluidas.length === 1 ? "página" : "páginas"}.`);
      } else {
        adicaoId = destino.id;
        const { data: ini } = await api.post(`/relatorios/${adicaoId}/adicao`);
        if (ini.totalPaginas + incluidas.length > ini.limite) {
          throw new Error(`O relatório já tem ${ini.totalPaginas} páginas e o limite é ${ini.limite}. Desmarque páginas ou remova arquivos.`);
        }
        for (let i = 0; i < incluidas.length; i++) {
          await api.put(urlPagina(adicaoId, ini.totalPaginas + i + 1, incluidas[i]), incluidas[i].blob, bruto);
          setProgresso({ atual: i + 1, total: incluidas.length });
        }
        await api.post(`/relatorios/${adicaoId}/adicao/confirmar`, { quantidade: incluidas.length });
        setAviso(`${incluidas.length} ${incluidas.length === 1 ? "página adicionada" : "páginas adicionadas"} ao relatório "${destino.titulo}".`);
      }
      recomecar();
      carregar();
    } catch (err) {
      // nada fica pela metade: rascunho some; paginas de adicao nao confirmadas sao descartadas
      if (rascunhoId) api.delete(`/relatorios/${rascunhoId}`).catch(() => {});
      if (adicaoId) api.post(`/relatorios/${adicaoId}/adicao`).catch(() => {});
      setErro(msgErro(err, "Não foi possível publicar.") + " Nada foi publicado; tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  async function excluir(r) {
    if (!confirm(`Excluir o relatório "${r.titulo}"? Ele deixa de aparecer para todos os usuários.`)) return;
    setErro("");
    setAviso("");
    try {
      await api.delete(`/relatorios/${r.id}`);
      if (destinoId === r.id) { setDestinoId(""); setModo("novo"); }
      setAviso(`Relatório "${r.titulo}" excluído.`);
      carregar();
    } catch (err) {
      setErro(msgErro(err, "Não foi possível excluir."));
    }
  }

  const temArquivos = arquivos.length > 0;
  const excede = modo === "novo" ? incluidas.length > MAX_PAGINAS : destino ? destino.totalPaginas + incluidas.length > MAX_PAGINAS : false;
  const podePublicar = !enviando && !convertendo && !excede && incluidas.length > 0 && (modo === "novo" ? titulo.trim().length >= 2 : !!destino);

  return (
    <div className="space-y-4">
      <Surface className="p-4" >
        <div ref={topoRef} className="scroll-mt-20" />
        <p className="mb-3 max-w-3xl text-sm text-neutral-600">
          Monte o relatório com <strong className="font-semibold text-neutral-800">um ou mais PDFs</strong> (por exemplo, o fechamento mensal do mercado e outros documentos do mês).
          Cada página vira uma imagem aqui no navegador; você confere, escolhe se é um relatório novo ou se as páginas entram num já publicado, e publica.
          Quem tem a permissão <strong className="font-semibold text-neutral-800">Relatórios</strong> (por padrão supervisores, diretoria e administrador) vê as imagens na tela Relatórios.
        </p>

        <label
          onDragOver={(e) => { e.preventDefault(); if (!enviando) setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); if (!enviando) escolher(e.dataTransfer.files); }}
          className={clsx(
            "flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-center transition focus-within:ring-2 focus-within:ring-primary-400/40",
            temArquivos ? "px-4 py-4" : "px-6 py-8",
            enviando ? "cursor-not-allowed border-neutral-200 bg-neutral-50 opacity-60" : "cursor-pointer",
            !enviando && (arrastando ? "border-secondary bg-secondary/5" : "border-neutral-300 bg-white hover:border-secondary/60 hover:bg-accent")
          )}
          id="area-pdf"
        >
          <IcoUpload className={clsx("text-secondary", temArquivos ? "h-5 w-5" : "h-7 w-7")} aria-hidden />
          <span className="text-sm font-medium text-neutral-800">
            {temArquivos ? "Adicionar mais PDFs" : "Arraste um ou mais PDFs aqui ou clique para escolher"}
          </span>
          <span className="text-xs text-neutral-500">
            Cada PDF com até 60 MB; o relatório pode ter até {MAX_PAGINAS} páginas no total.
          </span>
          <input
            type="file"
            multiple
            accept=".pdf,application/pdf"
            className="sr-only"
            id="arquivo-pdf"
            disabled={enviando}
            onChange={(e) => { escolher(e.target.files); e.target.value = ""; }}
          />
        </label>
      </Surface>

      {erro && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
      {aviso && <p role="status" className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{aviso}</p>}

      {temArquivos && (
        <form onSubmit={publicar} className="space-y-4" id="form-publicar">
          <Surface className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-neutral-700" id="resumo-arquivos">
                <span className="font-medium">{arquivos.length} {arquivos.length === 1 ? "arquivo" : "arquivos"}</span>
                <span className="text-neutral-500"> · {totalConvertidas} {totalConvertidas === 1 ? "página" : "páginas"}{convertendo ? " (convertendo…)" : ""}</span>
              </p>
              <Button variant="ghost" size="sm" onClick={recomecar} disabled={enviando}>Limpar tudo</Button>
            </div>

            <fieldset className="space-y-2" disabled={enviando}>
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Destino</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-800">
                  <input type="radio" name="modo" value="novo" checked={modo === "novo"} onChange={() => setModo("novo")} className="h-4 w-4 accent-secondary" />
                  Novo relatório
                </label>
                <label className={clsx("flex items-center gap-2 text-sm", relatorios?.length ? "cursor-pointer text-neutral-800" : "cursor-not-allowed text-neutral-400")}>
                  <input type="radio" name="modo" value="existente" checked={modo === "existente"} disabled={!relatorios?.length} onChange={() => setModo("existente")} className="h-4 w-4 accent-secondary" />
                  Adicionar a um relatório já publicado
                </label>
              </div>
              {modo === "existente" && (
                <div>
                  <select className="input" value={destinoId} onChange={(e) => setDestinoId(e.target.value)} id="sel-destino" aria-label="Relatório que recebe as páginas">
                    <option value="">Escolha o relatório...</option>
                    {(relatorios || []).map((r) => (
                      <option key={r.id} value={r.id}>{r.titulo}{r.referencia ? ` (${rotuloReferencia(r.referencia)})` : ""} · {r.totalPaginas} pág.</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-neutral-500">As páginas entram no fim do relatório, na ordem abaixo.</p>
                </div>
              )}
            </fieldset>

            {modo === "novo" && (
              <CamposRelatorio
                idPrefixo="novo"
                titulo={titulo}
                referencia={referencia}
                onTitulo={(v) => { tituloEditadoRef.current = true; setTitulo(v); }}
                onReferencia={(v) => { tituloEditadoRef.current = true; setReferencia(v); }}
              />
            )}
          </Surface>

          <div className="space-y-3" id="arquivos">
            {arquivos.map((a, idx) => {
              const marcadas = a.paginas.filter((p) => p.incluir).length;
              return (
                <Surface key={a.chave} className="overflow-hidden" data-arquivo={a.nome}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 bg-neutral-50 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <IcoFileText className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
                      <span className="truncate text-sm font-medium text-neutral-800">{a.nome}</span>
                      <span className="shrink-0 text-xs text-neutral-500">
                        {a.estado === "convertendo" ? `convertendo página ${Math.min(a.feitas + 1, a.total || a.feitas + 1)} de ${a.total || "…"}` : a.estado === "erro" ? "com erro" : `${marcadas} de ${a.paginas.length} páginas`}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {a.estado === "pronto" && a.paginas.length > 1 && (
                        <button type="button" className="px-2 text-xs text-secondary hover:underline disabled:opacity-50" disabled={enviando} onClick={() => marcarTodas(a.chave, marcadas !== a.paginas.length)}>
                          {marcadas === a.paginas.length ? "Desmarcar todas" : "Marcar todas"}
                        </button>
                      )}
                      <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded text-neutral-600 hover:bg-neutral-200 disabled:opacity-30" disabled={enviando || idx === 0} onClick={() => mover(a.chave, -1)} aria-label={`Subir ${a.nome}`}>
                        <IcoChevronDown className="h-4 w-4 rotate-180" />
                      </button>
                      <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded text-neutral-600 hover:bg-neutral-200 disabled:opacity-30" disabled={enviando || idx === arquivos.length - 1} onClick={() => mover(a.chave, 1)} aria-label={`Descer ${a.nome}`}>
                        <IcoChevronDown className="h-4 w-4" />
                      </button>
                      <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded text-danger hover:bg-danger/10 disabled:opacity-30" disabled={enviando} onClick={() => removerArquivo(a.chave)} aria-label={`Remover ${a.nome}`}>
                        <IcoX className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {a.estado === "erro" ? (
                    <p className="px-3 py-3 text-sm text-danger">{a.erro}</p>
                  ) : (
                    <ul className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4">
                      {a.paginas.map((p) => (
                        <li key={p.numero}>
                          <label className={clsx("block cursor-pointer overflow-hidden rounded-lg border border-neutral-200 bg-white transition", !p.incluir && "opacity-50")}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.miniaturaUrl} alt={`Página ${p.numero} de ${a.nome}`} className="block w-full bg-neutral-100" />
                            <span className="flex items-center gap-2 border-t border-neutral-100 px-2.5 py-1.5 text-xs text-neutral-700">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-neutral-300 accent-secondary"
                                checked={p.incluir}
                                disabled={enviando}
                                onChange={() => alternarPagina(a.chave, p.numero)}
                                aria-label={`Incluir a página ${p.numero} de ${a.nome}`}
                              />
                              Página {p.numero}
                            </span>
                          </label>
                        </li>
                      ))}
                      {a.estado === "convertendo" && (
                        <li className="flex aspect-[1.41/1] items-center justify-center rounded-lg border border-dashed border-neutral-200 text-xs text-neutral-400">convertendo…</li>
                      )}
                    </ul>
                  )}
                </Surface>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {enviando && (
              <span className="text-sm text-neutral-600" role="status">Enviando página {Math.min(progresso.atual + 1, progresso.total)} de {progresso.total}…</span>
            )}
            {!enviando && convertendo && <span className="text-sm text-neutral-500">Aguarde a conversão terminar para publicar.</span>}
            {!enviando && excede && (
              <span className="text-sm text-danger" role="alert">
                {modo === "novo"
                  ? `São ${incluidas.length} páginas; o limite é ${MAX_PAGINAS}. Desmarque páginas ou remova arquivos.`
                  : `O relatório já tem ${destino.totalPaginas} páginas; com estas ${incluidas.length} passaria do limite de ${MAX_PAGINAS}.`}
              </span>
            )}
            <Button type="submit" disabled={!podePublicar} id="btn-publicar">
              {enviando
                ? "Publicando..."
                : modo === "novo"
                  ? `Publicar relatório (${incluidas.length} ${incluidas.length === 1 ? "página" : "páginas"})`
                  : `Adicionar ${incluidas.length} ${incluidas.length === 1 ? "página" : "páginas"} ao relatório`}
            </Button>
          </div>
        </form>
      )}

      <Surface className="overflow-x-auto">
        <div className="border-b border-neutral-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-900">Relatórios publicados</h2>
        </div>
        {!relatorios ? (
          <div className="space-y-2 p-4"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
        ) : relatorios.length === 0 ? (
          <EmptyState icon={IcoFileText} titulo="Nenhum relatório publicado" descricao="Importe um ou mais PDFs acima para começar." />
        ) : (
          <table className="w-full min-w-[720px] text-sm" id="tabela-relatorios">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-600">
              <tr>
                <th className="px-4 py-2 font-semibold">Relatório</th>
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
                    <button type="button" onClick={() => adicionarAoExistente(r)} className="mr-3 text-sm text-secondary hover:underline" data-acao="adicionar">Adicionar PDF</button>
                    <button type="button" onClick={() => setEditando(r)} className="mr-3 text-sm text-secondary hover:underline" data-acao="renomear">Renomear</button>
                    <button type="button" onClick={() => excluir(r)} className="text-sm text-danger hover:underline">Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Surface>

      {editando && (
        <EditarRelatorioDialog
          relatorio={editando}
          onClose={() => setEditando(null)}
          onSalvo={() => { setEditando(null); setAviso("Relatório renomeado."); carregar(); }}
        />
      )}
    </div>
  );
}
