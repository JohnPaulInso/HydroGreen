# 🤖 Android APK Build Setup

## ✅ Quick Start

**Just run this:**
```bash
build-apk.bat
```

This script will:
1. Set Android SDK paths
2. Sync Capacitor
3. Build debug APK

---

## 🔧 Manual Setup (If Needed)

### 1. Verify Android SDK Installation

Check if SDK exists:
```powershell
Test-Path "C:\Users\Lenovo\AppData\Local\Android\Sdk"
```

Should return `True`.

### 2. Set Environment Variables

**Option A: Per Session (Quick)**
```powershell
$env:ANDROID_HOME = "C:\Users\Lenovo\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
```

**Option B: Permanent (Recommended)**
1. Open System Properties → Advanced → Environment Variables
2. Add new System variable:
   - Name: `ANDROID_HOME`
   - Value: `C:\Users\Lenovo\AppData\Local\Android\Sdk`
3. Add new System variable:
   - Name: `ANDROID_SDK_ROOT`  
   - Value: `C:\Users\Lenovo\AppData\Local\Android\Sdk`
4. Restart terminal/IDE

### 3. Verify Setup

```powershell
echo $env:ANDROID_HOME
# Should output: C:\Users\Lenovo\AppData\Local\Android\Sdk
```

---

## 📦 Build Commands

### Full Build Process:

```bash
# 1. Sync Capacitor
npx cap sync android

# 2. Build APK
cd android
gradlew assembleDebug
cd ..
```

### Output Location:
```
android\app\build\outputs\apk\debug\app-debug.apk
```

---

## 🚨 Troubleshooting

### Error: "SDK location not found"

**Solution 1: Use the batch script**
```bash
build-apk.bat
```

**Solution 2: Set ANDROID_HOME manually**
```powershell
$env:ANDROID_HOME = "C:\Users\Lenovo\AppData\Local\Android\Sdk"
cd android
.\gradlew assembleDebug
```

**Solution 3: Fix local.properties**

Edit `android/local.properties`:
```properties
sdk.dir=C:/Users/Lenovo/AppData/Local/Android/Sdk
```
Note: Use forward slashes `/` instead of backslashes `\`

### Error: "Could not find or load main class org.gradle.wrapper.GradleWrapperMain"

```bash
cd android
rmdir /s /q .gradle
.\gradlew wrapper
.\gradlew assembleDebug
```

### Error: Java version issues

Make sure you have JDK 17 installed:
```bash
java -version
```

If not, download from: https://adoptium.net/

---

## 📱 Install APK on Device

### Via USB:
```bash
adb install android\app\build\outputs\apk\debug\app-debug.apk
```

### Via File:
1. Copy `app-debug.apk` to your phone
2. Open file on phone
3. Tap "Install"
4. Enable "Install from unknown sources" if prompted

---

## 🎯 Current Setup

**Your SDK Location:**
```
C:\Users\Lenovo\AppData\Local\Android\Sdk
```

**local.properties:**
```
sdk.dir=C\\:\\Users\\Lenovo\\AppData\\Local\\Android\\Sdk
```

**Build Script:**
```
build-apk.bat
```

---

## ✅ Recommended Workflow

1. Make changes to your web app
2. Test in browser first
3. When ready to build APK:
   ```bash
   build-apk.bat
   ```
4. Install APK on device to test

---

## 📚 Additional Resources

- Capacitor Docs: https://capacitorjs.com/docs/android
- Android Studio: https://developer.android.com/studio
- Gradle Docs: https://docs.gradle.org/

---

## 🎉 Success!

Once the build completes, you'll find your APK at:
```
android\app\build\outputs\apk\debug\app-debug.apk
```

File size: ~5-10 MB  
Ready to install on any Android device!
