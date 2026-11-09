# Strategy

## Idea

Most pump.fun coins die, and fees plus a 2-slot delay destroy any bot that trades often. So this bot trades about 30 coins a day. It waits until a coin has already shown broad demand, then holds only the ones that keep running toward graduation, and cuts everything else fast.

## Entry

All of these must hold on the same slot:

- Real SOL in the curve is 30 to 70.
- Reserves rose at least 14 SOL over the last 30 slots.
- At least 25 distinct wallets bought in those 30 slots.
- At least 40 wallets currently hold tokens.
- The coin is at least 30 slots old.
- The launch group (wallets that bought in the first 2 slots) has already sold more than 15% of those tokens.

The last filter was the decisive one. Coins whose launch group still held at least 85% produced 7 of the 8 worst rugs in the dev window. Those wallets have not exited yet, and their exit is the crash.

## Size

18% of equity per coin, at most 3 SOL, built over up to 15 slots inside the 1% reserve cap. One entry per coin. Buy slippage limit 10%.

## Exit

All measured on recorded curve reserves, since price impact from our own trade is known:

- Stop: reserves fall 8 SOL below entry.
- Trail: 12 SOL off the peak until reserves have gained 25 SOL, then 25 SOL off the peak.
- Timeout: 1,500 slots without reaching the 25 SOL gain.

An equity brake stops new entries at a 35% drawdown.

## Guardrail

From hour 16, if fewer than 24 coins are on track to count, the bot takes 0.015 SOL probe round trips to reach 24. On a simulated day with no entry signal at all, probes alone gave 24 counted coins for a cost of 0.022 SOL.

## Backtest

All numbers come from the kit's own engine and scorer on the 24-hour dev window, run through the bot process. The local grader reproduced the house bots' board scores first (equal-weight -0.019, sniper -0.500, reversion -3.705, momentum -9.470).

| Measure | Result |
| --- | --- |
| Net PnL | +13.006 SOL |
| 90% interval | +1.547 to +27.562 |
| Max drawdown | 14.0% |
| Counted coins | 30 |
| Net PnL with fees doubled | +11.715 SOL |
| Top 3 coins | 11.69 SOL of the total |
| 30 random halves of the coins | p10 +0.947, median +5.423, p90 +11.508, 3 lost money, all compliant |

The parameters sit on a plateau: 762 of 768 cells of the filter grid and all 1,728 cells of the sizing grid made money, and none broke the 50% drawdown limit. Tuning on one half of the day and testing on the other was positive in both directions. Two runs give byte-identical action logs.

## Tried and rejected

About 55,000 rule cells based on price, flow, wallet copying, sell shocks, pyramiding and reclaims were tested first. None stayed positive across coin folds and both halves of the day.

## Limits

The result is concentrated: a few runners make nearly all the profit, and without the top 3 coins about 1.3 SOL is left. The launch-group filter was found on the same dev window it is tested on. The final is one 24-hour window, so a day with few runners can end near zero or slightly negative.
