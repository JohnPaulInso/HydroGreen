# HydroTrack 🌱

A fully self-contained hydroponic tower manager with real-time Firebase sync, offline support, and Android APK capability.

---

## 🚀 Quick Start

### Run in Browser
Open `index.html` in any modern browser (Chrome, Edge, Firefox, Safari).

### Build Android APK
Run this script and follow the instructions:
```bash
BUILD-NOW.bat
```

📚 **Full documentation:** See [`docs/`](docs/) folder
- **[Build Guide](docs/BUILD_IN_ANDROID_STUDIO_NOW.md)** - How to build your APK
- **[Documentation Index](docs/INDEX.md)** - All guides and references

---

## ✨ Features

- **Offline-First:** Works without internet, all assets bundled
- **Real-Time Sync:** Firebase Firestore integration with live updates
- **Tower Management:** 24-pocket hydroponic tower with visual interface
- **Growth Tracking:** Stage-based plant progression with illustrations
- **Photo Gallery:** Unlimited photo storage with compression
- **Multi-Select:** Bulk operations on pockets and photos
- **Notifications:** Smart reminders for tower maintenance
- **PWA Ready:** Installable as Progressive Web App
- **Android APK:** Full native Android app support via Capacitor

---

## 📱 What's Bundled (Fully Offline)

- `css/tailwind.css` - Locally compiled Tailwind (no CDN)
- `css/app.css` - Custom styles for tower diagram, modals, animations
- `js/icons.js` - Lucide icons inlined as SVG strings
- `js/plants.js` - Custom SVG illustrations for growth stages
- `js/app.js` - All application logic
- `js/cloud.js` - Firebase sync integration
- `assets/fonts/` - Montserrat font family (self-hosted)
- `assets/icons/` - PWA icons (192, 512, maskable)

---

## 🏗️ Tower Configuration

- **8 rows × 3 columns = 24 pockets** (matches physical build)
- Visual tower drawing resembling actual product
- Add/remove rows dynamically
- Three selection modes: tap, drag, or select-all
- Real-time growth stage visualization in each pocket
- Search/filter by variety

---

## 💾 Data Persistence

### Local Storage (Default)
Everything saved to browser's `localStorage` - works fully offline.

### Firebase Sync (Optional)
Real Firestore integration with live sync across devices:

1. Create Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Firestore Database** and **Anonymous Authentication**
3. Set Firestore security rules (see [Firebase Setup Guide](docs/FIREBASE_SETUP.md))
4. In app: **Grower Tools → Firebase Live Sync** → paste config → Connect

Features:
- Real-time sync across all devices/tabs
- Debounced writes (~600ms)
- Live status indicator (offline/connecting/synced/error)
- Automatic conflict resolution

---

## 📸 Photo Management

- **Unlimited photos** via Firestore subcollections
- Automatic image compression (max 1200px, 80% quality)
- Photo detail modal with swipe-to-close
- Multi-select with long-press + drag
- Delete confirmation modal
- File size display

---

## 🔔 Notifications

Automatic reminders for:
- 7AM sun exposure
- 11AM heat check
- 6PM darkness
- Rain & wind alerts

Uses browser Notification API - permission requested on first plant.

---

## 📦 Build Android APK

### Prerequisites
- Android Studio installed
- Node.js and npm

### Build Steps

**Option 1: Automated Script**
```bash
BUILD-NOW.bat
```

**Option 2: Manual**
1. Open Android Studio
2. File → Open → Select `android` folder
3. File → Settings → Gradle → Set JDK to "Embedded JDK"
4. File → Sync Project with Gradle Files
5. Build → Build Bundle(s) / APK(s) → Build APK(s)
6. Find `hydrotrack.apk` in `android/app/build/outputs/apk/debug/`

📖 **Detailed guide:** [docs/BUILD_IN_ANDROID_STUDIO_NOW.md](docs/BUILD_IN_ANDROID_STUDIO_NOW.md)

---

## 🎨 Design

- **Font:** Montserrat (self-hosted, all weights)
- **Colors:** Green/emerald theme matching branding
- **Mobile-First:** Touch-optimized, no tap delay
- **Animations:** Smooth transitions, slide-in/fade effects
- **Overscroll:** Disabled for native app feel

---

## 🛠️ Tech Stack

- **Frontend:** Vanilla JavaScript (no framework)
- **Styling:** Tailwind CSS + custom CSS
- **Icons:** Lucide (inlined SVGs)
- **Storage:** localStorage + Firestore
- **Auth:** Firebase Anonymous Auth
- **PWA:** Service Worker + Web Manifest
- **Mobile:** Capacitor for Android APK
- **Notifications:** Browser Notification API

---

## 📁 Project Structure

```
HydroTrack/
├── BUILD-NOW.bat                # Build APK script
├── README.md                    # This file
├── index.html                   # Main app entry
├── manifest.json                # PWA manifest
├── service-worker.js            # Service worker for offline
├── docs/                        # All documentation
│   ├── INDEX.md                # Documentation index
│   ├── BUILD_*.md              # Build guides
│   ├── *_SETUP.md              # Setup guides
│   └── *.md                    # Feature documentation
├── android/                     # Capacitor Android project
├── css/
│   ├── app.css                 # Custom styles
│   └── tailwind.css            # Tailwind build
├── js/
│   ├── app.js                  # Main application
│   ├── cloud.js                # Firebase sync
│   ├── icons.js                # Icon definitions
│   ├── plants.js               # Growth stage SVGs
│   ├── weather.js              # Weather logic
│   └── notifications.js        # Notification system
└── assets/
    ├── fonts/                  # Montserrat fonts
    └── icons/                  # PWA icons
```

---

## 📚 Documentation

All guides are in the [`docs/`](docs/) folder:

### Getting Started
- [Documentation Index](docs/INDEX.md)
- [Start Here](docs/START_HERE.md)

### Building APK
- [Build in Android Studio NOW](docs/BUILD_IN_ANDROID_STUDIO_NOW.md) ⭐
- [Build with Android Studio](docs/BUILD_WITH_ANDROID_STUDIO.md)
- [Build Issue Solutions](docs/BUILD_ISSUE_SOLUTION.md)

### Setup & Configuration
- [Firebase Setup](docs/FIREBASE_SETUP.md)
- [Google Auth Setup](docs/GOOGLE_AUTH_SETUP.md)
- [Logo Integration](docs/LOGO_INTEGRATION_GUIDE.md)

### Features
- [Unlimited Photos Solution](docs/UNLIMITED_PHOTOS_SOLUTION.md)
- [Photo Modal Sync](docs/PHOTO_MODAL_SYNC_GUIDE.md)
- [Image Compression](docs/IMAGE_COMPRESSION_FIX.md)

---

## 🎯 Growth Stages

Six stages with custom SVG illustrations:

1. **Germination** (Days 0-7)
2. **Cotyledon** (Days 7-14)
3. **Thinning** (Days 14-21)
4. **Transplant** (Days 21-28)
5. **Vegetative** (Days 28-60)
6. **Harvest** (Day 60+)

Each pocket shows current stage illustration and countdown to next transition.

---

## 🔄 Real-Time Features

- Live sync across devices when Firebase connected
- Status indicator (dot in sidebar)
- Automatic reconnection on network restore
- Optimistic UI updates
- Conflict-free merging

---

## 🌐 Browser Support

- Chrome/Edge (Chromium): Full support
- Firefox: Full support
- Safari: Full support
- Mobile browsers: Full support with touch gestures

---

## 💡 Tips

- **First time?** Read [docs/START_HERE.md](docs/START_HERE.md)
- **Building APK?** Run `BUILD-NOW.bat`
- **Need help?** Check [docs/INDEX.md](docs/INDEX.md) for all guides
- **Local dev?** Run `python3 -m http.server 8000` and visit http://localhost:8000

---

## 📄 License

Private project - All rights reserved.

---

## 🚀 Ready to Build?

```bash
BUILD-NOW.bat
```

Then follow the on-screen instructions!

For questions, see the [documentation](docs/INDEX.md).
