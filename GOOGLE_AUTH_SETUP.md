# Google Authentication Setup Guide for HydroTrack (Web & Android)

This guide walks you through setting up Google Sign-In for both the Web application and the Android native APK build.

---

## 1. Firebase Console Setup

1. Open [Firebase Console](https://console.firebase.google.com/).
2. Select your project (or create a new project `hydrotrack`).
3. In the left navigation menu, click **Authentication** > **Get Started**.
4. Navigate to the **Sign-in method** tab.
5. Click **Google** under **Additional providers**:
   - Enable Google Sign-in.
   - Choose your **Project support email**.
   - Click **Save**.

---

## 2. Web Configuration & Authorized Domains

1. In Firebase Console, go to **Authentication** > **Settings** > **Authorized domains**.
2. Click **Add Domain** and add:
   - `localhost` (enabled by default)
   - Your custom domain or hosting URL (e.g. `your-hydrotrack-domain.web.app`)
3. Go to **Project Settings** (gear icon) > **General** > **Your apps** > **Web app**.
4. Copy your Firebase Configuration object and paste it into HydroTrack's **Tools** > **Data Backup & Sync**.

---

## 3. Android Native Setup (Capacitor)

To enable Google Auth on your Android APK:

### Step 3.1: Add Android App to Firebase
1. In Firebase Console > **Project Settings** > **General** > **Add App** > select **Android**.
2. Enter Package Name: `com.hydrotrack.app` (matching `capacitor.config.ts`).
3. Click **Register App**.

### Step 3.2: Add SHA-1 Fingerprint (Required for Google Sign-In)
1. Your project's generated debug SHA-1 fingerprint is:
   ```text
   A0:9C:B9:88:64:26:BA:E7:33:87:32:7D:29:A0:C7:AD:3E:7A:FD:1C
   ```

2. To generate it manually at any time, run:
   ```powershell
   keytool -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
   ```

3. In Firebase Console > **Project Settings** > **General** > **Your Android App**, click **Add Fingerprint** and paste `A0:9C:B9:88:64:26:BA:E7:33:87:32:7D:29:A0:C7:AD:3E:7A:FD:1C`.
4. Re-download `google-services.json` and save it to `android/app/google-services.json`.

---

## 4. Testing Google Sign-In

1. **Web**: Open HydroTrack, go to **Tools** tab, and click **Sign in with Google**.
2. **Android**: Build and run your APK (`npm run sync`, then run in Android Studio). Tap **Sign in with Google** under **Tools**.
