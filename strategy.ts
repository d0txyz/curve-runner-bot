// Runner capture on pump.fun curves. Trades rarely, only coins with strong and broad buying at a
// high reserve level, and cuts failures quickly on reserve drawdown so that graduating coins carry
// the result. Reads only batch data. No clock, no randomness, no environment.
import type { Batch, BotState, OrderInput } from './vendor/makefun-bot.ts';

export interface Config {
  // Entry: real SOL in the curve inside [rLo, rHi], reserves up dR SOL over the last window of
  // wSlots slots, and at least minBuyers distinct wallets buying in that window.
  rLo: number; rHi: number; dR: number; minBuyers: number; wSlots: number;
  // A coordinated launch has few holders and is seconds old: require minHolders wallets holding
  // tokens and minAge slots since the first trade.
  minHolders: number; minAge: number;
  // Launch group: wallets that bought in the first 2 slots. Skip the coin while they still hold at
  // least this share of those tokens, because their exit is still to come.
  maxInsider: number;
  // Size: share of equity per coin, limited to maxSol SOL. Built over at most buildSlots slots.
  sizeFrac: number; maxSol: number; buildSlots: number; buySlipBps: number;
  // Exit on recorded reserves: stopR below entry, tight trail1 from peak until reserves gain gainX
  // over entry, then the wide trail2. timeOut slots without reaching gainX ends the trade.
  stopR: number; gainX: number; trail1: number; trail2: number; timeOut: number;
  // Take profit near graduation: sell tpFrac of the position when reserves reach tp1R and the rest
  // at tp2R. A coin that completes first is closed by the replay at its last price.
  tp1R: number; tpFrac: number; tp2R: number;
  // Second trigger: volMin SOL of gross buying in the window while reserves are at least volLo
  // (volMin 0 turns it off). maxAge limits entries to young coins. top5Max caps the share of all
  // buy volume that the five largest buyers hold.
  volMin: number; volLo: number; maxAge: number; top5Max: number;
  // A coin left on a stop or timeout may be entered again this many times.
  reentries: number;
  // Equity brake: new entries stop when equity falls this far under its peak.
  brakeDd: number;
  // Exposure guard: open positions plus a new one are sized so that losing lossShare of all of
  // them at once still leaves equity within ddCap of its peak (ddCap 1 turns the guard off).
  ddCap: number; lossShare: number;
  // Guardrail probes: from probeHour on, tiny round trips fill the gap to minCoins counted coins.
  minCoins: number; probeHour: number; probeSol: number; probeHold: number; probeR: number;
}

export const DEFAULTS: Config = {
  rLo: 30, rHi: 70, dR: 14, minBuyers: 25, wSlots: 30,
  minHolders: 40, minAge: 30, maxInsider: 0.85,
  sizeFrac: 0.25, maxSol: 3, buildSlots: 15, buySlipBps: 1000,
  stopR: 8, gainX: 25, trail1: 12, trail2: 25, timeOut: 1500,
  tp1R: 72, tpFrac: 0.5, tp2R: 1000,
  volMin: 0, volLo: 45, maxAge: 1e9, top5Max: 1,
  reentries: 0,
  brakeDd: 0.35,
  ddCap: 0.45, lossShare: 1,
  minCoins: 24, probeHour: 16, probeSol: 0.015, probeHold: 40, probeR: 6,
};

interface Tick { slot: number; r: number; user: string | null; q: number; }
interface Coin {
  ticks: Tick[]; r: number; traded: boolean; done: boolean; first: number;
  bal: Map<string, number>; holders: number; early: Map<string, number>; earlyTotal: number;
  // Gross SOL bought per wallet, entries taken so far, and whether a probe already used the coin.
  bought: Map<string, number>; boughtTotal: number; entries: number; probed: boolean;
}
interface Position {
  entryR: number; peak: number; start: number; target: bigint; spent: bigint; paid: bigint;
  probe: boolean; selling: boolean;
  // took: the first take-profit sell filled. partial: that sell is in flight. halve: times the next
  // sell is halved after the curve refused one for holding too little SOL.
  took: boolean; partial: boolean; halve: number;
}

const SOL = 1e9;
const toLamports = (sol: number): bigint => BigInt(Math.floor(sol * SOL));

export class Strategy {
  readonly cfg: Config;
  readonly coins = new Map<string, Coin>();
  readonly open = new Map<string, Position>();
  readonly counted = new Set<string>();
  firstTime = -1;
  lastTime = -1;
  peakEquity = 0n;

  constructor(cfg: Partial<Config> = {}) { this.cfg = { ...DEFAULTS, ...cfg }; }

  private coin(mint: string): Coin {
    let c = this.coins.get(mint);
    if (c === undefined) {
      c = { ticks: [], r: 0, traded: false, done: false, first: -1, bal: new Map(), holders: 0, early: new Map(), earlyTotal: 0, bought: new Map(), boughtTotal: 0, entries: 0, probed: false };
      this.coins.set(mint, c);
    }
    return c;
  }

  private settle(state: BotState, batch: Batch): void {
    for (const f of batch.fills) {
      const p = this.open.get(f.mint);
      if (p === undefined) continue;
      if (f.side === 'buy') {
        if (f.status === 'filled') p.paid += BigInt(f.quote_lamports);
        else p.target = p.spent; // a refused or failed buy ends the build
      } else {
        // A sell that failed is sent again on the next batch; one the curve refused for holding
        // too little SOL is halved first. A filled partial sell leaves the rest to the exit rules.
        p.selling = false;
        if (f.status === 'filled') { if (p.partial) p.took = true; }
        else if (f.status === 'rejected' && f.reason === 'max_order_size' && p.halve < 8) p.halve += 1;
        p.partial = false;
      }
    }
    const busy = new Set<string>();
    for (const q of state.pending.values()) busy.add(q.order.mint);
    for (const [mint, p] of this.open) {
      if (state.positions.has(mint) || busy.has(mint)) continue;
      const c = this.coin(mint);
      if (p.paid >= 10_000_000n) this.counted.add(mint);
      if (p.paid === 0n) {
        // Never filled: the coin may trigger again and the attempt does not count as an entry.
        c.traded = false;
        if (p.probe) c.probed = false; else c.entries -= 1;
      } else if (p.probe) {
        c.traded = false; // a probed coin stays open to a real entry
      } else if (!p.took && c.entries <= this.cfg.reentries) {
        c.traded = false; // left on a stop or timeout: it may set up again
      }
      this.open.delete(mint);
    }
  }

  private observe(batch: Batch): Set<string> {
    const moved = new Set<string>();
    const keep = this.cfg.wSlots + 2;
    for (const e of batch.events) {
      if (this.firstTime < 0) this.firstTime = e.block_time;
      this.lastTime = e.block_time;
      if (e.event === 'CompleteEvent') { this.coin(e.mint).done = true; continue; }
      if (e.event !== 'TradeEvent') continue;
      const c = this.coin(e.mint);
      c.r = Number(e.real_sol_reserves) / SOL;
      if (c.first < 0) c.first = e.slot;
      if (e.is_buy && e.slot - c.first <= 2) {
        c.early.set(e.user, (c.early.get(e.user) ?? 0) + Number(e.token_amount));
        c.earlyTotal += Number(e.token_amount);
      }
      const before = c.bal.get(e.user) ?? 0;
      const after = before + (e.is_buy ? Number(e.token_amount) : -Number(e.token_amount));
      c.bal.set(e.user, after);
      if (before <= 0 && after > 0) c.holders += 1;
      else if (before > 0 && after <= 0) c.holders -= 1;
      const sol = e.is_buy ? Number(e.quote_amount) / SOL : 0;
      if (e.is_buy) {
        c.bought.set(e.user, (c.bought.get(e.user) ?? 0) + sol);
        c.boughtTotal += sol;
      }
      c.ticks.push({ slot: e.slot, r: c.r, user: e.is_buy ? e.user : null, q: sol });
      while (c.ticks.length > 0 && c.ticks[0]!.slot < e.slot - keep) c.ticks.shift();
      moved.add(e.mint);
    }
    return moved;
  }

  private exits(state: BotState, slot: number): OrderInput[] {
    const out: OrderInput[] = [];
    for (const [mint, p] of this.open) {
      const held = state.positions.get(mint);
      const c = this.coin(mint);
      if (held === undefined || p.selling || c.done || held.token_amount === 0n) continue;
      p.peak = Math.max(p.peak, c.r);
      const age = slot - p.start;
      let leave: boolean;
      if (p.probe) {
        leave = age >= this.cfg.probeHold;
      } else {
        const ran = p.peak >= p.entryR + this.cfg.gainX;
        const trail = ran ? this.cfg.trail2 : this.cfg.trail1;
        leave = c.r <= p.entryR - this.cfg.stopR || c.r <= p.peak - trail || (!ran && age > this.cfg.timeOut) || c.r >= this.cfg.tp2R;
        if (!leave && !p.took && c.r >= this.cfg.tp1R) {
          // First take-profit: sell a share now, keep the rest for tp2R or completion.
          const part = (held.token_amount * BigInt(Math.floor(this.cfg.tpFrac * 10_000))) / 10_000n;
          if (part > 0n && part < held.token_amount) {
            p.selling = true;
            p.partial = true;
            p.target = p.spent;
            out.push({ side: 'sell', mint, token_amount: part, max_slippage_bps: 10_000 });
            continue;
          }
          leave = part > 0n;
        }
      }
      if (!leave) continue;
      p.selling = true;
      p.target = p.spent;
      const cut = held.token_amount >> BigInt(p.halve);
      out.push({ side: 'sell', mint, token_amount: cut > 0n ? cut : held.token_amount, max_slippage_bps: 10_000 });
    }
    return out;
  }

  private flow(c: Coin, slot: number): { rise: number; buyers: number; vol: number } {
    const from = slot - this.cfg.wSlots;
    const seen = new Set<string>();
    let base = c.r;
    let found = false;
    let vol = 0;
    for (const t of c.ticks) {
      if (t.slot < from) continue;
      if (!found) { base = t.r; found = true; }
      if (t.user !== null) seen.add(t.user);
      vol += t.q;
    }
    return { rise: c.r - base, buyers: seen.size, vol };
  }

  // Share of all buy volume so far that the five largest buyers account for.
  private top5(c: Coin): number {
    if (c.boughtTotal <= 0) return 1;
    const top = [...c.bought.values()].sort((a, b) => b - a).slice(0, 5);
    let sum = 0;
    for (const v of top) sum += v;
    return sum / c.boughtTotal;
  }

  private insiderLeft(c: Coin): number {
    if (c.earlyTotal <= 0) return 0;
    let held = 0;
    for (const [w, bought] of c.early) held += Math.max(0, Math.min(bought, c.bal.get(w) ?? 0));
    return held / c.earlyTotal;
  }

  private equity(state: BotState): bigint {
    let e = state.cash;
    for (const h of state.positions.values()) e += h.cost_lamports;
    return e;
  }

  onBatch(state: BotState, batch: Batch): OrderInput[] {
    const cfg = this.cfg;
    this.settle(state, batch);
    const moved = this.observe(batch);
    const orders = this.exits(state, batch.slot);
    const caps = state.hello.caps;
    const tx = state.txFeeLamports();
    const equity = this.equity(state);
    if (equity > this.peakEquity) this.peakEquity = equity;
    const braked = Number(this.peakEquity - equity) >= cfg.brakeDd * Number(this.peakEquity);
    let free = state.freeCashLamports();
    let slots = caps.max_open_positions - state.committedPositionCount();

    // Finish building positions already started.
    for (const [mint, p] of this.open) {
      if (p.selling || p.spent >= p.target || orders.length >= caps.max_orders_per_batch) continue;
      const c = this.coin(mint);
      if (c.done || batch.slot - p.start > cfg.buildSlots || c.r < p.entryR - 1) { p.target = p.spent; continue; }
      const cap = state.maxBuyLamports(mint);
      let amount = p.target - p.spent;
      if (amount > cap) amount = cap;
      if (amount < 5_000_000n || free < amount + tx) continue;
      orders.push({ side: 'buy', mint, quote_lamports: amount, max_slippage_bps: cfg.buySlipBps });
      p.spent += amount;
      free -= amount + tx;
    }

    if (braked) return orders;
    let atRisk = 0n;
    for (const p of this.open.values()) if (!p.probe) atRisk += p.target;
    let room = (Number(equity) - (1 - cfg.ddCap) * Number(this.peakEquity)) / cfg.lossShare - Number(atRisk);
    const hours = this.firstTime < 0 ? 0 : (this.lastTime - this.firstTime) / 3600;
    const behind = hours >= cfg.probeHour && this.counted.size + this.open.size < cfg.minCoins;

    for (const mint of moved) {
      if (slots <= 0 || orders.length >= caps.max_orders_per_batch) break;
      const c = this.coin(mint);
      if (c.traded || c.done || this.open.has(mint)) continue;
      const { rise, buyers, vol } = this.flow(c, batch.slot);
      const age = batch.slot - c.first;
      const pushed = rise >= cfg.dR || (cfg.volMin > 0 && vol >= cfg.volMin && c.r >= cfg.volLo);
      const hot = c.r >= cfg.rLo && c.r <= cfg.rHi && pushed && buyers >= cfg.minBuyers && c.holders >= cfg.minHolders && age >= cfg.minAge && age <= cfg.maxAge && this.insiderLeft(c) < cfg.maxInsider && (cfg.top5Max >= 1 || this.top5(c) <= cfg.top5Max);
      const probe = !hot && !c.probed && c.entries === 0 && behind && slots > 1 && c.r >= cfg.probeR && rise > 0;
      if (!hot && !probe) continue;
      const cap = state.maxBuyLamports(mint);
      let target = probe ? toLamports(cfg.probeSol) : (equity * BigInt(Math.floor(cfg.sizeFrac * 10_000))) / 10_000n;
      const most = toLamports(cfg.maxSol);
      if (target > most) target = most;
      if (!probe && cfg.ddCap < 1 && Number(target) > room) {
        // The guard leaves less than a full position: take what fits, or skip a sliver.
        if (room * 4 < Number(target)) continue;
        target = BigInt(Math.floor(room));
      }
      const amount = target > cap ? cap : target;
      if (probe && amount < target) continue;
      if (amount < 5_000_000n || free < amount + tx) continue;
      orders.push({ side: 'buy', mint, quote_lamports: amount, max_slippage_bps: probe ? 2_000 : cfg.buySlipBps });
      c.traded = true;
      if (probe) c.probed = true; else { c.entries += 1; room -= Number(target); }
      this.open.set(mint, { entryR: c.r, peak: c.r, start: batch.slot, target, spent: amount, paid: 0n, probe, selling: false, took: false, partial: false, halve: 0 });
      free -= amount + tx;
      slots -= 1;
    }
    return orders;
  }
}
