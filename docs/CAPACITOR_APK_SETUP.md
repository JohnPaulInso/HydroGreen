# 📱 Capacitor APK Setup Guide

## Step-by-Step: Convert HydroTrack to Android APK

### Prerequisites
- Node.js (v16+)
- npm or yarn
- Android Studio
- Java JDK 11+

---

## Step 1: Install Capacitor

```bash
# Navigate to your project directory
cd HydroTrack

# Initialize npm (if not already done)
npm init -y

# Install Capacitor
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android

# Install push notifications plugin
npm install @capacitor/push-notifications

# Install local notifications plugin
npm install @capacitor/local-notifications

# Install app plugin (for app state)
npm install @capacitor/app

# Install splash screen & status bar
npm install @capacitor/splash-screen @capacitor/status-bar
```

---

## Step 2: Initialize Capacitor

```bash
# Initialize Capacitor config
npx cap init

# Answer prompts:
# App name: HydroTrack
# App ID: com.hydrotrack.app
# Web directory: . (current directory, since we don't have a build process)
```

This creates `capacitor.config.json`:

```json
{
  "appId": "com.hydrotrack.app",
  "appName": "HydroTrack",
  "webDir": ".",
  "bundledWebRuntime": false,
  "plugins": {
    "SplashScreen": {
      "launchShowDuration": 2000,
      "backgroundColor": "#14532D",
      "showSpinner": false
    },
    "PushNotifications": {
      "presentationOptions": ["badge", "sound", "alert"]
    },
    "LocalNotifications": {
      "smallIcon": "ic_stat_icon",
      "iconColor": "#2F9E5B"
    }
  }
}
```

---

## Step 3: Add Android Platform

```bash
# Add Android platform
npx cap add android

# This creates an 'android' folder with Android Studio project
```

---

## Step 4: Update Package.json Scripts

Add to `package.json`:

```json
{
  "name": "hydrotrack",
  "version": "1.0.0",
  "scripts": {
    "sync": "npx cap sync",
    "open:android": "npx cap open android",
    "build:android": "npx cap sync android && npx cap open android"
  },
  "dependencies": {
    "@capacitor/android": "^5.0.0",
    "@capacitor/app": "^5.0.0",
    "@capacitor/core": "^5.0.0",
    "@capacitor/local-notifications": "^5.0.0",
    "@capacitor/push-notifications": "^5.0.0",
    "@capacitor/splash-screen": "^5.0.0",
    "@capacitor/status-bar": "^5.0.0"
  },
  "devDependencies": {
    "@capacitor/cli": "^5.0.0"
  }
}
```

---

## Step 5: Configure Android Permissions

Edit `android/app/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    
    <!-- Permissions -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    
    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">
        
        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:exported="true"
            android:label="@string/title_activity_main"
            android:launchMode="singleTask"
            android:theme="@style/AppTheme.NoActionBarLaunch">
            
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
        
        <!-- Firebase Cloud Messaging -->
        <service
            android:name="com.google.firebase.messaging.FirebaseMessagingService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>
    </application>
</manifest>
```

---

## Step 6: Setup Firebase Cloud Messaging (FCM)

### 6.1: Firebase Console Setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your HydroTrack project
3. Click ⚙️ → Project Settings
4. Go to "Cloud Messaging" tab
5. Under "Cloud Messaging API (Legacy)", note your **Server Key**

### 6.2: Add google-services.json

1. In Firebase Console, go to Project Settings
2. Click "Add app" → Android icon
3. Package name: `com.hydrotrack.app`
4. Download `google-services.json`
5. Place it in: `android/app/google-services.json`

### 6.3: Update Android build.gradle

Edit `android/build.gradle`:

```gradle
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.0.0'
        classpath 'com.google.gms:google-services:4.3.15'
    }
}
```

Edit `android/app/build.gradle`:

```gradle
apply plugin: 'com.android.application'
apply plugin: 'com.google.gms.google-services'  // Add this line

android {
    namespace "com.hydrotrack.app"
    compileSdkVersion 33
    
    defaultConfig {
        applicationId "com.hydrotrack.app"
        minSdkVersion 22
        targetSdkVersion 33
        versionCode 1
        versionName "1.0"
    }
}

dependencies {
    implementation 'com.google.firebase:firebase-messaging:23.1.2'
    // ... other dependencies
}
```

---

## Step 7: Build APK

### Option A: Using Android Studio (Recommended)

```bash
# Open Android Studio
npm run open:android

# In Android Studio:
# 1. Wait for Gradle sync to complete
# 2. Click "Build" → "Build Bundle(s) / APK(s)" → "Build APK(s)"
# 3. APK will be at: android/app/build/outputs/apk/debug/app-debug.apk
```

### Option B: Command Line

```bash
# Sync files
npm run sync

# Build debug APK
cd android
./gradlew assembleDebug

# Build release APK (for production)
./gradlew assembleRelease

# APK location:
# Debug: android/app/build/outputs/apk/debug/app-debug.apk
# Release: android/app/build/outputs/apk/release/app-release.apk
```

---

## Step 8: Sign APK for Release (Production)

### 8.1: Generate Keystore

```bash
keytool -genkey -v -keystore hydrotrack-release.keystore \
  -alias hydrotrack -keyalg RSA -keysize 2048 -validity 10000

# Answer the prompts:
# - Password: [choose a strong password]
# - Name: Your Name
# - Organization: Your Company
# etc.
```

### 8.2: Configure Signing

Create `android/keystore.properties`:

```properties
storePassword=YourKeystorePassword
keyPassword=YourKeyPassword
keyAlias=hydrotrack
storeFile=/path/to/hydrotrack-release.keystore
```

Update `android/app/build.gradle`:

```gradle
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        release {
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
        }
    }
    
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

### 8.3: Build Signed APK

```bash
cd android
./gradlew assembleRelease

# Signed APK: android/app/build/outputs/apk/release/app-release.apk
```

---

## Step 9: Test on Device

### Via USB (ADB)

```bash
# Enable USB debugging on your Android device
# Connect via USB

# Install APK
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Or use Android Studio's "Run" button
```

### Via APK File

1. Transfer APK to device (email, Drive, etc.)
2. Open APK file on device
3. Allow installation from unknown sources if prompted
4. Install

---

## Step 10: Publish to Google Play Store

### 10.1: Generate App Bundle (AAB)

```bash
cd android
./gradlew bundleRelease

# Output: android/app/build/outputs/bundle/release/app-release.aab
```

### 10.2: Google Play Console

1. Go to [Google Play Console](https://play.google.com/console)
2. Create new app
3. Fill in app details:
   - Title: HydroTrack
   - Description: Hydroponic tower manager
   - Category: Productivity
   - Screenshots (create 2-8 screenshots)
4. Upload AAB file
5. Set up pricing (Free)
6. Fill out content rating questionnaire
7. Submit for review

---

## Troubleshooting

### Issue: "AAPT: error: resource android:attr/lStar not found"

**Solution:** Update `android/variables.gradle`:
```gradle
ext {
    minSdkVersion = 22
    compileSdkVersion = 33
    targetSdkVersion = 33
    androidxAppCompatVersion = '1.6.1'
}
```

### Issue: "Plugin not implemented"

**Solution:** Sync Capacitor:
```bash
npm run sync
```

### Issue: Push notifications not working

**Solution:**
1. Check google-services.json is in correct location
2. Verify Firebase Cloud Messaging is enabled
3. Test on physical device (not emulator)

### Issue: White screen on launch

**Solution:** Check capacitor.config.json webDir points to correct folder

---

## Quick Commands Reference

```bash
# Sync files to native projects
npm run sync

# Open Android Studio
npm run open:android

# Build debug APK
cd android && ./gradlew assembleDebug

# Build release APK
cd android && ./gradlew assembleRelease

# Build app bundle (for Play Store)
cd android && ./gradlew bundleRelease

# Install on connected device
adb install path/to/app-debug.apk

# View device logs
adb logcat
```

---

## File Structure After Setup

```
HydroTrack/
├── android/                    # Android native project
│   ├── app/
│   │   ├── src/
│   │   ├── build.gradle
│   │   └── google-services.json
│   ├── build.gradle
│   └── keystore.properties
├── assets/
├── css/
├── js/
│   └── capacitor.js          # Capacitor integration (auto-created)
├── index.html
├── capacitor.config.json
├── package.json
└── hydrotrack-release.keystore
```

---

## Next Steps

After APK is built:
1. Test all features thoroughly
2. Test push notifications
3. Test offline functionality
4. Test on different Android versions
5. Submit to Play Store

---

**🎉 Your HydroTrack app is now a native Android app!**
