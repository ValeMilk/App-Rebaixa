import clsx from "clsx";
import { TONE, toneClasses } from "@/lib/tones";

// Pill de status: um tamanho, cor sempre acompanhada de texto.
export default function Badge({ tone = "neutral", dot = false, solid = false, className, children, ...props }) {
  const t = TONE[tone] || TONE.neutral;
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        solid ? `${t.solid} border-transparent` : toneClasses(tone),
        className
      )}
      {...props}
    >
      {dot && <span className={clsx("h-1.5 w-1.5 rounded-full", solid ? "bg-white/80" : t.dot)} aria-hidden />}
      {children}
    </span>
  );
}
