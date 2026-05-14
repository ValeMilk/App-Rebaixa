const axios = require("axios");

const BASE_URL = process.env.ATIVMOB_BASE_URL || "https://api5.ativmob.com.br/v2";
const API_KEY = process.env.ATIVMOB_API_KEY;
const STORE_CNPJ = process.env.ATIVMOB_STORE_CNPJ;

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  headers: { "X-API-Key": API_KEY, Accept: "application/json" },
});

function fmt(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/**
 * Busca todos os eventos de ESTOQUE E VENCIMENTO via paginacao.
 * Filtra direto na API com event_code=estoque.
 */
async function buscarEventosEstoque({ desde, ate, ateMaxPaginas = 1000 } = {}) {
  const inicio = desde instanceof Date ? fmt(desde) : desde;
  const fim = ate instanceof Date ? fmt(ate) : ate;
  let cursor = inicio;
  const seen = new Set();
  const all = [];
  let pagina = 0;

  while (pagina < ateMaxPaginas) {
    pagina++;
    const params = {
      storeCNPJ: STORE_CNPJ,
      startDateTime: cursor,
      ...(fim ? { endDateTime: fim } : {}),
      maxNumEvents: "100",
      event_code: "estoque",
    };

    let res;
    let tentativa = 0;
    while (tentativa < 3) {
      try {
        res = await client.get("/orders/delivery/get_events/", { params });
        break;
      } catch (err) {
        tentativa++;
        if (tentativa >= 3) throw err;
        await new Promise((r) => setTimeout(r, 1500 * tentativa));
      }
    }

    const events = res.data?.events || [];
    if (events.length === 0) break;

    let novos = 0;
    for (const ev of events) {
      const id = ev.event_id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      all.push(ev);
      novos++;
    }

    const last = events[events.length - 1];
    const lastDth = last?.event_dth;
    if (!lastDth || lastDth === cursor) break;
    cursor = lastDth;

    if (events.length < 100) break;
    if (novos === 0) break;
  }

  return all;
}

/**
 * Confirma leitura dos eventos (ACK).
 */
async function ackEventos(eventIds) {
  if (!eventIds?.length) return;
  await client.post(
    "/orders/delivery/ack_events/",
    { storeCNPJ: STORE_CNPJ, events: eventIds },
    { headers: { "Content-Type": "application/json" } }
  );
}

module.exports = { buscarEventosEstoque, ackEventos };
