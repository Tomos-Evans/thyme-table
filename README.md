# Thyme Table

A mobile-first PWA for timing a big dinner. Set when dinner is served, add each dish as a list of steps
(prep → hob → oven → rest…), and it works backwards to tell you what to do and when.

- **Now**: what to do right now, the next step with a countdown, what's cooking, and what's coming up.
- **Plan**: a timeline chart of every dish plus a step-by-step list you can tick off.
- **Dishes**: edit dishes and steps (duration, where it happens, oven temperature).
- **Settings**: dinner time, °C/°F, oven shelves and hob rings (for clash warnings), preheat time, alerts, export/import.

While cooking:
- **Running late:** tick a step off late and it offers to push the rest of that dish back. "+5 / +10 min" on a running
  step gives it more time. If a dish would miss dinner, a banner offers to move dinner; steps already under way stay put.
- **Hands-on clashes:** steps marked 🙌 *Needs you* (prep by default) are checked against the number of people cooking.
- **Alerts:** notification, chime, vibration and a spoken instruction, fired from the app while it's open.
  "Keep screen awake" keeps the phone on.
- **Calendar backup:** Settings → *Export to calendar* writes an `.ics` file with an alarm for every upcoming step, so
  you get reminders even if the app is closed (it's a snapshot, so export again after changes).

Everything is stored in `localStorage` on the device; nothing is sent anywhere.

## Develop

```sh
npm install
npm run dev      # local dev server (service worker disabled)
npm test         # scheduler tests
npm run build    # production build in dist/
npm run preview  # serve dist/ with the service worker
npm run icons    # regenerate public/icons
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes to GitHub Pages.
One-time setup: in the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
The build uses relative paths, so it works at `https://<user>.github.io/<repo>/` whatever the repo is called.
