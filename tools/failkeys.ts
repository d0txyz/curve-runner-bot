// Failure luck: 2% of orders fail on chain, drawn from a key that is public on the dev window and
// secret on the final one. This replays the dev day under many keys to show how much of the score
// depends on which orders happened to fail. Usage: node tools/failkeys.ts [keys] [config json]
import { createHash } from 'node:crypto';
import { simulate } from './sim.ts';

const keys = Number(process.argv[2] ?? 20);
const cfg = JSON.parse(process.argv[3] ?? '{}');
const base = simulate(cfg);
console.log('dev key', 'net', base.net.toFixed(3), 'dd', base.dd.toFixed(3), 'counted', base.counted);

const nets: number[] = [];
let maxDd = 0;
let bad = 0;
for (let i = 0; i < keys; i += 1) {
  const key = BigInt('0x' + createHash('sha256').update(`failkey${i}`).digest('hex').slice(0, 16)).toString();
  const r = simulate(cfg, key);
  nets.push(r.net);
  if (r.dd > maxDd) maxDd = r.dd;
  if (r.counted < 20 || r.dd > 0.5) bad += 1;
  console.log(i, 'net', r.net.toFixed(3), 'dd', r.dd.toFixed(3), 'counted', r.counted, 'top3', r.top3.toFixed(2));
}
nets.sort((a, b) => a - b);
const at = (q: number) => nets[Math.min(nets.length - 1, Math.floor(q * nets.length))]!.toFixed(3);
console.log('keys', keys, 'mean', (nets.reduce((s, x) => s + x, 0) / nets.length).toFixed(3), 'worst', nets[0]!.toFixed(3), 'p10', at(0.1), 'median', at(0.5), 'p90', at(0.9), 'best', nets[nets.length - 1]!.toFixed(3), 'max dd', maxDd.toFixed(3), 'non-compliant', bad);
