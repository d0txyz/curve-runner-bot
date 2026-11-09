// Grid sweep on the kit engine. node tools/sweep.ts <grid.json> <worker index> <workers> <out.jsonl>
import { readFileSync, appendFileSync } from 'node:fs';
import { simulate } from './sim.ts';
const [gridFile, wi, wn, out] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(gridFile!, 'utf8')) as Record<string, number[]>;
const keys = Object.keys(spec);
let cells: Array<Record<string, number>> = [{}];
for (const k of keys) cells = cells.flatMap((c) => spec[k]!.map((v) => ({ ...c, [k]: v })));
cells.forEach((cfg, i) => {
  if (i % Number(wn) !== Number(wi)) return;
  const r = simulate(cfg);
  appendFileSync(out!, JSON.stringify({ cfg, net: r.net, dd: r.dd, counted: r.counted, trips: r.trips, wins: r.wins, fs: r.fs, h: r.h, top3: r.top3 }) + '\n');
});
