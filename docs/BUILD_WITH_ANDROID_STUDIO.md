# 🚀 Build APK with Android Studio

## Quick Steps

Since you already have Android Studio, you're ready to build!

---

## Option 1: Use the Script (Easiest)

Just double-click:
```
open-in-android-studio.bat
```

This will:
- Launch Android Studio
- Open your project
- Show you the next steps

---

## Option 2: Manual Steps

### 1. Open Android Studio
- Launch Android Studio from your Start Menu

### 2. Open Your Project
- Click: **File → Open**
- Navigate to: `C:\Users\Lenovo\Desktop\HydroTrack\android`
- Click: **OK**

### 3. Wait for Gradle Sync
- Look at the bottom right corner
- You'll see "Gradle sync in progress..."
- **Wait until it completes** (2-5 minutes first time)
- Don't click anything during sync

### 4. Trust the Project (if prompted)
- If you see "Trust Project?" dialog
- Click: **Trust Project**

### 5. Build Your APK
- Top menu: **Build → Build Bundle(s) / APK(s) → Build APK(s)**
- Wait 2-3 minutes
- You'll see build progress at the bottom

### 6. Get Your APK
- When complete, you'll see: "APK(s) generated successfully"
- Click the **"locate"** link
- Or manually go to: `android\app\build\outputs\apk\debug\`
- Your APK: **hydrotrack.apk** (automatically renamed from app-debug.apk)

---

## 📱 Install on Your Phone

### Method 1: USB Cable
1. Connect phone to computer via USB
2. Enable **USB file transfer** on phone
3. Copy `hydrotrack.apk` to phone
4. On phone, open **Files** app
5. Find and tap `hydrotrack.apk`
6. Tap **Install**
7. If blocked, enable **"Install from unknown sources"** in Settings

### Method 2: Upload to Cloud
1. Upload `hydrotrack.apk` to Google Drive, Dropbox, etc.
2. Download on your phone
3. Tap to install
4. Enable **"Install from unknown sources"** if needed

---

## 🐛 Troubleshooting

### Gradle Sync Failed
**Solution:** Check your internet connection. The first sync downloads dependencies.

### "SDK not found"
**Solution:** In Android Studio, go to **File → Settings → Appearance & Behavior → System Settings → Android SDK**. Ensure SDK is installed.

### Build Failed - Java Version Error
**Solution:** Android Studio includes its own JDK. Go to **File → Settings → Build, Execution, Deployment → Build Tools → Gradle**. Set **Gradle JDK** to "Embedded JDK".

### "Trust Project?" not showing
**Solution:** This is fine, just proceed with building.

---

## 📊 Build Output Details

After building, you'll see:

```
Build Output:
✓ Task :app:assembleDebug
✓ BUILD SUCCESSFUL in 2m 34s

APK Location:
android/app/build/outputs/apk/debug/hydrotrack.apk

APK Size: ~5-10 MB (varies based on assets)
```

---

## 🎯 What's in Your APK?

Your `app-debug.apk` contains:
- ✅ All your web app files (HTML, CSS, JS)
- ✅ Firebase integration
- ✅ HydroTrack features (towers, photos, weather)
- ✅ Push notifications capability
- ✅ Local notifications
- ✅ App icons and branding
- ✅ Android runtime

This is a fully functional Android app!

---

## 🔄 Rebuilding After Changes

Made changes to your web app? Here's how to rebuild:

### 1. Sync Web Assets
```bash
npx cap sync android
```

### 2. Open in Android Studio
```bash
.\open-in-android-studio.bat
```

### 3. Build APK Again
- **Build → Build Bundle(s) / APK(s) → Build APK(s)**

---

## 🚀 Next Steps: Production Build

When ready for Google Play Store:

### 1. Generate Signing Key
```bash
cd android
.\gradlew :app:generateDebugKeystore
```

### 2. Build Release APK
In Android Studio:
- **Build → Generate Signed Bundle / APK**
- Follow the wizard
- Choose **APK**
- Select your keystore

### 3. Upload to Play Store
- Go to: https://play.google.com/console
- Create app listing
- Upload your signed APK
- Fill in app details
- Submit for review

---

## ✅ You're All Set!

Your Android Studio setup is perfect for building. Just:
1. Run `.\open-in-android-studio.bat`
2. Wait for sync
3. Build APK
4. Install on phone

Easy! 🎉

---

## 💡 Pro Tips

### Speed Up Future Builds
- Keep Android Studio open while developing
- It will detect changes automatically
- Rebuild is much faster (30 seconds vs 3 minutes)

### Test in Emulator
- In Android Studio: **Tools → Device Manager**
- Create a virtual device
- Click Play button to run app in emulator
- No need to transfer to phone for testing

### View Logs
- In Android Studio: **View → Tool Windows → Logcat**
- See console.log() output from your web app
- Debug issues easily

### Hot Reload (for development)
```bash
npx cap run android
```
This runs the app with live reload - changes update instantly!

---

**Ready to build? Run:** `.\open-android-studio.bat` 🚀
