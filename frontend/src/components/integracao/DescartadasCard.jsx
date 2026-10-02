"use client";

import Surface from "@/components/ui/Surface";

/**
 * Linhas descartadas (nunca somem): numero da linha original e motivo, para quem confere
 * o arquivo no Excel ver que bate exatamente com o que o sistema leu.
 */
export default function DescartadasCard({ descartadas, total }) {
  if (!total) return null;
  return (
    <Surface as="details">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
        <span className="text-sm font-semibold text-neutral-800">Linhas descartadas ({Number(total).toLocaleString("pt-BR")})</span>
        <span className="text-xs text-neutral-500">clique para ver o motivo de cada uma</span>
      </summary>
      <div className="overflow-x-auto border-t border-neutral-200">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium text-neutral-600">
            <tr>
              <th className="px-3 py-2">Linha no arquivo</th>
              <th className="px-3 py-2">Motivo</th>
              <th className="px-3 py-2">Conteúdo</th>
            </tr>
          </thead>
          <tbody>
            {descartadas.map((d) => (
              <tr key={d.linha} className="border-t border-neutral-100">
                <td className="px-3 py-2 tabular-nums">{d.linha}</td>
                <td className="px-3 py-2 text-neutral-800">{d.motivo}</td>
                <td className="px-3 py-2 text-xs text-neutral-500">{d.conteudo || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {total > descartadas.length && (
          <p className="border-t border-neutral-100 px-3 py-2 text-xs text-neutral-500">
            Mostrando {descartadas.length} de {Number(total).toLocaleString("pt-BR")}.
          </p>
        )}
      </div>
    </Surface>
  );
}
