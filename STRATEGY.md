# Strategy

## Idea

Most pump.fun coins die, and fees plus a 2-slot delay punish frequent trading. This bot trades about 30 coins a day: it waits for broad demand, holds coins that keep running toward graduation, and cuts the rest fast.

## Entry

All of these must hold on the same slot:

- Real SOL in the curve is 30 to 70.
- Reserves rose at least 14 SOL over the last 30 slots.
- At least 25 distinct wallets bought in those 30 slots.
- At least 40 wallets currently hold tokens.
- The coin is at least 30 slots old.
- The launch group (wallets that bought in the first 2 slots) has already sold more than 15% of those tokens.

The last filter was decisive. Coins whose launch group still held at least 85% produced 7 of the 8 worst rugs in the dev window: their exit is the crash.

## Size

4 SOL per coin, bought in tranches inside the 1% reserve cap over up to 15 slots. The build ends early if reserves fall 3 SOL under entry, so coins that fail at once stay small. One entry per coin.

An exposure guard sizes each new position so that losing every open position entirely leaves equity within 40% of its peak. Size therefore shrinks after losses, and trading does not stop.

## Exit

All measured on recorded curve reserves:

- Take profit: half is sold when reserves reach 72 SOL. The rest is held for completion.
- Stop: reserves fall 8 SOL below entry.
- Trail: 12 SOL off the peak until reserves have gained 25 SOL, then 25 SOL off the peak.
- Timeout: 1,500 slots without reaching the 25 SOL gain.

A sell the curve refuses for holding too little SOL is halved and sent again.

## Guardrail

From hour 16, 0.015 SOL probe round trips fill any gap to 24 counted coins. With no entry signal at all, probes alone reached 24 for 0.022 SOL.

## Backtest

Kit engine and scorer on the dev window, through the bot process.

| Measure | Result |
| --- | --- |
| Net PnL | +23.779 SOL |
| 90% interval | +5.113 to +45.952 |
| Max drawdown | 17.7% |
| Counted coins | 30 |
| Net PnL with fees doubled | +21.624 SOL |
| Without the top 3 coins | +6.75 SOL |
| 30 random halves of the coins | mean +9.824, p10 +0.925, 2 lost money, worst drawdown 30.9% |
| 9 start hours (0 to 18) | mean +10.39, worst +5.86, worst drawdown 37% |

Two runs give byte-identical action logs.

## Tried and rejected

About 55,000 rule cells on price, flow, wallet copying, sell shocks, pyramiding and reclaims came first. None held up across coin folds.

Ideas from the public dev leader (icantcodefyi/pumpfun-graduation-bot) were tested here, 256 cells: re-entry, a buy volume trigger, an age limit, a top-5 buyer cap, wider stops and full take-profit. None helped. Selling half at 72 SOL and the 4 SOL size carried over.

A hard brake at a 35% drawdown was dropped: started at hour 12, it locked the bot out after an early losing run (-1.80 SOL against +5.86 with the guard).

## Limits

A few runners make most of the profit, and the launch-group filter was found on the same window it is tested on. A day that opens with a losing run draws down 35 to 37% before recovering. A final day with few runners can end near zero or negative.
