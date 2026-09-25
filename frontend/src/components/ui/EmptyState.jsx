// Estado vazio: distingue "nao ha dados" de "nada corresponde aos filtros" pelo texto/acao passados.
export default function EmptyState({ icon: Icon, titulo, descricao, acao }) {
  return (
    <div className="px-6 py-12 text-center">
      {Icon && (
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-100 text-neutral-400">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      )}
      <p className="text-sm font-medium text-neutral-700">{titulo}</p>
      {descricao && <p className="mt-1 text-xs text-neutral-500">{descricao}</p>}
      {acao && <div className="mt-3 flex justify-center">{acao}</div>}
    </div>
  );
}
