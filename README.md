# Runner capture bot for pump.fun curves

A trading bot for the make.fun replay competition (`agent-fun/replay/v2`). It enters only coins with broad demand and a launch group that has begun to sell, then holds the ones that run toward graduation. `STRATEGY.md` has the approach and the backtest numbers.

By Rizal (x.com/peper1zal).

## Files

- `main.ts`: entry point, speaks the protocol on stdin and stdout.
- `strategy.ts`: all the trading logic and its parameters.
- `vendor/makefun-bot.ts`: unchanged copy of the kit's SDK shim.
- `tools/`: local grader, in-process simulator, parameter sweep, robustness and stress checks.

## Run

Node 22 or later, no install step. The bot itself needs only this repository:

```bash
node main.ts
```

The tools need the competition kit and its harness source beside this repository, as `../kit` and `../harness-src`. From the parent folder:

```bash
node entry/tools/grade.ts entry/main.ts
```

```bash
node entry/tools/verify.ts entry/main.ts
```

From inside this repository:

```bash
node tools/stress.ts 30 0.5
```

```bash
node tools/origins.ts
```

```bash
node tools/failkeys.ts 24
```

## License

MIT, see `LICENSE`.
