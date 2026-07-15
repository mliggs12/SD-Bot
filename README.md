# SD-Bot

Bot for automating various Service Desk functions. Runs as an **unpacked
Chrome extension** — it is not published to the Chrome Web Store, and doesn't
need to be.

## How the pieces fit together

- `src/` — TypeScript source. Chrome cannot run this directly.
- `dist/` — the compiled extension that Chrome actually executes, produced by
  `npm run build`. **It is committed to the repo**, so pulling the repo always
  delivers a ready-to-load, up-to-date build.
- `manifest.json` (repo root) — points Chrome at the files in `dist/`.

## Install (one time)

1. Clone the repo
2. Open `chrome://extensions`, enable **Developer mode**
3. Click **Load unpacked** and select the **repository root folder**
   (the folder containing `manifest.json` — `dist/` also works as a
   standalone alternative)

## Update (after changes are merged)

1. `git pull`
2. `chrome://extensions` → click the reload icon (⟳) on SD Bot
3. Open the side panel and confirm the footer shows the expected version and
   build timestamp

No build step needed — the compiled `dist/` comes with the pull. Chrome only
re-reads the files on reload, which is why step 2 is always required.

## Developing

Only needed if you are editing source yourself:

```bash
npm install        # once
npm run build      # compile src/ -> dist/ (production)
npm run start      # watch mode: rebuilds on every save
```

After any build, reload the extension in Chrome to pick up the new code.
Commit the regenerated `dist/` together with your source changes.

See [claude.md](claude.md) for architecture and development details.
