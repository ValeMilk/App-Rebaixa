// Agenda semanal de visitas: datas como texto "AAAA-MM-DD" (sem fuso), horarios "HH:MM".
import { CHART } from "@/lib/tones";

export const DIAS_CURTOS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
export const DIAS_LONGOS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const dataUtc = (s) => new Date(`${s}T00:00:00Z`);

/** Hoje, no relogio do usuario, como "AAAA-MM-DD". */
export function hojeStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function somarDias(s, n) {
  const d = dataUtc(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Segunda-feira da semana que contem a data. */
export function segundaDe(s) {
  const dia = dataUtc(s).getUTCDay(); // 0 = domingo
  return somarDias(s, -((dia + 6) % 7));
}

/** Dia da semana com segunda = 0 ... domingo = 6. */
export function indiceDoDia(s) {
  return (dataUtc(s).getUTCDay() + 6) % 7;
}

export function diaDoMes(s) {
  return Number(s.slice(8, 10));
}

export function dm(s) {
  return `${s.slice(8, 10)}/${s.slice(5, 7)}`;
}

/** "12 a 18 de outubro de 2026" ou "28 de setembro a 4 de outubro de 2026". */
export function rotuloSemana(segunda, dias = 7) {
  const fim = somarDias(segunda, dias - 1);
  const [a, b] = [segunda, fim].map((s) => ({ d: Number(s.slice(8, 10)), m: Number(s.slice(5, 7)) - 1, y: s.slice(0, 4) }));
  if (a.m === b.m) return `${a.d} a ${b.d} de ${MESES[a.m]} de ${b.y}`;
  return `${a.d} de ${MESES[a.m]} a ${b.d} de ${MESES[b.m]} de ${b.y}`;
}

export const minutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export const chaveCidade = (s) => String(s || "").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Uma cor da paleta por cidade, sempre a mesma para a mesma cidade. */
export function corDaCidade(cidade) {
  const k = chaveCidade(cidade);
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return CHART[h % CHART.length];
}

/**
 * Distribui visitas com horario que se sobrepoem lado a lado (como o Google Agenda).
 * Entrada: [{ iniMin, fimMin (minutos), ... }]. Saida: os mesmos itens com `col` e `cols`.
 */
export function distribuirColunas(itens) {
  const ordenados = [...itens].sort((a, b) => a.iniMin - b.iniMin || b.fimMin - a.fimMin);
  const saida = [];
  let grupo = [];
  let grupoFim = -1;
  const fechar = () => {
    const fins = [];
    for (const it of grupo) {
      let c = fins.findIndex((f) => f <= it.iniMin);
      if (c < 0) { c = fins.length; fins.push(it.fimMin); } else fins[c] = it.fimMin;
      it.col = c;
    }
    for (const it of grupo) it.cols = fins.length;
    saida.push(...grupo);
    grupo = [];
  };
  for (const it of ordenados) {
    if (grupo.length && it.iniMin >= grupoFim) { fechar(); grupoFim = -1; }
    grupo.push({ ...it });
    grupoFim = Math.max(grupoFim, it.fimMin);
  }
  if (grupo.length) fechar();
  return saida;
}

/** Texto da agenda para colar no WhatsApp (uma secao por supervisor). */
export function textoParaWhatsapp({ segunda, visitas, dias = 6 }) {
  const fim = somarDias(segunda, dias - 1);
  const porDono = new Map();
  for (const v of visitas) {
    if (!porDono.has(v.donoNome)) porDono.set(v.donoNome, []);
    porDono.get(v.donoNome).push(v);
  }
  if (!porDono.size) return `*Agenda de visitas*\nSemana de ${dm(segunda)} a ${dm(fim)}/${fim.slice(0, 4)}\n\nSem visitas marcadas.`;
  const blocos = [];
  for (const [nome, lista] of porDono) {
    const linhas = [`*Agenda de visitas — ${nome}*`, `Semana de ${dm(segunda)} a ${dm(fim)}/${fim.slice(0, 4)}`];
    const porDia = new Map();
    for (const v of lista) {
      if (!porDia.has(v.data)) porDia.set(v.data, []);
      porDia.get(v.data).push(v);
    }
    for (const data of [...porDia.keys()].sort()) {
      linhas.push("", `*${DIAS_LONGOS[indiceDoDia(data)]} ${dm(data)}*`);
      const ordem = [...porDia.get(data)].sort((a, b) => (b.diaInteiro ? 1 : 0) - (a.diaInteiro ? 1 : 0) || String(a.inicio).localeCompare(String(b.inicio)));
      for (const v of ordem) {
        const quando = v.diaInteiro ? "dia inteiro" : `${v.inicio} às ${v.fim}`;
        const lojas = v.lojas?.length ? ` (${v.lojas.length} ${v.lojas.length === 1 ? "loja" : "lojas"})` : "";
        linhas.push(`• ${v.cidade} — ${quando}${lojas}`);
        if (v.lojas?.length) linhas.push(`   ${v.lojas.map((l) => l.clienteNome || l.clienteCodigo).join(", ")}`);
        if (v.observacao) linhas.push(`   Obs.: ${v.observacao}`);
      }
    }
    blocos.push(linhas.join("\n"));
  }
  return blocos.join("\n\n");
}
