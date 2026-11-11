# Lucky Lines

A personal Android app for the four UK National Lottery draw games: Lotto, EuroMillions, Thunderball and Set For Life. Built for two people who want to see the same picks, send lines to each other and keep an honest record of what they've spent and won.

## What it does

- Results for every draw, kept up to date from the official National Lottery feed, with full history back to each game's start (3,222 Lotto, 1,997 EuroMillions, 4,006 Thunderball and 799 Set For Life draws at build time).
- Hot, cold and longest-absent numbers, a frequency chart, pairs, odd/even and sum patterns, and a fairness test on the draw machine.
- Three picks per draw: one higher-confidence pick plus a "hot run" and a "due a turn" line. Picks are worked out once per draw by the results job, so both phones always show the same lines.
- A value check on every draw. When a game the user doesn't normally play is worth noticeably more than usual, or Lotto hits a must-be-won roll-down, the home screen suggests having a go.
- Stake per line, the full prize table with odds, and the real winners and prize per winner from the last draw.
- "Did you play?" prompts after each draw, a money record by week, month, year and all time, and a by-game breakdown.
- Send lines to a friend as a WhatsApp link that opens straight into their app.
- Draw-day reminders and win alerts on Android.

Every combination has the same odds of being drawn. The picks fit the shape of past winning lines and avoid numbers most players choose (birthdays, patterns, last week's numbers), which makes a shared jackpot less likely. They do not change the odds. The fairness test on 1,201 Lotto draws comes back clean (p = 0.98).

## How it fits together

```
GitHub Actions (update-data.yml, 4 times a day)
  -> pipeline/update.mjs: official feed + lottery.co.uk year archive
  -> docs/data/*.json: history, summary, frozen picks, rules
        |
        v  (raw.githubusercontent.com, read by both phones)
Android app (android/) = WebView shell + web/ app + background workers
  - WorkManager: reminders on draw days, hourly results check for win alerts
  - Share links land on docs/share.html (GitHub Pages) -> "Open in Lucky Lines"
```

`web/engine/` holds the rules, odds, matching, analysis, picks and value maths. The same files run in the app and in the pipeline. `android/.../Matcher.kt` is the Kotlin twin of `match.js` for win alerts, driven by the same `rules.json`.

## Local development

```bash
npm test
```

```bash
node scripts/serve.mjs
```

Then open http://127.0.0.1:8020/web/. The dev server reads `docs/data/` straight from the repo.

```bash
node pipeline/update.mjs
```

This fetches the latest results and rebuilds picks. `node pipeline/backfill.mjs` reloads full history (about 2 minutes, polite pace).

This laptop cannot run Gradle (endpoint security blocks the JDK's loopback pipe), so the APK is only built in GitHub Actions.

## One-time setup on GitHub

1. Create a **public** repository `b3Ed/lucky-lines` (public so both phones can read the data and download the APK without signing in). If it lives somewhere else, change `OWNER`/`REPO` in `web/config.js` and the host in `AndroidManifest.xml` and `docs/share.html`.
2. Push this folder to it on `main`.
3. Settings > Secrets and variables > Actions: add `KEYSTORE_B64` (contents of `signing/KEYSTORE_B64.txt`) and `KEYSTORE_PASSWORD` (contents of `signing/KEYSTORE_PASSWORD.txt`). The `signing/` folder is git-ignored and must never be committed. Keep a copy somewhere safe: lose it and future updates need an uninstall.
4. Settings > Pages: deploy from branch `main`, folder `/docs`. This hosts the share page.
5. Actions: run "Update results" once, then "Build Android app". The APK lands on the `latest` release.
6. On each phone, open `https://github.com/b3Ed/lucky-lines/releases/latest/download/LuckyLines.apk`, allow installs from the browser, install, and allow notifications.

Your lines and money record live on the phone. Use Settings > Save backup before any reinstall.
