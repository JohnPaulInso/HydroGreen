# Firebase Setup Guide for HydroTrack

## Overview
HydroTrack includes built-in Firebase integration for real-time cloud sync across all your devices. Follow these steps to enable it.

---

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** or **"Create a project"**
3. Enter project name: `hydrotrack-2317` (or any name you prefer)
4. Disable Google Analytics (optional for this app)
5. Click **"Create project"**

---

## Step 2: Enable Anonymous Authentication

1. In your Firebase project, click **"Authentication"** in the left menu
2. Click **"Get started"** (if first time)
3. Go to the **"Sign-in method"** tab
4. Click on **"Anonymous"**
5. Toggle **"Enable"** to ON
6. Click **"Save"**

---

## Step 3: Create Firestore Database

1. Click **"Firestore Database"** in the left menu
2. Click **"Create database"**
3. Choose **"Start in production mode"** (we'll add rules next)
4. Select a location closest to you
5. Click **"Enable"**

---

## Step 4: Set Up Security Rules

1. In Firestore, go to the **"Rules"** tab
2. Replace the default rules with this:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /hydrotrack_towers/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. Click **"Publish"**

**What this does:** Only allows authenticated users to read/write their own data.

---

## Step 5: Get Your Firebase Config

1. Go to **Project settings** (gear icon ⚙️ in left menu)
2. Scroll down to **"Your apps"**
3. Click the **Web icon** (`</>`) to add a web app
4. Give it a nickname: `HydroTrack Web`
5. **Don't** check "Set up Firebase Hosting"
6. Click **"Register app"**
7. You'll see a config object that looks like this:

```javascript
{
  "apiKey": "AIzaSyB5qpUuRDIB1JjiROr_qS4ntb2K-fCIROM",
  "authDomain": "hydrotrack-2317.firebaseapp.com",
  "projectId": "hydrotrack-2317",
  "storageBucket": "hydrotrack-2317.firebasestorage.app",
  "messagingSenderId": "222210946101",
  "appId": "1:222210946101:web:22f129b3bc57535e36ad7c"
}
```

8. **Copy this entire JSON object**

---

## Step 6: Connect HydroTrack to Firebase

1. Open your HydroTrack app
2. Navigate to **"Tools"** page (last tab)
3. Scroll down to **"Firebase Live Sync"** section
4. **Paste** your Firebase config JSON into the text area
5. Click **"Connect & Enable Live Sync"**
6. You should see a green success message: **"Live sync is on"**

---

## Step 7: Test Real-Time Sync

1. Open HydroTrack in **two different browser tabs** (or on different devices)
2. Make a change in one tab (e.g., add a plant to a pocket)
3. Watch it appear **instantly** in the other tab!

---

## Features of Firebase Sync

✅ **Real-time sync** - Changes appear instantly across all devices  
✅ **Offline-first** - App works perfectly without internet  
✅ **Automatic backup** - Your data is stored in the cloud  
✅ **Multi-device** - Use the same data on phone, tablet, and computer  
✅ **Secure** - Only you can access your data  

---

## Troubleshooting

### "Sync error: Missing or insufficient permissions"
- Make sure you've set up the Firestore security rules correctly (Step 4)
- Ensure Anonymous authentication is enabled (Step 2)

### "That doesn't look like valid JSON"
- Make sure you copied the entire config object including the `{ }` braces
- Check that all quotes are present (common when copy-pasting)

### "Connection timeout"
- Check your internet connection
- Make sure the Firebase project is active (not deleted)
- Try refreshing the page and reconnecting

### Sync indicator stays orange
- Wait a few seconds - initial connection can take 5-10 seconds
- Check browser console (F12) for error messages
- Try disconnecting and reconnecting

---

## Disconnecting

To stop syncing and return to local-only mode:

1. Go to **Tools** page
2. Scroll to **Firebase Live Sync**
3. Click **"Disconnect"**

Your local data is **never deleted** when you disconnect.

---

## Data Storage

- **Local Storage**: Always saved in your browser (works offline)
- **Firebase**: Synced to cloud when connected
- **Document Path**: `hydrotrack_towers/{your-user-id}`

All your tower data, expenses, harvests, and settings are stored in a single Firestore document.

---

## Cost

Firebase has a **generous free tier** that's more than enough for personal use:

- **Free tier**: 50,000 reads + 20,000 writes per day
- HydroTrack uses ~1 write per action, ~1 read per page load
- Typical usage: **Well under free limits**

---

## Security Notes

🔒 **Your data is private**  
- Each user gets their own isolated document
- Security rules prevent unauthorized access
- Anonymous auth means no email/password needed

🔓 **What's NOT private**  
- Your Firebase config (apiKey, projectId) can be public
- These are meant to be in client-side code
- Security comes from Firestore rules, not hiding the config

---

## Advanced: Custom Domain

If you want to use your own domain for Firebase:

1. In Firebase Console, go to **Hosting**
2. Add your custom domain
3. Update `authDomain` in your config to your custom domain
4. Reconnect HydroTrack with the new config

---

## Need Help?

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Security Rules Guide](https://firebase.google.com/docs/firestore/security/get-started)
- Check the browser console (F12) for error messages

---

**You're all set! Enjoy seamless sync across all your devices! 🌱**
