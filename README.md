# makefun-token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/yuseisako222-arch/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/yuseisako222-arch/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

**Token Radar** — a launch radar for protocols that have no token yet. It reads the sealed DefiLlama snapshot, covers the whole 40-protocol watchlist (and ranks 200 protocols in all), and values each one the way the market values its launched peers: TVL × the median market-cap/TVL multiple of token-bearing protocols in the same category (shrunk toward the global median of 0.169× when a category has few peers), adjusted transparently for 7-day growth, listing age and chain breadth. Every row shows its full model breakdown and peer context, plus a five-step farm plan from a category playbook with realistic costs, times and an honest risk note — points and airdrops are never guaranteed. The dashboard is fully static and offline: search, category and chain filters, sorting, and a detail view for every protocol.

## Run it

```sh
node main.ts --input <dir containing snapshot.json>
# writes board.json, data.js, dashboard/ and dossier.json to /output
# (or $MAKEFUN_OUTPUT_DIR); open dashboard/index.html to browse the board
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=9vf7ext6&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
