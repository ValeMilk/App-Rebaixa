export const CLASSES = {
  vencido: { label: "Vencido", color: "bg-red-100 text-red-800 border-red-200" },
  critico: { label: "Critico (≤15d)", color: "bg-orange-100 text-orange-800 border-orange-200" },
  alerta: { label: "Alerta (≤30d)", color: "bg-amber-100 text-amber-800 border-amber-200" },
  atencao: { label: "Atencao (≤60d)", color: "bg-yellow-50 text-yellow-800 border-yellow-200" },
  ok: { label: "OK", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export function fmtData(d) {
  if (!d) return "-";
  // Extrai YYYY-MM-DD e cria como horário local (evita offset UTC que causa 1 dia a menos no Brasil)
  const s = typeof d === "string" ? d : d instanceof Date ? d.toISOString() : String(d);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("pt-BR");
  return new Date(d).toLocaleDateString("pt-BR");
}

export function fmtDataHora(d) {
  if (!d) return "-";
  return new Date(d).toLocaleString("pt-BR");
}
