// Entry point for the agent-fun/replay/v2 protocol: one reply per slot batch, orders from strategy.ts.
import { runBot } from './vendor/makefun-bot.ts';
import { Strategy } from './strategy.ts';

const strategy = new Strategy();
await runBot({ onBatch: (state, batch) => strategy.onBatch(state, batch) });
