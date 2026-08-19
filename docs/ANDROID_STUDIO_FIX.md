# 🔧 Android Studio Build Fix - SSL Certificate Error

## The Error You're Seeing:
```
Cause: unable to find valid certification path to requested target
```

This means Gradle can't download dependencies due to SSL/TLS certificate issues.

---

## ✅ SOLUTION - Follow These Steps IN ORDER:

### Step 1: Configure Gradle JDK (CRITICAL!)

1. In Android Studio, click: **File → Settings** (or press `Ctrl+Alt+S`)
2. Navigate to: **Build, Execution, Deployment → Build Tools → Gradle**
3. Look for **Gradle JDK** dropdown
4. Select: **Embedded JDK** or **JetBrains Runtime**
   - Should show version 17 or 21
   - DO NOT use "JAVA_HOME" or any system Java
5. Click **Apply**, then **OK**

---

### Step 2: Enable Gradle Offline Mode (Temporary)

1. Click: **File → Settings** (or press `Ctrl+Alt+S`)
2. Go to: **Build, Execution, Deployment → Build Tools → Gradle**
3. Check the box: **Offline work**
4. Click **Apply**, then **OK**

---

### Step 3: Sync Project

1. Click: **File → Sync Project with Gradle Files**
2. Wait for it to complete (may show some errors - that's OK)

---

### Step 4: Invalidate Caches

1. Click: **File → Invalidate Caches**
2. Check ALL boxes:
   - Clear file system cache and Local History
   - Clear VCS Log caches and indexes
   - Clear downloaded shared indexes
3. Click: **Invalidate and Restart**
4. Wait for Android Studio to restart

---

### Step 5: Disable Offline Mode

After restart:

1. Click: **File → Settings**
2. Go to: **Build, Execution, Deployment → Build Tools → Gradle**
3. UNCHECK: **Offline work**
4. Click **Apply**, then **OK**

---

### Step 6: Clean and Rebuild

1. Click: **Build → Clean Project**
2. Wait for it to finish
3. Click: **Build → Rebuild Project**
4. Wait 3-5 minutes

---

### Step 7: Build APK

1. Click: **Build → Build Bundle(s) / APK(s) → Build APK(s)**
2. Wait 2-3 minutes
3. You should see: "APK(s) generated successfully"
4. Click **locate** to find your **hydrotrack.apk**

---

## 🔄 Alternative Fix: Use Gradle Wrapper

If the above doesn't work, try this:

1. Close Android Studio completely
2. Open PowerShell in your project folder
3. Run these commands:

```powershell
cd android
.\gradlew --stop
Remove-Item -Recurse -Force .gradle
.\gradlew wrapper --gradle-version=8.7
.\gradlew clean
```

4. Open Android Studio again
5. File → Sync Project with Gradle Files
6. Build → Build APK

---

## 🌐 If You Have Corporate Network/Proxy

If you're behind a corporate firewall or proxy:

1. File → Settings → Appearance & Behavior → System Settings → HTTP Proxy
2. Select: **Manual proxy configuration**
3. Enter your proxy details
4. Click: **Check connection** to test
5. Click: **Apply** and **OK**
6. Try building again

---

## 🎯 Quick Checklist

Go through these IN ORDER:

- [ ] Step 1: Set Gradle JDK to "Embedded JDK"
- [ ] Step 2: Enable "Offline work"
- [ ] Step 3: Sync project
- [ ] Step 4: Invalidate caches & restart
- [ ] Step 5: Disable "Offline work"
- [ ] Step 6: Clean & rebuild project
- [ ] Step 7: Build APK

---

## 💡 Why This Works

- **Embedded JDK**: Uses Android Studio's own Java with proper certificates
- **Offline mode**: Uses cached dependencies first
- **Cache invalidation**: Clears corrupted cache entries
- **Clean rebuild**: Fresh build without old artifacts

---

## ❌ If Still Failing

Try building with these additional Gradle properties:

1. Open file: `android/gradle.properties`
2. Add these lines at the end:

```properties
systemProp.javax.net.ssl.trustStoreType=jks
systemProp.javax.net.ssl.trustStore=NONE
org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m
```

3. Save the file
4. In Android Studio: File → Sync Project with Gradle Files
5. Build → Build APK

---

## 🆘 Last Resort

If nothing works, download dependencies manually:

1. Close Android Studio
2. Run PowerShell as Administrator
3. Execute:

```powershell
cd C:\Users\Lenovo\Desktop\HydroTrack\android
.\gradlew --refresh-dependencies assembleDebug
```

This forces Gradle to re-download everything.

---

## ✅ Expected Success Output

When it works, you'll see:

```
BUILD SUCCESSFUL in 2m 34s
```

And in Android Studio:
```
APK(s) generated successfully.
Locate
```

Click "Locate" to find: **android\app\build\outputs\apk\debug\hydrotrack.apk**

---

## 📞 Still Stuck?

The most common cause is not using Embedded JDK. Double-check:

**File → Settings → Build Tools → Gradle → Gradle JDK = "Embedded JDK"**

This must be set correctly! 🎯
