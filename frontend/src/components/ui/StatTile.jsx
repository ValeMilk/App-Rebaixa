import clsx from "clsx";
import { TONE } from "@/lib/tones";

/**
 * Cartao de indicador (KPI): rotulo, numero grande, texto de apoio.
 * `tone` colore o numero; `destaque` reforca a borda no tom.
 */
export default function StatTile({ label, valor, apoio, direita, tone = "neutral", destaque = false, className }) {
  const t = TONE[tone] || TONE.neutral;
  return (
    <div
      className={clsx(
        "flex min-h-[76px] min-w-0 flex-col justify-between gap-1 rounded-xl border bg-white p-4 text-left",
        destaque ? `${t.border} ${t.bg}` : "border-neutral-200",
        className
      )}
    >
      <span className="flex items-start justify-between gap-2 text-xs font-medium text-neutral-600">
        <span className="truncate">{label}</span>
        {destaque && <span className={clsx("mt-1 h-2 w-2 shrink-0 animate-pulse rounded-full", t.dot)} aria-hidden />}
      </span>
      <span className={clsx("truncate text-2xl font-semibold tabular-nums", tone === "neutral" ? "text-neutral-800" : t.text)}>
        {valor}
      </span>
      {(apoio || direita) && (
        <span className="flex items-baseline justify-between gap-2 text-xs text-neutral-500">
          <span className="truncate">{apoio}</span>
          {direita && <span className="whitespace-nowrap font-medium tabular-nums text-neutral-600">{direita}</span>}
        </span>
      )}
    </div>
  );
}
