"use client";

import { useRef, useState } from "react";
import api from "@/lib/api";
import { fmtDataHora } from "@/lib/utils";
import Surface from "@/components/ui/Surface";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import StatTile from "@/components/ui/StatTile";
import EmptyState from "@/components/ui/EmptyState";
import ArquivoDrop from "@/components/integracao/ArquivoDrop";
import DescartadasCard from "@/components/integracao/DescartadasCard";
import { IcoUpload, IcoAlert } from "@/components/Icons";

const OCTET = { "Content-Type": "application/octet-stream" };
const TAMANHO_MAXIMO = 8 * 1024 * 1024;
const n = (v) => Number(v || 0).toLocaleString("pt-BR");
const msgErro = (err, padrao) => err?.response?.data?.error || padrao;

function ResumoCustoMedio({ resumo }) {
  const r = resumo;
  const lojasOk = r.lojasNaoReconhecidas === 0;
  const prodOk = r.produtosNaoReconhecidos === 0;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="Linhas válidas" valor={n(r.validas)} apoio={`${n(r.descartadas)} descartadas`} direita={`${n(r.totalLinhas)} no arquivo`} tone="primary" />
      <StatTile label="Lojas reconhecidas" valor={n(r.lojas)} apoio={lojasOk ? "todas reconhecidas" : `${n(r.lojasNaoReconhecidas)} não reconhecida${r.lojasNaoReconhecidas === 1 ? "" : "s"}`} tone={lojasOk ? "success" : "warning"} />
      <StatTile label="Produtos reconhecidos" valor={n(r.produtos)} apoio={prodOk ? "todos reconhecidos" : `${n(r.produtosNaoReconhecidos)} não reconhecido${r.produtosNaoReconhecidos === 1 ? "" : "s"}`} tone={prodOk ? "success" : "warning"} />
      <StatTile label="Não reconhecidos" valor={n(r.lojasNaoReconhecidas + r.produtosNaoReconhecidos)} apoio="lojas + produtos (linhas descartadas)" tone={lojasOk && prodOk ? "neutral" : "danger"} />
    </div>
  );
}

function NaoReconhecidos({ titulo, itens, rotulo }) {
  if (!itens?.length) return null;
  return (
    <Surface as="details">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
        <span className="text-sm font-semibold text-neutral-800">{titulo} ({n(itens.length)})</span>
        <span className="text-xs text-neutral-500">as linhas destes códigos foram descartadas</span>
      </summary>
      <ul className="divide-y divide-neutral-100 border-t border-neutral-200">
        {itens.map((it, i) => (
          <li key={i} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span className="min-w-0 truncate">
              <span className="font-medium text-neutral-800">{it.codigo || "—"}</span>
              {(it.nome || it.descricao) && <span className="text-neutral-500"> · {it.nome || it.descricao}</span>}
            </span>
            <span className="shrink-0 text-xs text-neutral-500">{n(it.linhas)} {rotulo}</span>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

/**
 * Bloco "Custo médio" da rede: versao ativa + historico com download, area de envio da planilha,
 * previa (resumo + descartadas) e confirmacao. O backend decide se a pessoa pode anexar.
 */
export default function CustoMedioCard({ codigoRede, versoes, podeAnexar, responsavel, onImportado }) {
  const [arquivo, setArquivo] = useState(null);
  const [analise, setAnalise] = useState(null);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState(null);
  const [baixando, setBaixando] = useState(null);
  const arquivoRef = useRef(null);

  const ativa = (versoes || []).find((v) => v.ativa) || null;

  function limpar() {
    arquivoRef.current = null;
    setArquivo(null);
    setAnalise(null);
    setErro("");
  }

  async function aoEscolherArquivo(file) {
    setResultado(null);
    setErro("");
    if (!/\.xlsx$/i.test(file.name)) { setErro("Envie uma planilha no formato .xlsx."); return; }
    if (file.size > TAMANHO_MAXIMO) { setErro("O arquivo passa de 8 MB."); return; }
    arquivoRef.current = file;
    setArquivo(file);
    setAnalise(null);
    setLendo(true);
    try {
      const buf = await file.arrayBuffer();
      const { data } = await api.post(`/margens-rede/${codigoRede}/custo-medio/ler`, buf, { params: { nomeArquivo: file.name }, headers: OCTET });
      if (arquivoRef.current !== file) return;
      setAnalise(data);
    } catch (err) {
      setErro(msgErro(err, "Não foi possível ler o arquivo."));
      setAnalise(null);
    } finally {
      setLendo(false);
    }
  }

  async function confirmar() {
    if (!arquivoRef.current || !analise) return;
    setGravando(true);
    setErro("");
    try {
      const buf = await arquivoRef.current.arrayBuffer();
      const { data } = await api.post(`/margens-rede/${codigoRede}/custo-medio/confirmar`, buf, { params: { nomeArquivo: arquivoRef.current.name }, headers: OCTET });
      setResultado(data);
      limpar();
      onImportado?.(data);
    } catch (err) {
      // 409: o mesmo arquivo ja foi importado (a mensagem diz quando e por quem)
      setErro(msgErro(err, "Não foi possível importar o custo médio."));
    } finally {
      setGravando(false);
    }
  }

  async function baixar(v) {
    setBaixando(v.versao);
    setErro("");
    try {
      const { data } = await api.get(`/margens-rede/${codigoRede}/custo-medio/${v.versao}/arquivo`, { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = v.nomeArquivo || `custo-medio-v${v.versao}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Não foi possível baixar o arquivo original.");
    } finally {
      setBaixando(null);
    }
  }

  const podeGravar = analise?.podeConfirmar && !gravando && !lendo;

  return (
    <div className="space-y-4">
      <Surface className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
              <IcoUpload className="h-4 w-4 text-secondary" aria-hidden /> Custo médio
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Planilha da rede com o custo por loja e produto. Cada envio vira uma versão nova; a precificação usa a ativa.
            </p>
          </div>
          {responsavel && (
            <span className="text-xs text-neutral-500">Responsável: <strong className="text-neutral-700">{responsavel.supervisorNome}</strong></span>
          )}
        </div>

        {/* Versao ativa */}
        {ativa ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Versão ativa" valor={`v${ativa.versao}`} apoio={ativa.nomeArquivo} tone="success" destaque />
            <StatTile label="Importada em" valor={fmtDataHora(ativa.importadoEm)} apoio={ativa.importadoPorNome ? `por ${ativa.importadoPorNome}` : ""} tone="neutral" />
            <StatTile label="Linhas" valor={n(ativa.linhas)} apoio={`${n(ativa.resumo?.lojas)} lojas · ${n(ativa.resumo?.produtos)} produtos`} tone="neutral" />
            <StatTile label="Descartadas" valor={n(ativa.resumo?.descartadas)} apoio={`de ${n(ativa.resumo?.totalLinhas)} no arquivo`} tone={ativa.resumo?.descartadas ? "warning" : "neutral"} />
          </div>
        ) : (
          <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
            Esta rede ainda não tem custo médio importado. Sem ele, a precificação usa o preço líquido como custo da rede.
          </p>
        )}

        {/* Envio */}
        {podeAnexar ? (
          <ArquivoDrop arquivo={arquivo} onArquivo={aoEscolherArquivo} desabilitado={lendo || gravando} lendo={lendo} />
        ) : (
          <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-neutral-800">
            <IcoAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <span>
              Só o supervisor responsável pela rede{responsavel ? ` (${responsavel.supervisorNome})` : ""} ou o administrador pode anexar o custo médio.
              {!responsavel && " Esta rede ainda não tem responsável cadastrado em Responsabilidades de Rede."}
            </span>
          </p>
        )}

        {erro && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
        {resultado && (
          <p role="status" className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-neutral-800">
            <strong>Versão {resultado.versao?.versao} importada</strong> e ativa: {n(resultado.resumo?.validas)} linhas válidas
            ({n(resultado.resumo?.descartadas)} descartadas), {n(resultado.resumo?.lojas)} lojas e {n(resultado.resumo?.produtos)} produtos.
          </p>
        )}
      </Surface>

      {/* Previa */}
      {analise && (
        <div className="space-y-4">
          {analise.jaImportado && (
            <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-neutral-800">
              Este arquivo (idêntico byte a byte) <strong>já foi importado</strong> em {fmtDataHora(analise.jaImportado.importadoEm)} por{" "}
              {analise.jaImportado.importadoPorNome || "—"} (versão {analise.jaImportado.versao}). Não é possível importar de novo.
            </p>
          )}
          {analise.bloqueada ? (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-neutral-800">
              {analise.cabecalho?.semCabecalho
                ? "Não foi possível identificar a linha de cabeçalho do arquivo."
                : <>Faltam colunas obrigatórias: <strong>{(analise.obrigatoriosAusentes || []).map((o) => o.rotulo).join(", ")}</strong>. Cabeçalho lido na linha {analise.cabecalho?.linha}: {(analise.colunas || []).map((c) => c.cabecalhoOriginal).join(" | ")}</>}
            </p>
          ) : (
            <>
              <ResumoCustoMedio resumo={analise.resumo} />
              <Surface className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="text-xs text-neutral-500">
                  Cabeçalho na linha {analise.cabecalho?.linha}. Colunas:{" "}
                  {analise.colunas.filter((c) => c.campo && !c.duplicada).map((c) => <Badge key={c.indice} tone="secondary" className="mr-1">{c.cabecalhoOriginal}</Badge>)}
                </div>
                <div className="text-right">
                  <Button size="lg" disabled={!podeGravar} onClick={confirmar}>{gravando ? "Importando…" : "Confirmar importação"}</Button>
                  <p className="mt-1.5 max-w-xs text-xs text-neutral-500">Grava a versão nova com as linhas válidas e o arquivo original; a anterior fica no histórico.</p>
                </div>
              </Surface>
            </>
          )}
          <NaoReconhecidos titulo="Lojas não reconhecidas" itens={analise.lojasNaoReconhecidas} rotulo="linhas" />
          <NaoReconhecidos titulo="Produtos não reconhecidos" itens={analise.produtosNaoReconhecidos} rotulo="linhas" />
          <DescartadasCard descartadas={analise.descartadas || []} total={analise.descartadasTotal || 0} />
        </div>
      )}

      {/* Historico */}
      <Surface className="overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-semibold text-neutral-800">Histórico de versões</h3>
          <span className="text-xs text-neutral-500">{n((versoes || []).length)}</span>
        </div>
        {!(versoes || []).length ? (
          <div className="border-t border-neutral-200">
            <EmptyState icon={IcoUpload} titulo="Nenhuma versão importada" descricao={podeAnexar ? "Envie a primeira planilha acima." : undefined} />
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-neutral-200">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-medium text-neutral-600">
                <tr>
                  <th className="px-3 py-2">Versão</th>
                  <th className="px-3 py-2">Arquivo</th>
                  <th className="px-3 py-2 text-right">Linhas</th>
                  <th className="px-3 py-2 text-right">Lojas</th>
                  <th className="px-3 py-2 text-right">Produtos</th>
                  <th className="px-3 py-2">Importada</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {versoes.map((v) => (
                  <tr key={v.versao} className="border-t border-neutral-100">
                    <td className="px-3 py-2 font-medium tabular-nums text-neutral-800">
                      v{v.versao} {v.ativa && <Badge tone="success" className="ml-1">ativa</Badge>}
                    </td>
                    <td className="max-w-[16rem] truncate px-3 py-2 text-neutral-600" title={v.nomeArquivo}>{v.nomeArquivo}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {n(v.linhas)}
                      {v.resumo?.descartadas > 0 && <span className="text-xs text-neutral-500"> (+{n(v.resumo.descartadas)} desc.)</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{n(v.resumo?.lojas)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{n(v.resumo?.produtos)}</td>
                    <td className="px-3 py-2 text-xs text-neutral-500">
                      <div>{v.importadoPorNome || "—"}</div>
                      <div>{fmtDataHora(v.importadoEm)}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <Button variant="outline" size="sm" disabled={baixando === v.versao} onClick={() => baixar(v)}>
                        {baixando === v.versao ? "Baixando…" : "Baixar arquivo"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </div>
  );
}
