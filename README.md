# HydroTrack (TowerCrop) — Offline Prototype

A fully self-contained hydroponic tower manager. No build step, no internet
connection required, no CDNs. Everything needed to run it is already inside
this folder.

## Run it
Open `index.html` in any modern browser (Chrome, Edge, Firefox, Safari).
Double-clicking the file works — nothing to install.

> Tip: some browsers restrict `localStorage` for pages opened directly via
> `file://`. If your data doesn't seem to save, either (a) it's still fine —
> most modern browsers allow it — or (b) serve the folder locally instead:
> `python3 -m http.server 8000` from inside this folder, then visit
> `http://localhost:8000`.

## What's bundled (fully offline)
- `css/tailwind.css` — a locally compiled Tailwind build (no CDN script).
- `css/app.css` — hand-written styles for the tower diagram, chips, modals, toasts.
- `js/icons.js` — the exact Lucide icons this app uses, extracted from the
  official `lucide-static` npm package and inlined as local SVG strings.
  Nothing is fetched from unpkg or any icon CDN at runtime, so icons always render.
- `js/plants.js` — original hand-built SVG illustrations for each growth stage
  (germination → cotyledon → thinning → transplant → vegetative → harvest).
  These are custom vector art, not stock photos, so there's no copyright
  concern and nothing to download.
- `js/app.js` — all application logic.

## Your tower, as configured
The sample tower ships as **8 rows × 3 columns (24 pockets)**, matching your
real build — one vertical cylinder with 8 tiers of pockets, sitting in a dark
basin with a white lid, drawn to resemble the actual product rather than an
abstract grid. Rows 1–2 are near harvest, 3–4 are mid-growth, 5–6 were just
transplanted, and 7–8 are open so you can try assigning them. Use **"Add
Row"** on the Tower page to grow it taller (any pocket count per row), or the
trash icon inside a Row's inspector to remove one.

### Selecting pockets
Three ways, depending on how many you're touching:
- **Tap** a pocket (on the drawing or in a row's chip strip) to open it and
  edit that one plant.
- **Press and hold**, then **drag** across others — mouse or touch — to
  multi-select a few, gallery-style.
- Hit **Select** above the tower to enter selection mode outright — every
  tap now just adds/removes a pocket, no holding required, and **Select
  All** grabs the whole tower in one tap. This is the fastest way to bulk
  the whole thing.

Once anything is selected, a bar at the bottom lets you bulk-assign a
variety + days-old to everything selected, or clear it all at once. It
automatically tucks itself away behind any open modal so it never overlaps
your dialogs. Type in the search box above the tower to dim every pocket
that isn't a matching variety.

Each pocket cup shows the actual growth-stage illustration from the Growth
Gallery (not a flat color dot) — tap any Growth Gallery card on the
Dashboard to see that stage's day range and what to do during it.

## Data persistence & real-time Firebase sync
Everything is saved to the browser's `localStorage` by default, through one
small `store.*` module at the top of `js/app.js` — the app works fully
offline out of the box.

**`js/cloud.js` adds genuine, working Firestore live sync** — not a stub. To
turn it on:

1. Create a Firebase project at console.firebase.google.com, add a Web app,
   and copy its config object.
2. In the project, enable **Firestore Database** and **Authentication →
   Sign-in method → Anonymous**.
3. Set Firestore rules so a signed-in (anonymous) user can only touch their
   own document, e.g.:
   ```
   match /hydrotrack_towers/{uid} {
     allow read, write: if request.auth != null && request.auth.uid == uid;
   }
   ```
4. In the app, go to **Grower Tools → Firebase Live Sync**, paste the config
   as JSON, and click Connect.

From then on: every local change is pushed to a single Firestore document
(`hydrotrack_towers/{uid}`) via `setDoc(..., {merge:true})`, debounced
~600ms. An `onSnapshot` listener keeps every open tab/device in sync in
real time — open the same URL with the same config on a second device and
changes appear instantly on both, no refresh needed. The sidebar dot (and
Tools page) shows live status: gray = offline, amber = connecting, green =
synced, orange = error. The Firebase SDK itself is only fetched (from
Google's official CDN) the moment you click Connect — the app never reaches
out to the internet otherwise.

Use **Grower Tools → Local Backup → Export Backup (JSON)** any time to
download a full snapshot regardless of sync status.

## Notifications
Reminders (7AM sun / 11AM heat / 6PM darkness, rain & wind alerts) turn on
automatically the moment you plant your first tray or pocket. Because
browsers require a real click to grant notification permission, a banner
appears on the Dashboard asking you to confirm — after that, real browser
notifications fire on schedule as long as the tab stays open. This is a
genuine `Notification` API integration, not a simulation.

## Look & feel
- **Montserrat** end to end, self-hosted (`assets/fonts/*.woff2`, real
  Firebase-safe `@font-face` rules in `css/app.css`) — no Google Fonts CDN.
- Text selection is disabled on UI chrome (buttons, labels, nav) so it feels
  like a native app rather than a webpage — inputs and textareas still
  select normally. Buttons use `touch-action: manipulation` to kill the
  300ms tap delay, and `overscroll-behavior: none` stops the rubber-band/
  pull-to-refresh bounce.

## Packaging as an APK
This is now a real installable PWA, which is what tools like PWABuilder,
Bubblewrap (Trusted Web Activity), or Capacitor expect as input:
- `manifest.json` — name, icons, `display: standalone`, theme color.
- `service-worker.js` — caches the app shell for offline use; Firebase/
  Firestore requests are always excluded so live sync never goes stale.
- `assets/icons/` — 192, 512, and a maskable 512 variant.

The service worker only registers over `http(s)://` (it's skipped on
`file://`), so serve the folder — `python3 -m http.server 8000` for local
testing — or upload it wherever you're pointing your APK wrapper at.

## Your Firebase project (pre-filled)
The **Grower Tools → Firebase Live Sync** panel already has your
`hydrotrack-2317` config pasted in — just click Connect. Before that works:
1. Firebase console → **Authentication → Sign-in method → Anonymous** → enable it.
2. Firebase console → **Firestore Database** → create it (production mode is fine).
3. Firestore → **Rules**, paste:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /hydrotrack_towers/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
Note: I left out `getAnalytics()` from your snippet — Analytics needs a
browser `measurementId` gtag context, isn't needed for the app to function,
and would be one more network call at startup. Easy to add back later if
you want it.

## Stage estimates
Every pocket and tray now shows its **next transition** — e.g. "Transplant in
2 days (Aug 10)" — computed from its planted/sown date against the standard
germination → cotyledon → thinning → transplant → vegetative → harvest
timeline. These also roll up into the Dashboard's "Upcoming Stage Changes"
card, sorted soonest-first.
