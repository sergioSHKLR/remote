# REMOTE (formerly RemIR)

Lifelike TV and AC remotes for a USB IR dongle (Hrebos / ElkSmart, USB vendor `0x045C`), driven from the browser over WebUSB.

**Live:** https://sergioshklr.github.io/remote/ (the old `/remir/` URL redirects here)

## Where this came from

Recovered on **Nov 17, 2026** from the orphaned app at `remir.grok.me` (**v35**) after the grok.me dashboard that owned it disappeared. Sources:

- The live client bundle (`routes-C1j-SoCt.js`) and stylesheet (`styles-Cd7ZJrEu.css`), kept for reference in [`recovered/live-v35/`](recovered/live-v35/) together with the rendered DOM of the main and Guide screens.
- Live exports of the three built-in skins (`src/skins/*.irskin.json`: Samsung BN59-01199F, LG TV, Homeco).
- The older private `ir-bench` repo (Nov 15) for readable source, updated to match v35.

The app logic was ported from the live bundle back into readable TypeScript/React. The stylesheet is the live v35 CSS, unchanged.

## What changed from grok.me

- No sign-in, no server. All data (custom skins, active remote, AC state, M1–M3 memories, Guide channel list, dongle encoding, flip) stays in this browser's `localStorage`.
- Guide listings: the live app fetched them through a grok.me server function. This copy calls the same public source, [GradeTV](https://gradetv.net) (`/api/programacao/{slug}`), straight from the browser.
- Weather card under the AC remote: the live server function's source was not in the client bundle. This copy uses [Open-Meteo](https://open-meteo.com) for Itajaí.
- grok.me auth, the preview-host bridge, PWA install pages and database migrations are gone.

## Use

Open the live URL in Chrome (desktop or Android). Plug in the dongle and tap **Connect**. WebUSB needs HTTPS, which GitHub Pages provides.

- **Samsung / AC / LG**: built-in remotes. **Guide**: Itajaí open-air lineup; tap a row to type the channel number on the TV remote.
- **M1–M3**: tap an empty one to record, press keys, tap again to save. Tap a saved one to replay (1 s apart). Hold to clear.
- **Skins**: new blank, import/download `.irskin.json`, or a photo skin with draggable hotspots. **Design**: edit keys, colors, address, AC protocol, learn codes.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/remote/
npm test
npm run lint
npm run build    # dist/, deployed by .github/workflows/pages.yml on push to main
```
