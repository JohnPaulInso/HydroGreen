# 📦 APK Filename Configuration

## Automatic Renaming Enabled ✅

Your Android build is now configured to automatically rename APK files:

### Debug Build
- **Old name:** `app-debug.apk`
- **New name:** `hydrotrack.apk` ✨
- **Location:** `android/app/build/outputs/apk/debug/hydrotrack.apk`

### Release Build
- **Old name:** `app-release.apk`
- **New name:** `hydrotrack-release.apk` ✨
- **Location:** `android/app/build/outputs/apk/release/hydrotrack-release.apk`

---

## How It Works

The configuration in `android/app/build.gradle` automatically renames the output:

```groovy
applicationVariants.all { variant ->
    variant.outputs.all { output ->
        def buildType = variant.buildType.name
        if (buildType == "debug") {
            outputFileName = "hydrotrack.apk"
        } else if (buildType == "release") {
            outputFileName = "hydrotrack-release.apk"
        }
    }
}
```

---

## Building APKs

### Build Debug APK

**Method 1: Android Studio**
```bash
.\open-android-studio.bat
```
Then: Build → Build Bundle(s) / APK(s) → Build APK(s)

**Method 2: Command Line**
```bash
.\build-apk.bat
```

**Output:** `android/app/build/outputs/apk/debug/hydrotrack.apk`

---

### Build Release APK

**Method 1: Android Studio**
1. Open Android Studio
2. Build → Generate Signed Bundle / APK
3. Choose APK
4. Select or create keystore
5. Sign and build

**Method 2: Command Line**
```bash
cd android
.\gradlew assembleRelease
```

**Output:** `android/app/build/outputs/apk/release/hydrotrack-release.apk`

---

## File Sizes (Approximate)

| Build Type | Size | Notes |
|------------|------|-------|
| Debug | 8-12 MB | Includes debug symbols, larger |
| Release | 5-8 MB | Optimized, smaller, production-ready |

---

## Installation

### On Android Device

1. **Transfer APK:**
   - USB cable: Copy to phone storage
   - Cloud: Upload to Drive, download on phone
   - Email: Send to yourself, download

2. **Install:**
   - Open Files app on phone
   - Find `hydrotrack.apk`
   - Tap to open
   - Enable "Install from unknown sources" if prompted
   - Tap Install

3. **Launch:**
   - App appears in app drawer as "HydroTrack"
   - Open and use!

---

## Version Management

### Debug vs Release

**Debug APK (`hydrotrack.apk`):**
- ✅ For testing
- ✅ Quick builds
- ✅ Easy to install
- ❌ Larger file size
- ❌ Not for Play Store

**Release APK (`hydrotrack-release.apk`):**
- ✅ Production-ready
- ✅ Optimized & smaller
- ✅ For Play Store
- ✅ Must be signed
- ❌ Requires keystore

---

## Customizing Filename

Want to change the APK name? Edit `android/app/build.gradle`:

```groovy
applicationVariants.all { variant ->
    variant.outputs.all { output ->
        def buildType = variant.buildType.name
        if (buildType == "debug") {
            outputFileName = "your-app-name.apk"  // ← Change this
        } else if (buildType == "release") {
            outputFileName = "your-app-name-release.apk"  // ← And this
        }
    }
}
```

Then rebuild.

---

## Versioning

Current version: **1.0** (set in `build.gradle`)

To update version:

```groovy
defaultConfig {
    versionCode 2           // ← Increment (integer)
    versionName "1.1"       // ← Update (string)
}
```

- **versionCode:** Must increase with each release (used by Play Store)
- **versionName:** Display version shown to users

Example progression:
```
v1.0 → versionCode 1, versionName "1.0"
v1.1 → versionCode 2, versionName "1.1"
v2.0 → versionCode 3, versionName "2.0"
```

---

## Distribution

### For Testing (Debug APK)
1. Build `hydrotrack.apk`
2. Share via any method
3. Testers install directly
4. No Play Store needed

### For Production (Release APK)
1. Build `hydrotrack-release.apk` (signed)
2. Upload to Google Play Console
3. Complete app listing
4. Submit for review
5. Publish to Play Store

---

## Quick Reference

| Action | Command |
|--------|---------|
| Build debug | `.\build-apk.bat` |
| Open in Studio | `.\open-android-studio.bat` |
| Build release | `cd android && .\gradlew assembleRelease` |
| Debug APK location | `android/app/build/outputs/apk/debug/hydrotrack.apk` |
| Release APK location | `android/app/build/outputs/apk/release/hydrotrack-release.apk` |

---

## ✅ Summary

Your APKs now have clean, branded filenames:
- ✅ `hydrotrack.apk` (debug)
- ✅ `hydrotrack-release.apk` (release)

No more generic `app-debug.apk`! 🎉
