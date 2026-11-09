// Rolling origins: start the replay at different hours of the window, so a config is judged on
// many starting points and not only on the one day as a whole. A late start has no earlier profit
// to cushion a bad run, which is what the brake and the exposure guard have to survive.
// Usage: node tools/origins.ts '<json array of [name, config]>' [hours csv]
import { ds, simulate } from './sim.ts';

const list = JSON.parse(process.argv[2] ?? '[["default",{}]]') as Array<[string, Record<string, number>]>;
const hours = (process.argv[3] ?? '0,3,6,9,12,13,14,15,18').split(',').map(Number);
const all = ds.dataset.events;
const t0 = all[0].block_time as number;

console.log('config'.padEnd(26), hours.map((h) => `h${h}`.padStart(13)).join(''), '   mean  worst  maxdd');
for (const [name, cfg] of list) {
  const cells: string[] = [];
  const nets: number[] = [];
  let maxDd = 0;
  for (const h of hours) {
    ds.dataset.events = all.filter((e: any) => e.block_time >= t0 + h * 3600);
    const r = simulate(cfg);
    nets.push(r.net);
    if (r.dd > maxDd) maxDd = r.dd;
    cells.push(`${r.net.toFixed(2)}/${r.dd.toFixed(2)}`.padStart(13));
  }
  ds.dataset.events = all;
  const mean = nets.reduce((s, x) => s + x, 0) / nets.length;
  console.log(name.padEnd(26), cells.join(''), mean.toFixed(2).padStart(7), Math.min(...nets).toFixed(2).padStart(6), maxDd.toFixed(2).padStart(6));
}
