# PixelProTech Remote Assistant

Installable, offline-capable PWA for remote device diagnostics. Pure HTML5 / CSS3 / vanilla JS — no build step, no frameworks, no external dependencies.

## Project structure
```
index.html          Single-page app shell (all panels)
style.css            Dark HUD theme, responsive layout, print stylesheet
script.js            All app logic — device detection, hardware tests, PWA install, AI diagnostic engine
manifest.json         PWA manifest (icons, shortcuts, display mode)
service-worker.js     Offline app-shell caching + update flow
offline.html          Fallback page shown when offline and uncached
icons/                Full icon set (16→512px, maskable variants, favicon.ico)
```

## Deploy on GitHub Pages
1. Push this folder to a repository (root or `/docs`).
2. Repo → Settings → Pages → deploy from that branch/folder.
3. **PWAs require HTTPS** (or `localhost`). GitHub Pages serves HTTPS by default, so installability works out of the box once the site is live.
4. If you serve from a subpath (`username.github.io/repo/`), the manifest's `start_url` and `scope` are already relative (`./`), so no changes needed.

## Installing the app
- **Chrome / Edge (Windows, macOS, Linux, Android):** an "Install App" button appears in the top bar once the browser fires its install prompt; the browser's own address-bar install icon also works.
- **Safari on iPhone/iPad:** iOS doesn't support automatic install prompts — the app shows a one-time banner: tap **Share → Add to Home Screen**.
- **Safari on macOS / Firefox:** use the browser's native "Add to Dock" / "Install Site as App" option from the menu bar where available; the app still runs fully in-tab and offline otherwise.

## Permissions
Camera, microphone, GPS, USB, Bluetooth and notifications are only ever requested at the moment you press the matching **Start / Request** button on that panel — never on page load.

## Notes on scope
- "Generate PDF Report" opens the browser print dialog with a formatted report layout; choose **Save as PDF** as the destination on any OS.
- Network download/upload figures are a local in-browser simulation (no external speed-test server is reachable from a static site), useful as a relative check rather than an absolute ISP measurement.
- The printed report includes a deterministic scan-code tied to the session ID for ticket lookup, not a standards-compliant QR code.
