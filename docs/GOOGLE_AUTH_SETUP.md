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

<!-- (2026-07-13) Update active SHA-1 and SHA-256 fingerprints; prev: outdated SHA -->
### Step 3.2: Add SHA-1 Fingerprint (Required for Google Sign-In)
1. Your project's active debug keystore fingerprints:
   - **SHA-1**: `ED:36:13:B1:CA:6D:DE:62:45:58:85:D2:C5:61:50:59:D7:20:63:2D`
   - **SHA-256**: `78:25:9A:78:0E:C3:C4:44:F7:FF:83:C1:F0:55:A8:B1:1B:C0:07:C8:3D:B3:3A:0B:40:1A:4A:FA:09:D5:DF:78`

2. To generate it manually at any time, run:
   ```powershell
   keytool -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
   ```

3. In Firebase Console > **Project Settings** > **General** > **Your Android App**, click **Add Fingerprint** and paste `ED:36:13:B1:CA:6D:DE:62:45:58:85:D2:C5:61:50:59:D7:20:63:2D`.
4. Re-download `google-services.json` and save it to `android/app/google-services.json`.

---

## 4. Resolving "Suspicious Sign-in" / "Unverified App" Warnings

Google shows "Suspicious sign-in blocked" or "Google hasn't verified this app" when:
1. **OAuth Consent Screen is in 'Testing' mode**:
   - Go to [Google Cloud Console Credentials / OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent).
   - Either add your Google email under **Test Users** OR click **Publish App** to move to Production state.
2. **Embedded WebViews on Mobile**:
   - Google blocks `signInWithPopup` inside Android WebViews as suspicious (`disallowed_useragent`). HydroTrack now uses native `@capacitor-firebase/authentication` on Android and Google Identity Services (One Tap) on Web, preventing embedded webview blocks completely.

---

## 4. Testing Google Sign-In

1. **Web**: Open HydroTrack, go to **Tools** tab, and click **Sign in with Google**.
2. **Android**: Build and run your APK (`npm run sync`, then run in Android Studio). Tap **Sign in with Google** under **Tools**.
