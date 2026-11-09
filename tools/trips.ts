// Prints each round trip of a configuration, with reserves at entry and exit.
import { simulate, ds } from './sim.ts';
const cfg = JSON.parse(process.argv[2] ?? '{}');
const r = simulate(cfg);
console.log(JSON.stringify({ net: r.net, dd: r.dd, counted: r.counted, trips: r.trips, wins: r.wins, fs: r.fs, h: r.h, top3: r.top3 }));
const rAt = new Map<string, Array<[number, number]>>();
for (const e of ds.dataset.events) if (e.event === 'TradeEvent') { if (!rAt.has(e.mint)) rAt.set(e.mint, []); rAt.get(e.mint)!.push([e.slot, Number(e.real_sol_reserves) / 1e9]); }
const at = (m: string, s: number) => { let v = 0; for (const [a, b] of rAt.get(m) ?? []) { if (a > s) break; v = b; } return v; };
console.log('pnl paid openR closeR dur_slots');
for (const t of r.run.round_trips) console.log((Number(t.pnl_lamports) / 1e9).toFixed(3), (Number(t.bought_lamports) / 1e9).toFixed(3), at(t.mint, t.opened_slot).toFixed(1), at(t.mint, t.closed_slot).toFixed(1), t.closed_slot - t.opened_slot, t.mint.slice(0, 6));
