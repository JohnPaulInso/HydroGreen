# 🆘 EMERGENCY FIX - SSL Certificate Error

## The Problem:
Windows certificate store isn't working with Gradle. This is blocking all downloads.

---

## ✅ IMMEDIATE FIX - Do This in Android Studio:

### Step 1: Stop All Gradle Processes
1. In Android Studio, click the **Gradle** tab (usually on right side)
2. Click the elephant icon (🐘) at top
3. Click: **Stop Gradle Daemons**

OR open PowerShell and run:
```powershell
cd C:\Users\Lenovo\Desktop\HydroTrack\android
.\gradlew --stop
```

### Step 2: Delete Gradle Cache
In PowerShell:
```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.gradle\caches"
```

### Step 3: Configure Gradle to Use System Certificates
In Android Studio:
1. **File → Settings**
2. Go to: **Build, Execution, Deployment → Build Tools → Gradle**
3. **Gradle JDK:** Select **"jbr-21 JetBrains Runtime"**
4. Click **Apply**
5. At the bottom of the settings, add JVM options:
   ```
   -Djavax.net.ssl.trustStoreType=jks
   ```
6. Click **OK**

### Step 4: Enable Gradle Offline Mode (Temporarily)
1. **File → Settings**
2. **Build, Execution, Deployment → Compiler**
3. Check: **"Build project automatically"** = OFF
4. Go to: **Build Tools → Gradle**
5. Check: **"Offline work"**
6. Click **OK**

### Step 5: Sync and Build
1. **File → Sync Project with Gradle Files**
2. If sync fails, that's OK
3. **Build → Clean Project**
4. **Build → Rebuild Project**

---

## Alternative: Download Dependencies Manually

If offline mode doesn't work, dependencies need to be pre-cached.

### Option A: Use Mobile Hotspot
1. Connect your laptop to your phone's hotspot
2. Try building again
3. Different network might not have certificate issues

### Option B: Disable Antivirus Temporarily
1. Temporarily disable Windows Defender / Antivirus
2. They sometimes interfere with certificate validation
3. Try building again
4. Re-enable antivirus after

### Option C: Use Gradle Wrapper with Specific Java
In PowerShell:
```powershell
cd C:\Users\Lenovo\Desktop\HydroTrack\android

# Set Java to JBR-21
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"

# Stop gradle
.\gradlew --stop

# Try building
.\gradlew assembleDebug --no-daemon
```

---

## Root Cause:

Your Windows system has an issue with the certificate trust store. This affects:
- ❌ Java 17 (your system Java)
- ❌ Windows ROOT certificate store
- ✅ JetBrains Runtime (bundled with Android Studio)

The fix is to ensure Android Studio uses ONLY its own JBR-21, not your system Java.

---

## Nuclear Option: Reinstall Gradle Wrapper

If nothing works:

```powershell
cd C:\Users\Lenovo\Desktop\HydroTrack\android

# Delete gradle wrapper
Remove-Item -Recurse -Force gradle
Remove-Item -Force gradlew
Remove-Item -Force gradlew.bat

# Re-download wrapper
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
gradle wrapper --gradle-version=8.7
```

Then try building in Android Studio again.

---

## Check Java in Use:

In Android Studio terminal, run:
```bash
.\gradlew -version
```

Should show:
```
JVM: 21.x.x (JetBrains s.r.o.)
```

If it shows Java 17 (Oracle), that's the problem!

---

## Force Android Studio to Use jbr-21:

1. Close Android Studio completely
2. Edit: `C:\Users\Lenovo\Desktop\HydroTrack\android\gradle.properties`
3. Add this line:
   ```
   org.gradle.java.home=C:/Program Files/Android/Android Studio/jbr
   ```
4. Save file
5. Open Android Studio
6. Try building

---

## Last Resort: Build on Different Computer

If your network/system blocks Gradle:
1. Build on a friend's computer
2. Or use a cloud service (GitHub Actions, etc.)
3. Or fix your network's certificate trust

---

**TRY THE STEPS ABOVE IN ORDER!** 🚀

Start with: Stop Gradle → Delete Cache → Offline Mode → Build
