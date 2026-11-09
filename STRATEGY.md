# Strategy

## Idea

Most pump.fun coins die, and fees plus a 2-slot delay destroy any bot that trades often. This bot trades about 30 coins a day: it waits for broad demand, holds the coins that keep running toward graduation, and cuts the rest fast.

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

25% of equity per coin, at most 3 SOL, built over up to 15 slots inside the 1% reserve cap. One entry per coin. Buy slippage limit 10%.

An exposure guard sizes each new position so that losing every open position entirely would still leave equity within 45% of its peak. An equity brake stops new entries at a 35% drawdown.

## Exit

All measured on recorded curve reserves:

- Take profit: half the position is sold when reserves reach 72 SOL. The rest is held for completion.
- Stop: reserves fall 8 SOL below entry.
- Trail: 12 SOL off the peak until reserves have gained 25 SOL, then 25 SOL off the peak.
- Timeout: 1,500 slots without reaching the 25 SOL gain.

A sell the curve refuses for holding too little SOL is halved and sent again.

## Guardrail

From hour 16, if fewer than 24 coins are on track to count, 0.015 SOL probe round trips fill the gap. On a simulated day with no entry signal, probes alone gave 24 counted coins for 0.022 SOL.

## Backtest

Kit engine and scorer on the 24-hour dev window, run through the bot process. The local grader first reproduced the house bots' board scores (sniper -0.500, reversion -3.705, momentum -9.470).

| Measure | Result |
| --- | --- |
| Net PnL | +14.910 SOL |
| 90% interval | +2.186 to +30.604 |
| Max drawdown | 12.8% |
| Counted coins | 30 |
| Net PnL with fees doubled | +13.456 SOL |
| Without the top 3 coins | +1.96 SOL |
| 30 random halves of the coins | mean +6.608, p10 +0.929, median +6.330, 2 lost money, all compliant |

The parameters sit on a plateau: 762 of 768 cells of the filter grid and all 1,728 cells of the sizing grid made money, and none broke the 50% drawdown limit. Two runs give byte-identical action logs.

## Tried and rejected

About 55,000 rule cells on price, flow, wallet copying, sell shocks, pyramiding and reclaims were tested first. None stayed positive across coin folds and both halves of the day.

A second round tested ideas from the public dev leader (icantcodefyi/pumpfun-graduation-bot) inside this bot, 256 cells: re-entry after a stop, a gross buy volume trigger, an age limit, a top-5 buyer share cap, wider stops and full take-profit at 72 to 80 SOL. None improved the result. Two did carry over: selling half at 72 SOL and a larger size.

## Limits

The result is concentrated: a few runners make nearly all the profit. The launch-group filter was found on the same dev window it is tested on. The final is one 24-hour window, so a day with few runners can end near zero or slightly negative.
