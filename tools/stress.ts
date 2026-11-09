// Stress on coin luck: replay random subsets of the window's coins, and a day with no entry signal
// at all, to see how much of the score depends on particular coins and whether the guardrail probes
// reach 20 counted coins alone. Usage: node tools/stress.ts [draws] [share] [config json]
import { createHash } from 'node:crypto';
import { ds, simulate } from './sim.ts';

const draws = Number(process.argv[2] ?? 30);
const share = Number(process.argv[3] ?? 0.5);
const cfg = JSON.parse(process.argv[4] ?? '{}');
const all = ds.dataset.events;

const bare = simulate({ ...cfg, dR: 1000, volMin: 0 });
console.log('no hot coins', JSON.stringify({ net: bare.net.toFixed(3), dd: bare.dd.toFixed(3), counted: bare.counted, trips: bare.trips }));

const nets: number[] = [];
let compliant = 0;
for (let i = 0; i < draws; i += 1) {
  const keep = (m: string) => parseInt(createHash('sha256').update(`draw${i}\0${m}`).digest('hex').slice(0, 8), 16) / 2 ** 32 < share;
  ds.dataset.events = all.filter((e: any) => keep(e.mint));
  const r = simulate(cfg);
  nets.push(r.net);
  if (r.counted >= 20 && r.dd <= 0.5) compliant += 1;
  console.log(i, 'net', r.net.toFixed(3), 'dd', r.dd.toFixed(3), 'counted', r.counted, 'top3', r.top3.toFixed(2));
}
nets.sort((a, b) => a - b);
const at = (q: number) => nets[Math.min(nets.length - 1, Math.floor(q * nets.length))]!.toFixed(3);
console.log('mean', (nets.reduce((s, x) => s + x, 0) / nets.length).toFixed(3), 'worst', nets[0]!.toFixed(3));
console.log('share', share, 'draws', draws, 'p10', at(0.1), 'median', at(0.5), 'p90', at(0.9), 'losers', nets.filter((x) => x <= 0).length, 'compliant', compliant);
