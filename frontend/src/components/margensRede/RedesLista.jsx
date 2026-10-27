"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import Surface from "@/components/ui/Surface";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import { IcoSearch, IcoStore } from "@/components/Icons";

const pct = (v) => (v === null || v === undefined ? null : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);

/** Lista de redes com busca; a selecionada fica destacada. */
export default function RedesLista({ redes, selecionada, onSelecionar, carregando }) {
  const [busca, setBusca] = useState("");

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return redes || [];
    return (redes || []).filter((r) => r.nome.toLowerCase().includes(q) || String(r.codigoRede).toLowerCase().includes(q));
  }, [redes, busca]);

  return (
    <Surface className="flex max-h-[70vh] flex-col overflow-hidden lg:max-h-[calc(100vh-10rem)]">
      <div className="border-b border-neutral-200 p-3">
        <label className="relative block">
          <IcoSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
          <input
            className="input pl-9"
            placeholder="Buscar rede…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar rede"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {carregando ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtradas.length === 0 ? (
          <EmptyState
            icon={IcoStore}
            titulo={redes?.length ? "Nenhuma rede corresponde à busca" : "Nenhuma rede disponível"}
            descricao={redes?.length ? "Tente outro nome ou código." : "Você só vê as redes em que é o supervisor responsável."}
          />
        ) : (
          <ul className="divide-y divide-neutral-100">
            {filtradas.map((r) => {
              const ativa = r.codigoRede === selecionada;
              return (
                <li key={r.codigoRede}>
                  <button
                    type="button"
                    onClick={() => onSelecionar(r.codigoRede)}
                    aria-current={ativa ? "true" : undefined}
                    className={clsx(
                      "flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-accent",
                      ativa && "bg-accent"
                    )}
                  >
                    <span className="min-w-0">
                      <span className={clsx("block truncate text-sm font-medium", ativa ? "text-primary" : "text-neutral-800")}>{r.nome}</span>
                      <span className="block text-xs text-neutral-500">
                        Código {r.codigoRede} · {Number(r.lojas || 0).toLocaleString("pt-BR")} loja{r.lojas === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {r.margemOperacional !== null && r.margemOperacional !== undefined
                        ? <Badge tone="secondary">{pct(r.margemOperacional)}</Badge>
                        : <Badge tone="neutral">sem margem</Badge>}
                      {r.custoMedio && <Badge tone="success" dot>custo v{r.custoMedio.versao}</Badge>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Surface>
  );
}
