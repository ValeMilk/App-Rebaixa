const fs = require('fs');
const path = 'frontend/src/app/(app)/encartes/[id]/page.jsx';
let c = fs.readFileSync(path, 'utf8');

// Substituir o header do card (nome + lixeira) + remover bloco custo promo do rodapé
const oldHeader = `                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-slate-800 text-sm leading-snug">{it.produto}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">Cód {it.produtoCodigo || '—'}</div>
                          </div>
                          {encarte.podeEditar && (
                            <button
                              onClick={() => removerItem(String(it._id))}
                              disabled={removendoId === String(it._id)}
                              className="h-8 w-8 rounded-xl bg-red-50 flex items-center justify-center text-red-400 hover:bg-red-100 transition disabled:opacity-40 shrink-0">
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>`;

const newHeader = `                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-slate-800 text-sm leading-snug">{it.produto}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">Cód {it.produtoCodigo || '—'}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {it.custoPromo != null && (
                              <div className="text-right">
                                <div className="text-[9px] text-emerald-600 font-semibold uppercase tracking-wide leading-none mb-0.5">Custo Promo</div>
                                <div className="text-sm font-bold text-emerald-600 leading-none">{fmtBRL(it.custoPromo)}</div>
                              </div>
                            )}
                            {encarte.podeEditar && (
                              <button
                                onClick={() => removerItem(String(it._id))}
                                disabled={removendoId === String(it._id)}
                                className="h-7 w-7 rounded-lg bg-red-50 flex items-center justify-center text-red-400 hover:bg-red-100 transition disabled:opacity-40">
                                <TrashIcon className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>`;

if (!c.includes(oldHeader)) { console.error('HEADER NOT FOUND'); process.exit(1); }
c = c.split(oldHeader).join(newHeader);

// Remover bloco verde custo promo do rodapé
const oldFooter = `                          {it.custoPromo != null && (
                            <div className="col-span-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-1.5 flex items-center justify-between">
                              <div>
                                <div className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wide">Custo Promo</div>
                                <div className="text-[10px] text-slate-400">Últ. Compra − Sellout</div>
                              </div>
                              <div className="text-sm font-bold text-emerald-600">{fmtBRL(it.custoPromo)}</div>
                            </div>
                          )}`;

if (!c.includes(oldFooter)) { console.error('FOOTER NOT FOUND'); process.exit(1); }
c = c.split(oldFooter).join('');

fs.writeFileSync(path, c, 'utf8');
console.log('OK length=' + c.length);
