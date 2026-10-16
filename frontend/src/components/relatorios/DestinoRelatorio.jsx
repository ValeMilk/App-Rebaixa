"use client";

import clsx from "clsx";
import Badge from "@/components/ui/Badge";

const OPCOES = [
  ["comercial", "Comercial", "Todo o time comercial vê."],
  ["supervisor", "De um supervisor", "Só o supervisor responsável (e a diretoria) vê."],
];

/** Etiqueta de para quem e o relatorio: "Comercial" ou "Supervisor: Nome (+N)". Com `onClick`, vira botao. */
export function EtiquetaDestino({ relatorio, onClick }) {
  const sups = relatorio.supervisores || [];
  const comercial = (relatorio.tipo || "comercial") !== "supervisor";
  const texto = comercial ? "Comercial" : `Supervisor: ${sups[0]?.nome || sups[0]?.codigo || "?"}${sups.length > 1 ? ` +${sups.length - 1}` : ""}`;
  const dica = comercial ? "Todo o time comercial vê este relatório" : `Só ${sups.map((s) => s.nome || s.codigo).join(", ")} (e a diretoria) vê este relatório`;
  const badge = <Badge tone={comercial ? "neutral" : "info"} title={dica} data-destino={comercial ? "comercial" : "supervisor"}>{texto}</Badge>;
  if (!onClick) return badge;
  return (
    <button type="button" onClick={onClick} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/40" aria-label={`${texto}. Mudar para quem é o relatório`}>
      {badge}
    </button>
  );
}

/**
 * Escolha de para quem e o relatorio: Comercial (todos) ou um/mais supervisores.
 * `supervisores`: codigos escolhidos; `opcoes`: [{ codigo, nome }] ou null enquanto carrega.
 */
export default function DestinoRelatorio({ idPrefixo, tipo, supervisores, opcoes, onTipo, onSupervisores, desabilitado }) {
  const alternar = (codigo) => onSupervisores(supervisores.includes(codigo) ? supervisores.filter((c) => c !== codigo) : [...supervisores, codigo]);

  return (
    <fieldset className="space-y-3" disabled={desabilitado} id={`${idPrefixo}-destino`}>
      <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Para quem é o relatório</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {OPCOES.map(([valor, titulo, descricao]) => (
          <label
            key={valor}
            className={clsx("flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition", tipo === valor ? "border-secondary bg-secondary/5" : "border-neutral-200 bg-white hover:border-secondary/50")}
          >
            <input type="radio" name={`${idPrefixo}-tipo`} value={valor} checked={tipo === valor} onChange={() => onTipo(valor)} className="mt-0.5 h-4 w-4 accent-secondary" data-tipo={valor} />
            <span>
              <span className="block text-sm font-medium text-neutral-900">{titulo}</span>
              <span className="block text-xs text-neutral-500">{descricao}</span>
            </span>
          </label>
        ))}
      </div>

      {tipo === "supervisor" && (
        <div id={`${idPrefixo}-supervisores`}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Supervisor responsável <span className="font-normal normal-case text-neutral-400">(pode escolher mais de um)</span>
          </p>
          {!opcoes ? (
            <p className="text-sm text-neutral-500">Carregando supervisores…</p>
          ) : opcoes.length === 0 ? (
            <p className="text-sm text-neutral-500">Nenhum supervisor ativo cadastrado.</p>
          ) : (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Supervisores responsáveis">
              {opcoes.map((s) => {
                const marcado = supervisores.includes(s.codigo);
                return (
                  <button
                    key={s.codigo} type="button" aria-pressed={marcado} onClick={() => alternar(s.codigo)}
                    className={clsx("rounded-full border px-3 py-1 text-xs font-semibold transition", marcado ? "border-secondary bg-secondary text-white" : "border-neutral-200 bg-white text-neutral-600 hover:border-secondary/50")}
                  >
                    {s.nome}
                  </button>
                );
              })}
            </div>
          )}
          {supervisores.length === 0 && opcoes && opcoes.length > 0 && <p className="mt-1.5 text-xs text-danger">Escolha ao menos um supervisor.</p>}
        </div>
      )}
    </fieldset>
  );
}
