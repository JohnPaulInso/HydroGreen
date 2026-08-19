# ⚡ Quick Fix - SSL Certificate Error

## Error: "unable to find valid certification path to requested target"

---

## 🎯 DO THIS NOW (2 minutes):

### 1️⃣ Set Gradle JDK
```
File → Settings → Build Tools → Gradle
```
- Change **"Gradle JDK"** to **"Embedded JDK"**
- Click **Apply** → **OK**

### 2️⃣ Invalidate Caches
```
File → Invalidate Caches
```
- Check ALL boxes
- Click **Invalidate and Restart**
- Wait for restart

### 3️⃣ Build APK
```
Build → Build Bundle(s) / APK(s) → Build APK(s)
```
- Wait 3-5 minutes
- Done! ✅

---

## 🔍 Visual Guide:

### Finding "Gradle JDK" Setting:

1. **File** (top menu)
   ↓
2. **Settings** (or press Ctrl+Alt+S)
   ↓
3. **Build, Execution, Deployment** (left sidebar)
   ↓
4. **Build Tools** (expand it)
   ↓
5. **Gradle** (click it)
   ↓
6. Look for **"Gradle JDK"** dropdown on right side
   ↓
7. Click dropdown, select **"Embedded JDK"** or **"jbr-17"** or **"jbr-21"**
   ↓
8. Click **Apply** button at bottom
   ↓
9. Click **OK**

### Invalidating Caches:

1. **File** (top menu)
   ↓
2. **Invalidate Caches** (near bottom)
   ↓
3. Dialog appears - check ALL boxes
   ↓
4. Click **"Invalidate and Restart"** button
   ↓
5. Android Studio will close and reopen

### Building APK:

1. **Build** (top menu)
   ↓
2. **Build Bundle(s) / APK(s)**
   ↓
3. **Build APK(s)**
   ↓
4. Watch bottom bar for progress
   ↓
5. Wait for green notification: "APK(s) generated successfully"
   ↓
6. Click **"locate"** link
   ↓
7. You'll see: **hydrotrack.apk** ✅

---

## ⏱️ Time Estimates:

- Step 1 (Set JDK): 30 seconds
- Step 2 (Invalidate): 1 minute (includes restart)
- Step 3 (Build): 3-5 minutes

**Total: ~5-7 minutes**

---

## ✅ Success Signs:

You'll know it worked when you see:

```
BUILD SUCCESSFUL in 2m 34s
```

And a green notification bubble:
```
✓ APK(s) generated successfully.
  Locate
```

---

## ❌ Still Failing?

If you still see the SSL error after these steps:

1. Check your internet connection
2. Try disabling VPN (if using one)
3. See full troubleshooting: [ANDROID_STUDIO_FIX.md](ANDROID_STUDIO_FIX.md)

---

## 💡 Key Point:

The **#1 most important step** is setting Gradle JDK to "Embedded JDK".

Android Studio's embedded JDK has proper SSL certificates. Your system Java doesn't.

That's why it must be: **Embedded JDK** ✅
Not: JAVA_HOME ❌
Not: Any system Java ❌

---

## 🚀 Ready?

1. **File → Settings → Gradle → JDK = Embedded**
2. **File → Invalidate Caches → Restart**
3. **Build → Build APK**

GO! 🎯
