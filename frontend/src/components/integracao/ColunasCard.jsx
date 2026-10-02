"use client";

import { useEffect, useMemo, useState } from "react";
import Surface from "@/components/ui/Surface";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";

const STATUS = {
  reconhecida: { tone: "success", texto: "Reconhecida" },
  nova: { tone: "warning", texto: "Nova" },
  ignorada: { tone: "neutral", texto: "Ignorada" },
  duplicada: { tone: "danger", texto: "Duplicada (não lida)" },
};

const valorAtual = (c) => (c.ignorar ? "ignorar" : c.campo ? `campo:${c.campo}` : "");

/**
 * Mapeamento de colunas: cada coluna do arquivo e lida pelo NOME. Colunas novas pedem uma
 * decisao (associar a um campo, ignorar ou criar campo novo); o nome vira sinonimo e e
 * reconhecido sozinho da proxima vez.
 */
export default function ColunasCard({ analise, onAplicar, salvando }) {
  const { colunas, obrigatoriosAusentes, camposSistema, camposPersonalizados, cabecalho } = analise;
  const [edicoes, setEdicoes] = useState({}); // indice -> { valor, rotulo, tipoValor }

  useEffect(() => { setEdicoes({}); }, [analise.arquivo.hashSha256, colunas]);

  const precisaAtencao =
    obrigatoriosAusentes.length > 0 || cabecalho.incerto || colunas.some((c) => c.status === "nova" || c.status === "duplicada");

  const mudancas = useMemo(
    () => colunas.filter((c) => edicoes[c.indice] && edicoes[c.indice].valor !== valorAtual(c)),
    [colunas, edicoes]
  );
  const invalido = mudancas.some((c) => edicoes[c.indice].valor === "novo" && !String(edicoes[c.indice].rotulo || "").trim());

  function definir(indice, parcial) {
    setEdicoes((e) => ({ ...e, [indice]: { ...(e[indice] || {}), ...parcial } }));
  }

  function aplicar() {
    const decisoes = mudancas
      .map((c) => {
        const e = edicoes[c.indice];
        if (e.valor === "ignorar") return { cabecalhoOriginal: c.cabecalhoOriginal, acao: "ignorar" };
        if (e.valor === "novo") return { cabecalhoOriginal: c.cabecalhoOriginal, acao: "criar", rotulo: e.rotulo.trim(), tipoValor: e.tipoValor || "numero" };
        if (e.valor.startsWith("campo:")) return { cabecalhoOriginal: c.cabecalhoOriginal, acao: "associar", campo: e.valor.slice(6) };
        return null;
      })
      .filter(Boolean);
    if (decisoes.length) onAplicar(decisoes);
  }

  return (
    <Surface as="details" open={precisaAtencao} className="group">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
        <span className="text-sm font-semibold text-neutral-800">Mapeamento de colunas</span>
        <span className="flex items-center gap-2 text-xs text-neutral-500">
          {cabecalho.linha ? `Cabeçalho na linha ${cabecalho.linha}` : "Cabeçalho não identificado"}
          {obrigatoriosAusentes.length > 0 ? (
            <Badge tone="danger" dot>faltam campos obrigatórios</Badge>
          ) : precisaAtencao ? (
            <Badge tone="warning" dot>precisa de decisão</Badge>
          ) : (
            <Badge tone="success" dot>tudo reconhecido</Badge>
          )}
        </span>
      </summary>

      <div className="space-y-3 border-t border-neutral-200 px-4 py-4">
        {cabecalho.semCabecalho && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            Não foi possível identificar a linha do cabeçalho: nenhuma das primeiras linhas tem células suficientes.
          </p>
        )}
        {cabecalho.incerto && !cabecalho.semCabecalho && (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            Nenhuma linha teve colunas reconhecidas o bastante. Usamos a linha {cabecalho.linha} (a mais preenchida)
            como cabeçalho: associe as colunas abaixo e a próxima planilha desta rede será reconhecida sozinha.
          </p>
        )}
        {obrigatoriosAusentes.length > 0 && !cabecalho.semCabecalho && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            Faltam campos obrigatórios: <strong>{obrigatoriosAusentes.map((o) => o.rotulo).join(", ")}</strong>.
            Associe a coluna certa a cada um deles para poder gravar.
          </p>
        )}

        {colunas.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-medium text-neutral-600">
                <tr>
                  <th className="px-3 py-2">Coluna no arquivo</th>
                  <th className="px-3 py-2">Situação</th>
                  <th className="px-3 py-2">Lida como</th>
                </tr>
              </thead>
              <tbody>
                {colunas.map((c) => {
                  const e = edicoes[c.indice];
                  const valor = e ? e.valor : valorAtual(c);
                  const st = STATUS[c.status] || STATUS.nova;
                  return (
                    <tr key={c.indice} className="border-t border-neutral-100 align-top">
                      <td className="px-3 py-2 font-medium text-neutral-800">{c.cabecalhoOriginal}</td>
                      <td className="px-3 py-2">
                        <Badge tone={st.tone}>{st.texto}</Badge>
                        {c.status === "reconhecida" && (
                          <span className="ml-2 text-xs text-neutral-500">{c.origem === "cliente" ? "aprendida" : "de fábrica"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          aria-label={`Campo da coluna ${c.cabecalhoOriginal}`}
                          className="select h-9 text-sm"
                          value={valor}
                          onChange={(ev) => definir(c.indice, { valor: ev.target.value })}
                        >
                          <option value="">— escolher —</option>
                          <optgroup label="Campos do sistema">
                            {camposSistema.map((f) => (
                              <option key={f.chave} value={`campo:${f.chave}`}>{f.rotulo}{f.obrigatorio ? " *" : ""}</option>
                            ))}
                          </optgroup>
                          {camposPersonalizados.length > 0 && (
                            <optgroup label="Campos personalizados">
                              {camposPersonalizados.map((f) => (
                                <option key={f.chave} value={`campo:${f.chave}`}>{f.rotulo}</option>
                              ))}
                            </optgroup>
                          )}
                          <option value="ignorar">Ignorar esta coluna</option>
                          <option value="novo">+ Criar campo novo…</option>
                        </select>
                        {valor === "novo" && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <input
                              className="input h-9 min-w-[10rem] flex-1 text-sm"
                              placeholder="Nome do campo (ex.: Estoque em trânsito)"
                              value={(e && e.rotulo) || ""}
                              onChange={(ev) => definir(c.indice, { rotulo: ev.target.value })}
                            />
                            <select
                              aria-label="Tipo do valor"
                              className="select h-9 w-28 text-sm"
                              value={(e && e.tipoValor) || "numero"}
                              onChange={(ev) => definir(c.indice, { tipoValor: ev.target.value })}
                            >
                              <option value="numero">Número</option>
                              <option value="texto">Texto</option>
                              <option value="data">Data</option>
                            </select>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-neutral-500">
            * obrigatório. Campo novo guarda o valor à parte (não entra em nenhum cálculo) e não exige mudança no sistema.
          </p>
          <Button size="sm" onClick={aplicar} disabled={salvando || mudancas.length === 0 || invalido}>
            {salvando ? "Salvando…" : `Aplicar mapeamento${mudancas.length ? ` (${mudancas.length})` : ""}`}
          </Button>
        </div>
      </div>
    </Surface>
  );
}
