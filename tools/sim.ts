// In-process run of Strategy on the kit engine, for sweeps and trade inspection.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { loadDev, helloFor, ROOT } from './grade.ts';
import { BotState } from '../vendor/makefun-bot.ts';
import { Strategy, type Config } from '../strategy.ts';
const SRC = (p: string) => pathToFileURL(join(ROOT, 'harness-src', p)).href;
const { ReplayEngine } = await import(SRC('sim/engine.ts'));
const { maxDrawdown9, countedRoundTrips } = await import(SRC('sim/metrics.ts'));

export const ds = loadDev();
const created = new Map<string, number>();
for (const e of ds.dataset.events) if (e.event === 'CreateEvent') created.set(e.mint, e.slot);
const slots = [...created.values()].sort((a, b) => a - b);
const MID = slots[slots.length >> 1];
const fold = (m: string) => parseInt(createHash('sha256').update('salt' + m).digest('hex').slice(0, 8), 16) % 4;

export function simulate(cfg: Partial<Config>) {
  const hello = helloFor(ds.seed, ds.sample);
  const engine = new ReplayEngine(ds.dataset, hello, { schemaCheck: false });
  const state = new BotState(hello as any);
  const strat = new Strategy(cfg);
  for (let b = engine.nextBatch(); b !== null; b = engine.nextBatch()) {
    state.applyBatch(b as any);
    const orders = state.toOrders(strat.onBatch(state, b as any));
    state.recordOrders(orders);
    engine.submit({ type: 'reply', seq: b.seq, orders });
  }
  const { run } = engine.finish();
  if (run.aborted) throw new Error('aborted ' + run.aborted);
  const per: Array<[string, number]> = run.per_token.map((t: any) => [t.mint, Number(t.realized_pnl_lamports) / 1e9]);
  const fs = [0, 0, 0, 0]; const h = [0, 0];
  for (const [m, v] of per) { fs[fold(m)] += v; h[(created.get(m) ?? 0) < MID ? 0 : 1] += v; }
  const sorted = per.map((x) => x[1]).sort((a, b) => b - a);
  const net = Number(BigInt(run.final_account.cash_lamports) - 10_000_000_000n) / 1e9;
  const dd = Number(maxDrawdown9(run.equity.map((p: any) => BigInt(p.equity_lamports)))) / 1e9;
  const counted = countedRoundTrips(run.round_trips, 10_000_000n).counted_mints;
  return { net, dd, counted, trips: run.round_trips.length, wins: run.round_trips.filter((t: any) => BigInt(t.pnl_lamports) > 0n).length, fs, h, top3: sorted.slice(0, 3).reduce((a, b) => a + b, 0), run, per };
}
