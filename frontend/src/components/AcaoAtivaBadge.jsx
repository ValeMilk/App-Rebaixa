export default function AcaoAtivaBadge({ ativa }) {
  if (!ativa) return null;
  const isOferta = ativa.tipo === "oferta_interna";
  const label = isOferta ? "Em oferta" : "Em rebaixa";
  const cls = isOferta
    ? "bg-blue-100 text-blue-700 border-blue-200"
    : "bg-purple-100 text-purple-700 border-purple-200";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border whitespace-nowrap ${cls}`} title={ativa.fimAcao ? `Até ${new Date(ativa.fimAcao).toLocaleDateString("pt-BR")}` : ""}>
      <span className={`w-1 h-1 rounded-full ${isOferta ? "bg-blue-500" : "bg-purple-500"}`} />
      {label}
    </span>
  );
}
