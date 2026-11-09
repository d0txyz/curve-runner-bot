// Local grader: drives the kit's own ReplayEngine and scorer (harness-src/sim) over the dev window,
// with the dev phase seed and public fail key, because grade-local needs Docker or POSIX temp paths.
// Usage: node tools/grade.ts <path to main.ts> [--detail]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ROOT = resolve(import.meta.dirname, '..', '..');
const SRC = (p: string) => pathToFileURL(join(ROOT, 'harness-src', p)).href;
const { ReplayEngine, filterUniverse, encodeHarnessLine } = await import(SRC('sim/engine.ts'));
const { makeHello } = await import(SRC('sim/params.ts'));
const { computeMetrics, scoreActionLog } = await import(SRC('sim/metrics.ts'));

export function loadDev() {
  const kit = join(ROOT, 'kit');
  const manifest = JSON.parse(readFileSync(join(kit, 'dataset', 'manifest.json'), 'utf8'));
  const kj = JSON.parse(readFileSync(join(kit, 'kit.json'), 'utf8'));
  const events: any[] = [];
  for (const f of manifest.files) {
    for (const line of gunzipSync(readFileSync(join(kit, 'dataset', f.path))).toString('utf8').split('\n')) {
      if (line) events.push(JSON.parse(line));
    }
  }
  const excluded = manifest.excluded_mints.map((m: any) => m.mint);
  const sample = manifest.universe.sample;
  const dataset = { sha256: kj.dataset_sha256, events: filterUniverse(events, sample, excluded), excluded_mints: excluded, end_slot: manifest.window.end_slot };
  const h = createHash('sha256').update(`agent-fun/seed/v1\0${kj.seed_key}\0dev\0${kj.dataset_sha256}`).digest('hex');
  const seed = BigInt(`0x${h.slice(0, 16)}`).toString();
  return { dataset, sample, seed };
}

export function helloFor(seed: string, sample: unknown) {
  return makeHello({ seed, sample, capital_lamports: '10000000000', caps: { max_open_positions: 5, max_order_bps_of_real_reserve: 100, max_orders_per_batch: 16, shorts: false, leverage: false }, latency_slots: 2, fees: { protocol_bps_fallback: 95, creator_bps_fallback: 30, base_fee_lamports: '5000', priority_fee_lamports: '100000', failed_tx_bps: 200 } });
}

export const METRIC_PARAMS = { guardrails: { min_fills: 0, min_distinct_mints: 20, max_drawdown: '0.500000000', round_trips: { min_buy_lamports: '10000000' } }, interval: { level: '0.900000000', resamples: 1000 }, final_window: null };

export function score(run: any, ds: ReturnType<typeof loadDev>) {
  const r = scoreActionLog(ds.dataset, run.action_log, METRIC_PARAMS as any, { schemaCheck: false });
  return r.metrics as any;
}

export function brief(m: any) {
  const sol = (x: string | number) => (Number(x) / 1e9).toFixed(3);
  return { net_pnl: sol(m.net_pnl_lamports), low: sol(m.interval?.low_lamports ?? m.interval?.low ?? 0), high: sol(m.interval?.high_lamports ?? m.interval?.high ?? 0), max_dd: m.max_drawdown, fills: m.fills, round_trips: m.round_trips, win: m.win_rate, pnl_2x: sol(m.cost_sensitivity?.net_pnl_lamports ?? 0), constraints: m.constraints };
}

export async function gradeProcess(mainPath: string, ds: ReturnType<typeof loadDev>) {
  const hello = helloFor(ds.seed, ds.sample);
  const engine = new ReplayEngine(ds.dataset, hello, { schemaCheck: false });
  const child = spawn(process.execPath, [mainPath], { stdio: ['pipe', 'pipe', 'inherit'], cwd: join(mainPath, '..') });
  const rl = createInterface({ input: child.stdout! });
  const it = rl[Symbol.asyncIterator]();
  child.stdin!.write(encodeHarnessLine(engine.hello) + '\n');
  for (let b = engine.nextBatch(); b !== null; b = engine.nextBatch()) {
    child.stdin!.write(encodeHarnessLine(b) + '\n');
    const r = await it.next();
    if (r.done) throw new Error('bot closed stdout');
    engine.submitLine(r.value);
  }
  const { done, run } = engine.finish();
  child.stdin!.write(encodeHarnessLine(done) + '\n');
  child.stdin!.end();
  return run;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const t0 = performance.now();
  const ds = loadDev();
  const run = await gradeProcess(resolve(process.argv[2]), ds);
  if (run.aborted) { console.log('ABORTED', run.aborted); process.exit(1); }
  console.log(JSON.stringify(brief(score(run, ds))));
  console.log('seconds', ((performance.now() - t0) / 1000).toFixed(1));
}
