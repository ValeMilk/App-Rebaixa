"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { IcoUpload } from "@/components/Icons";

/** Area para soltar (ou escolher) a planilha .xlsx. */
export default function ArquivoDrop({ arquivo, onArquivo, desabilitado, lendo }) {
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef(null);

  function escolher(lista) {
    const f = lista && lista[0];
    if (f) onArquivo(f);
  }

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); if (!desabilitado) setArrastando(true); }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastando(false);
        if (!desabilitado) escolher(e.dataTransfer.files);
      }}
      className={clsx(
        "flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-6 py-8 text-center transition focus-within:ring-2 focus-within:ring-primary-400/40",
        desabilitado ? "cursor-not-allowed border-neutral-200 bg-neutral-50 opacity-60" : "cursor-pointer",
        !desabilitado && (arrastando ? "border-secondary bg-secondary/5" : "border-neutral-300 bg-white hover:border-secondary/60 hover:bg-accent")
      )}
    >
      <IcoUpload className="h-7 w-7 text-secondary" aria-hidden />
      <span className="text-sm font-medium text-neutral-800">
        {lendo ? "Lendo a planilha…" : arquivo ? arquivo.name : "Arraste a planilha .xlsx aqui ou clique para escolher"}
      </span>
      <span className="text-xs text-neutral-500">
        {arquivo && !lendo
          ? `${Math.max(1, Math.round(arquivo.size / 1024))} KB · clique para trocar de arquivo`
          : "Uma aba só. O cabeçalho é reconhecido pelo nome das colunas, em qualquer posição."}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        disabled={desabilitado}
        onChange={(e) => { escolher(e.target.files); e.target.value = ""; }}
      />
    </label>
  );
}
