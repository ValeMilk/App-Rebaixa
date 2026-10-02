"use client";

import clsx from "clsx";
import { TONE } from "@/lib/tones";
import { variacaoTexto } from "@/lib/acompanhamentoEstoque";

/** Variacao em relacao ao retrato de comparacao (seta + valor); nada quando nao ha comparacao. */
export default function Variacao({ v, tipo, bom, className }) {
  const t = variacaoTexto(v, { tipo, bom });
  if (!t) return null;
  return (
    <span
      className={clsx("whitespace-nowrap text-xs font-semibold tabular-nums", TONE[t.tone].text, className)}
      title="Variação em relação ao retrato de comparação"
    >
      {t.texto}
    </span>
  );
}
