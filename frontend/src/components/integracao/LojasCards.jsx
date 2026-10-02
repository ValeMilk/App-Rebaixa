"use client";

import { useEffect, useState } from "react";
import Surface from "@/components/ui/Surface";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { fmtBRL } from "@/lib/utils";

const n = (v) => Number(v || 0).toLocaleString("pt-BR");

/** Quanto esta importacao grava por loja, e se a loja ja esta cadastrada. */
export function LojasTabela({ lojas }) {
  return (
    <Surface className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-800">Lojas do arquivo</h2>
        <span className="text-xs text-neutral-500">{n(lojas.length)} lojas</span>
      </div>
      <div className="overflow-x-auto border-t border-neutral-200">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium text-neutral-600">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Loja</th>
              <th className="px-3 py-2 text-right">Produtos</th>
              <th className="px-3 py-2 text-right">Linhas</th>
              <th className="px-3 py-2 text-right">Valor em estoque</th>
              <th className="px-3 py-2 text-right">Venda 30 dias</th>
              <th className="px-3 py-2">Cadastro</th>
            </tr>
          </thead>
          <tbody>
            {lojas.map((l) => (
              <tr key={l.codigo} className="border-t border-neutral-100">
                <td className="px-3 py-2 tabular-nums text-neutral-600">{l.codigo}</td>
                <td className="px-3 py-2">
                  <div className="font-medium text-neutral-800">{l.nome || l.razaoSocial || l.codigo}</div>
                  {l.nome && l.razaoSocial && <div className="text-xs text-neutral-500">{l.razaoSocial}</div>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{n(l.produtos)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{n(l.linhas)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtBRL(l.valorEstoque)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtBRL(l.venda)}</td>
                <td className="px-3 py-2">
                  {l.reconhecida ? <Badge tone="success" dot>Cadastrada</Badge> : <Badge tone="warning" dot>Não cadastrada</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Surface>
  );
}

/**
 * Cadastro em lote das lojas sem cadastro. O nome vem sugerido (razao social sem o que e
 * comum a todas as lojas) e a pessoa edita linha a linha antes de confirmar.
 */
export function LojasNovasCard({ lojas, onCadastrar, salvando }) {
  const [nomes, setNomes] = useState({});

  useEffect(() => {
    setNomes(Object.fromEntries(lojas.map((l) => [l.codigo, l.nomeSugerido || ""])));
  }, [lojas]);

  const vazios = lojas.filter((l) => !String(nomes[l.codigo] || "").trim()).length;

  return (
    <Surface className="overflow-hidden border-warning/30">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-warning/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-800">Lojas sem cadastro ({n(lojas.length)})</h2>
          <p className="text-xs text-neutral-600">
            Nenhuma loja nasce sozinha: confira os nomes sugeridos e cadastre. A gravação do estoque não depende disso.
          </p>
        </div>
        <Button
          size="sm"
          disabled={salvando || vazios > 0}
          onClick={() => onCadastrar(lojas.map((l) => ({ codigo: l.codigo, nome: nomes[l.codigo].trim(), razaoSocial: l.razaoSocial })))}
        >
          {salvando ? "Cadastrando…" : `Cadastrar as ${n(lojas.length)} lojas`}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium text-neutral-600">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Razão social no arquivo</th>
              <th className="px-3 py-2">Nome da loja</th>
            </tr>
          </thead>
          <tbody>
            {lojas.map((l) => (
              <tr key={l.codigo} className="border-t border-neutral-100">
                <td className="px-3 py-2 tabular-nums text-neutral-600">{l.codigo}</td>
                <td className="px-3 py-2 text-neutral-600">{l.razaoSocial || "—"}</td>
                <td className="px-3 py-2">
                  <input
                    aria-label={`Nome da loja ${l.codigo}`}
                    className="input h-9 text-sm"
                    value={nomes[l.codigo] ?? ""}
                    onChange={(e) => setNomes((x) => ({ ...x, [l.codigo]: e.target.value }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Surface>
  );
}
