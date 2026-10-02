"use client";

import Surface from "@/components/ui/Surface";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { IcoPackage } from "@/components/Icons";
import { fmtBRL, fmtData, fmtDataHora } from "@/lib/utils";

const n = (v) => Number(v || 0).toLocaleString("pt-BR");

/** Retratos ja importados da rede; permite baixar o arquivo original (auditoria). */
export default function RetratosLista({ retratos, carregando, onBaixar, baixandoId }) {
  return (
    <Surface className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-800">Retratos já importados</h2>
        {!carregando && <span className="text-xs text-neutral-500">{n(retratos.length)}</span>}
      </div>
      {carregando ? (
        <div className="space-y-2 border-t border-neutral-200 p-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : retratos.length === 0 ? (
        <div className="border-t border-neutral-200">
          <EmptyState icon={IcoPackage} titulo="Nenhum retrato importado para esta rede" descricao="Envie a primeira planilha acima." />
        </div>
      ) : (
        <div className="overflow-x-auto border-t border-neutral-200">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-medium text-neutral-600">
              <tr>
                <th className="px-3 py-2">Data do retrato</th>
                <th className="px-3 py-2">Arquivo</th>
                <th className="px-3 py-2 text-right">Linhas</th>
                <th className="px-3 py-2 text-right">Lojas</th>
                <th className="px-3 py-2 text-right">Produtos</th>
                <th className="px-3 py-2 text-right">Valor em estoque</th>
                <th className="px-3 py-2">Importado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {retratos.map((r) => (
                <tr key={r.id} className="border-t border-neutral-100">
                  <td className="px-3 py-2 font-medium tabular-nums text-neutral-800">{fmtData(r.dataRetrato)}</td>
                  <td className="max-w-[16rem] truncate px-3 py-2 text-neutral-600" title={r.nomeArquivo}>{r.nomeArquivo}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {n(r.linhasValidas)}
                    {r.linhasDescartadas > 0 && <span className="text-xs text-neutral-500"> (+{n(r.linhasDescartadas)} desc.)</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{n(r.lojasReconhecidas)}/{n(r.lojasNoArquivo)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {n(r.produtosReconhecidos)}/{n(r.produtosNoArquivo)}
                    {r.produtosFantasma > 0 && <span className="text-xs text-neutral-500"> · {n(r.produtosFantasma)} fant.</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtBRL(r.valorTotalEstoque)}</td>
                  <td className="px-3 py-2 text-xs text-neutral-500">
                    <div>{r.importadoPorNome || "—"}</div>
                    <div>{fmtDataHora(r.importadoEm)}</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="outline" size="sm" disabled={baixandoId === r.id} onClick={() => onBaixar(r)}>
                      {baixandoId === r.id ? "Baixando…" : "Baixar arquivo"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Surface>
  );
}
