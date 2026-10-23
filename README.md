# Budget

A small budget tracker that installs on an iPhone as a home-screen web app (PWA).

**Live app:** https://sebastiansglabs.github.io/budgeting-app/
No App Store and no Apple Developer account needed. Hosting on GitHub Pages is free.

## Files

- `index.html` – layout and styles
- `app.js` – all app logic (data lives in the phone's local storage)
- `sw.js` – service worker (offline support and notifications)
- `manifest.webmanifest`, `icon-*.png` – home-screen app name and icon

To change the currency or the "close to budget" threshold, edit the top of `app.js`.

## Run it on your PC

```
python -m http.server 8000
```

Then open http://localhost:8000.

## Put it on your iPhone (free, via GitHub Pages)

1. Create a new **public** repository on github.com, e.g. `budget`.
2. Upload these files to it (Add file → Upload files), or push them with git.
3. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
4. After a minute your app is at `https://<your-username>.github.io/budget/`.
5. On the iPhone, open that link in **Safari**, tap **Share → Add to Home Screen**.
6. Open **Budget** from the home screen, tap **⋯ → Budget alerts → Enable**.

Notifications only work when the app is opened from the Home Screen (iOS 16.4 or later).

## Updating

Push or upload changed files to the repo. The app picks up the new version the next time it opens with an internet connection. Your data stays on the phone.

## Good to know

- Data is stored only on the phone. Use **⋯ → Export** now and then as a backup.
- Alerts fire when you log an expense that takes a category past 80% or 100% of its budget.
- Each month starts at $0. Past months stay viewable with the ‹ arrow.
