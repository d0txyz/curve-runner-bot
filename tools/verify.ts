// Robustness checks on the real process boundary: two runs must give byte-identical action logs,
// cut-down input must not crash or abort, and each half of the window is scored as its own run.
// Usage: node tools/verify.ts <path to main.ts>
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { loadDev, gradeProcess, score, brief } from './grade.ts';

const main = resolve(process.argv[2]!);
const ds = loadDev();
const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);

function cut(from: number, to: number) {
  const events = ds.dataset.events.filter((e: any) => e.slot >= from && e.slot <= to);
  const last = events.length > 0 ? events[events.length - 1].slot : from;
  return { ...ds, dataset: { ...ds.dataset, events, end_slot: typeof ds.dataset.end_slot === 'string' ? String(last) : last } };
}

const t0 = performance.now();
const a = await gradeProcess(main, ds);
const seconds = (performance.now() - t0) / 1000;
const b = await gradeProcess(main, ds);
const same = JSON.stringify(a.action_log) === JSON.stringify(b.action_log);
console.log('determinism', same ? 'identical' : 'DIFFERENT', sha(a.action_log), sha(b.action_log), 'orders', a.action_log.length ?? 'n/a', 'seconds', seconds.toFixed(1));
console.log('full', JSON.stringify(brief(score(a, ds))));

const evs = ds.dataset.events as any[];
const lo = evs[0].slot as number;
const hi = evs[evs.length - 1].slot as number;
const mid = Math.floor((lo + hi) / 2);
for (const [name, x, y] of [['half1', lo, mid], ['half2', mid + 1, hi]] as const) {
  const sub = cut(x, y);
  const run = await gradeProcess(main, sub);
  console.log(name, 'events', sub.dataset.events.length, 'aborted', run.aborted ?? null, JSON.stringify(brief(score(run, sub))));
}
for (const n of [1, 50, 5000]) {
  const events = evs.slice(0, n);
  const sub = { ...ds, dataset: { ...ds.dataset, events, end_slot: typeof ds.dataset.end_slot === 'string' ? String(events[n - 1].slot) : events[n - 1].slot } };
  const run = await gradeProcess(main, sub);
  console.log('truncated', n, 'aborted', run.aborted ?? null, 'actions', run.action_log.length ?? 'n/a');
}
