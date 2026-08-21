/* ============================================================
   Cloud Sync — Google Sign-In + real-time Firestore sync.

   Flow:
   - On load, Firebase Auth boots quietly in the background (no
     network cost until a sign-in is actually attempted).
   - If the browser already has a Google session, we skip the
     overlay and go straight into the app, connected.
   - Otherwise the login overlay asks for Google Sign-In or
     "Continue Offline" (pure localStorage, no Firebase at all).
   - Each signed-in Google account gets its own Firestore doc at
     hydrotrack_towers/{uid}. First time that doc doesn't exist,
     we seed a clean empty tower — except the expense log, which
     only auto-fills with the standard starter costs for the
     account this was built for (MAIN_ACCOUNT_EMAIL below), since
     that's the one specific case where re-typing them by hand was
     the actual complaint.
   ============================================================ */
const CLOUD_CONFIG_KEY = 'ht_cloud_config';
const OFFLINE_MODE_KEY = 'ht_offline_mode';
const FIREBASE_CDN = 'https://www.gstatic.com/firebasejs/10.13.0';
const MAIN_ACCOUNT_EMAIL = 'johnpaulinso123@gmail.com';

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyB5qpUuRDIB1JjiROr_qS4ntb2K-fCIROM",
  authDomain: "hydrotrack-2317.firebaseapp.com",
  projectId: "hydrotrack-2317",
  storageBucket: "hydrotrack-2317.firebasestorage.app",
  messagingSenderId: "222210946101",
  appId: "1:222210946101:web:22f129b3bc57535e36ad7c"
};

const cloudSync = {
  app:null, db:null, auth:null, user:null, unsub:null, ref:null,
  connected:false, connecting:false, applyingRemote:false, pushTimer:null,
  authReady:false, fns:{},

  getConfig(){ return store.get(CLOUD_CONFIG_KEY, null) || DEFAULT_FIREBASE_CONFIG; },
  saveConfig(cfg){ store.set(CLOUD_CONFIG_KEY, cfg); },

  /* Boots Firebase App + Auth + Firestore exactly once. Cheap — no sign-in
     is attempted here, just wiring so signInWithGoogle() has something to
     call and so an existing session can be detected automatically. */
  async initAuth(){
    if(this.authReady) return;
    this.authReady = true; // set immediately so concurrent callers don't double-init
    try{
      const config = this.getConfig();
      const [{ initializeApp }, firestoreMod, authMod] = await Promise.all([
        import(`${FIREBASE_CDN}/firebase-app.js`),
        import(`${FIREBASE_CDN}/firebase-firestore.js`),
        import(`${FIREBASE_CDN}/firebase-auth.js`)
      ]);
      this.fns = { ...firestoreMod, ...authMod };
      this.app = initializeApp(config);
      this.db = this.fns.getFirestore(this.app);
      this.auth = this.fns.getAuth(this.app);

      this.fns.onAuthStateChanged(this.auth, (user)=>{
        this.user = user;
        updateUserUI(user);
        if(user){
          localStorage.setItem('ht_logged_in', 'true');
          hideAuthOverlay();
          localStorage.removeItem(OFFLINE_MODE_KEY);
          connectFirestoreForUser(user);
          // (2026-07-13) Dismiss One Tap after login; prev: prompt remained visible
          if(typeof google !== 'undefined' && google?.accounts?.id?.cancel){
            google.accounts.id.cancel();
          }
        } else {
          localStorage.setItem('ht_logged_in', 'false');
          this.connected = false;
          updateSyncStatus('offline');
          showAuthOverlay();
          this.initGoogleOneTap();
        }
        resolveAuthCheck();
      });
    } catch(err){
      console.error('Firebase auth init failed:', err);
      resolveAuthCheck();
      showAuthOverlay(true);
    }
  },

  // (2026-07-13) Log live auth status to on-screen console; prev: console only
  authLog(msg, isErr){
    const el = document.getElementById('authDebugConsole');
    if(!el) return;
    const time = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    const prefix = isErr ? '❌ ' : 'ℹ️ ';
    const color = isErr ? 'color:#f87171;' : 'color:#34d399;';
    el.innerHTML += `<div style="${color}">${prefix}[${time}] ${msg}</div>`;
    el.scrollTop = el.scrollHeight;
  },

  // (2026-07-13) Poll GIS SDK load & render GIS button; prev: direct call
  initGoogleOneTap(){
    if(this.user || localStorage.getItem('ht_logged_in') === 'true'){
      if(typeof google !== 'undefined' && google?.accounts?.id?.cancel) google.accounts.id.cancel();
      return;
    }
    if(window.Capacitor?.isNativePlatform?.()){
      this.authLog('Native platform active — One Tap handled by Android Google Play Services.');
      return;
    }
    const self = this;
    function setupGIS(){
      if(self.user || localStorage.getItem('ht_logged_in') === 'true'){
        if(typeof google !== 'undefined' && google?.accounts?.id?.cancel) google.accounts.id.cancel();
        return;
      }
      if(typeof google === 'undefined' || !google?.accounts?.id){
        self.authLog('Google Identity Services SDK script not loaded yet.', true);
        return;
      }
      try {
        self.authLog('Initializing Google Identity One Tap…');
        google.accounts.id.initialize({
          client_id: '222210946101-t9sm5vaf2239gr6f76n6im8m6cn80rkl.apps.googleusercontent.com',
          callback: async (resp) => {
            if(resp?.credential){
              self.authLog('One Tap token received. Signing into Firebase…');
              const { GoogleAuthProvider, signInWithCredential } = self.fns;
              const credential = GoogleAuthProvider.credential(resp.credential);
              const fbResult = await signInWithCredential(self.auth, credential);
              if(fbResult?.user){
                self.authLog('Successfully signed in as ' + (fbResult.user.displayName||fbResult.user.email));
                showToast(`Signed in as ${fbResult.user.displayName||fbResult.user.email}`,'forest','check-circle-2');
              }
            }
          },
          auto_select: false,
          cancel_on_tap_outside: false
        });
        google.accounts.id.prompt((notification) => {
          if(notification.isNotDisplayed()){
            self.authLog('One Tap prompt not displayed: ' + notification.getNotDisplayedReason(), true);
          } else if(notification.isSkippedMoment()){
            self.authLog('One Tap prompt skipped: ' + notification.getSkippedReason(), true);
          } else {
            self.authLog('Google One Tap prompt displayed successfully!');
          }
        });
        const container = document.getElementById('googleOneTapContainer');
        if(container){
          container.innerHTML = '';
          google.accounts.id.renderButton(container, {
            theme: 'filled_blue',
            size: 'large',
            type: 'standard',
            shape: 'pill',
            width: 280,
            text: 'signin_with'
          });
          self.authLog('Google GIS Sign-In button rendered.');
        }
      } catch(e) {
        self.authLog('Google One-Tap Error: ' + e.message, true);
      }
    }

    if(typeof google !== 'undefined' && google?.accounts?.id){
      setupGIS();
    } else {
      let count = 0;
      const timer = setInterval(() => {
        count++;
        if(typeof google !== 'undefined' && google?.accounts?.id){
          clearInterval(timer);
          setupGIS();
        } else if(count > 30){
          clearInterval(timer);
          this.authLog('Google Identity Services SDK failed to load within 3s.', true);
        }
      }, 100);
    }
  },

  // (2026-07-13) Log success/failure explicitly on sign-in tap; prev: basic logs
  async signInWithGoogle(){
    this.authLog('🚀 Sign-in with Google button tapped.');
    await this.initAuth();
    if(!this.auth || !this.fns.GoogleAuthProvider){
      this.authLog('❌ SIGN-IN FAILED: Firebase Auth service is not ready.', true);
      showToast('Sign-in is not ready yet \u2014 try again in a moment','clay','alert-triangle');
      return;
    }
    const btnOverlay = document.getElementById('btnOverlayGoogleSignIn');
    const origHtml = btnOverlay ? btnOverlay.innerHTML : '';
    if(btnOverlay){
      btnOverlay.setAttribute('disabled', 'true');
      btnOverlay.style.opacity = '0.7';
      btnOverlay.style.pointerEvents = 'none';
      btnOverlay.innerHTML = `<div class="w-4 h-4 border-2 border-emerald-950/30 border-t-emerald-950 rounded-full animate-spin" style="width:16px;height:16px;border:2px solid rgba(15,56,34,0.3);border-top-color:#0f3822;border-radius:50%;"></div> Signing in…`;
    }
    const startTime = Date.now();
    try {
      const isNative = !!(window.Capacitor?.isNativePlatform?.());
      this.authLog('Platform: ' + (isNative ? 'Native Android App' : 'Web Browser'));
      if(isNative){
        try {
          this.authLog('Launching Android Google Play Services account picker…');
          const NativeAuth = window.Capacitor?.Plugins?.FirebaseAuthentication || (window.Capacitor?.registerPlugin ? window.Capacitor.registerPlugin('FirebaseAuthentication') : null);
          if(NativeAuth){
            let result = null;
            try {
              result = await NativeAuth.signInWithGoogle({ useCredentialManager: true });
            } catch(e1) {
              this.authLog('CredentialManager notice: ' + (e1.message || 'trying legacy auth…'));
              try {
                result = await NativeAuth.signInWithGoogle({ useCredentialManager: false });
              } catch(e2) {
                this.authLog('Legacy auth notice: ' + (e2.message || 'trying default auth…'));
                result = await NativeAuth.signInWithGoogle();
              }
            }
            let user = null;
            if(result?.credential?.idToken){
              this.authLog('Native token obtained. Authenticating with Firebase…');
              const { GoogleAuthProvider, signInWithCredential } = this.fns;
              const credential = GoogleAuthProvider.credential(result.credential.idToken, result.credential.accessToken);
              const fbResult = await signInWithCredential(this.auth, credential);
              user = fbResult.user;
            } else if (result?.user || this.auth.currentUser) {
              user = result?.user || this.auth.currentUser;
            }
            if(user){
              this.authLog('✅ SIGN-IN SUCCESSFUL: Signed in as ' + (user.displayName||user.email));
              showToast(`Signed in as ${user.displayName||user.email}`,'forest','check-circle-2');
              return user;
            } else {
              this.authLog('❌ SIGN-IN CANCELLED: No user credentials returned by device.', true);
            }
          }
        } catch(nativeErr){
          this.authLog('❌ SIGN-IN FAILED: ' + (nativeErr.message || JSON.stringify(nativeErr)), true);
          showToast('Google Sign-In failed or cancelled on device', 'clay', 'alert-triangle');
          return null;
        }
        return null;
      }

      // (2026-07-13) Use popup auth flow directly; prev: triggered one-tap prompt
      this.authLog('Opening Google Auth popup window…');
      const provider = new this.fns.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        const result = await this.fns.signInWithPopup(this.auth, provider);
        this.authLog('✅ SIGN-IN SUCCESSFUL: Signed in as ' + (result.user.displayName||result.user.email));
        showToast(`Signed in as ${result.user.displayName||result.user.email}`,'forest','check-circle-2');
        return result.user;
      } catch(popupErr) {
        this.authLog('Popup error code: ' + popupErr.code + ' — ' + popupErr.message, true);
        // (2026-07-13) Reset button if popup closed; prev: redirected and stayed stuck
        if(popupErr.code === 'auth/popup-closed-by-user' || popupErr.code === 'auth/cancelled-popup-request'){
          this.authLog('Sign-in cancelled or closed by user.');
          return null;
        }
        if(popupErr.code === 'auth/popup-blocked'){
          this.authLog('Popup blocked. Redirecting to Google Auth…');
          await this.fns.signInWithRedirect(this.auth, provider);
          return null;
        }
        throw popupErr;
      }
    } catch(err) {
      this.authLog('❌ SIGN-IN FAILED: ' + err.message, true);
      if(err.code === 'auth/unauthorized-domain' || err.code === 'auth/invalid-client' || String(err.message).includes('10:')){
        this.authLog('💡 Setup Needed: Add package com.hydrotrack.app & SHA1 ED:36:13:B1:CA:6D:DE:62:45:58:85:D2:C5:61:50:59:D7:20:63:2D in your Firebase Console.', true);
      }
      if(err.code === 'auth/unauthorized-domain') showToast('Domain not authorized in Firebase Console (' + window.location.hostname + ')', 'clay', 'alert-triangle');
      else if(err.code!=='auth/popup-closed-by-user' && err.code!=='auth/cancelled-popup-request') showToast('Sign-in failed: '+err.message,'clay','alert-triangle');
      return null;
    } finally {
      const elapsed = Date.now() - startTime;
      const minWait = 400;
      if(elapsed < minWait) await new Promise(r => setTimeout(r, minWait - elapsed));
      if(btnOverlay){
        btnOverlay.removeAttribute('disabled');
        btnOverlay.style.opacity = '';
        btnOverlay.style.pointerEvents = '';
        btnOverlay.innerHTML = origHtml;
      }
    }
  },

  // (2026-07-13) Clear auth session cache without wiping local data; prev: wiped all
  async signOutGoogle(){
    const modal = document.getElementById('logoutModal');
    if(modal) modal.classList.remove('hidden');
    const start = Date.now();

    // (2026-07-13) Cancel pending push timer on logout; prev: timer could fire
    if(this.pushTimer){ clearTimeout(this.pushTimer); this.pushTimer = null; }
    if(this.unsub){ this.unsub(); this.unsub=null; }
    this.connected = false; this.ref = null;
    this.user = null;

    if(window.Capacitor?.isNativePlatform?.()){
      try {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        await FirebaseAuthentication.signOut();
      } catch(e){}
    }

    if(this.auth && this.fns?.signOut){
      try { await this.fns.signOut(this.auth); } catch(e){}
    }

    // Clear login auth flag, reset in-memory state and storage for next account
    // (2026-07-13) Reset state to defaults on logout; prev: retained previous user
    localStorage.setItem('ht_logged_in', 'false');
    if(typeof resetStateToDefaults === 'function') resetStateToDefaults();
    if('caches' in window){
      try {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map(k => caches.delete(k)));
      } catch(e){}
    }

    updateUserUI(null);
    updateSyncStatus('offline');

    const elapsed = Date.now() - start;
    if(elapsed < 2000) await new Promise(r => setTimeout(r, 2000 - elapsed));

    if(modal) modal.classList.add('hidden');
    showAuthOverlay();
    showToast('Signed out successfully', 'clay', 'log-out');
  },

// (2026-07-13) Disable offline mode bypass; prev: stored OFFLINE_MODE_KEY and hid auth
  continueOffline(){
    showToast('Please sign in with Google to continue', 'clay', 'lock');
  },

  pushDebounced(){
    if(!this.connected || this.applyingRemote) return;
    if(this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(()=>this.pushNow(), 600);
  },
  // (2026-07-13) Fix sync payload & state preservation; prev: wiped state on init
  async pushNow(){
    if(!this.db || !this.ref) return;
    try{
      const payload = {
        towers: state.towers, activeTowerId: state.activeTowerId,
        rows: state.rows, pockets: state.pockets, trays: state.trays,
        expenses: state.expenses, harvests: state.harvests, settings: state.settings,
        completed: state.completed, alertLog: state.alertLog, meta: state.meta,
        reservoir: state.reservoir,
        _updatedAt: Date.now()
      };
      await this.fns.setDoc(this.ref, payload, { merge:true });
    } catch(err){
      console.error('Cloud push failed:', err);
      // (2026-07-13) Surface push errors to sync status UI; prev: console only
      updateSyncStatus('error', err.message);
    }
  },

  // (2026-07-13) Sync photos under hydrotrack_towers; prev: users
  async syncPhoto(photo){
    if(!this.db || !this.user || !this.connected) return;
    try{
      const photosRef = this.fns.collection(this.db, 'hydrotrack_towers', this.user.uid, 'photos');
      const photoDocRef = this.fns.doc(photosRef, String(photo.id));
      await this.fns.setDoc(photoDocRef, photo);
    } catch(err){ console.error('Photo sync failed:', err); }
  },

  async deletePhoto(photoId){
    if(!this.db || !this.user || !this.connected) return;
    try{
      const photosRef = this.fns.collection(this.db, 'hydrotrack_towers', this.user.uid, 'photos');
      const photoDocRef = this.fns.doc(photosRef, String(photoId));
      await this.fns.deleteDoc(photoDocRef);
    } catch(err){ console.error('Photo delete failed:', err); }
  },

  async loadPhotos(){
    if(!this.db || !this.user || !this.connected) return [];
    try{
      const photosRef = this.fns.collection(this.db, 'hydrotrack_towers', this.user.uid, 'photos');
      const q = this.fns.query(photosRef, this.fns.orderBy('loggedAt', 'desc'), this.fns.limit(100));
      const snapshot = await this.fns.getDocs(q);
      return snapshot.docs.map(doc => doc.data());
    } catch(err){ 
      console.error('Photo load failed:', err); 
      return [];
    }
  }
};

/* ---- Per-user Firestore document: subscribe, and seed on first login ---- */
// (2026-07-13) Use hydrotrack_towers path to match Firestore rules; prev: users
async function connectFirestoreForUser(user){
  if(!user || !user.uid) return;
  const userDocRef = cloudSync.fns.doc(cloudSync.db, 'hydrotrack_towers', String(user.uid));
  cloudSync.ref = userDocRef;
  if(cloudSync.unsub) cloudSync.unsub();
  updateSyncStatus('connecting');

  try {
    const snap = await cloudSync.fns.getDoc(userDocRef);
    if(snap.exists() && snap.data() && (snap.data().towers || snap.data().expenses || snap.data().pockets)){
      cloudSync.applyingRemote = true;
      applyRemoteState(snap.data());
      cloudSync.applyingRemote = false;
    } else {
      const cleanState = buildCleanAccountState();
      cloudSync.applyingRemote = true;
      applyRemoteState(cleanState);
      cloudSync.applyingRemote = false;
      await cloudSync.fns.setDoc(userDocRef, {
        userId: String(user.uid),
        email: String(user.email || ''),
        displayName: String(user.displayName || ''),
        photoURL: String(user.photoURL || ''),
        lastLogin: Date.now(),
        ...cleanState,
        _updatedAt: Date.now()
      });
    }

    cloudSync.connected = true;
    updateSyncStatus('connected');
  } catch(err){
    console.error('Initial cloud document load failed:', err);
  }

  cloudSync.unsub = cloudSync.fns.onSnapshot(userDocRef, (snap)=>{
    if(snap.exists() && !snap.metadata.hasPendingWrites && snap.data()){
      cloudSync.applyingRemote = true;
      applyRemoteState(snap.data());
      cloudSync.applyingRemote = false;
    }
    cloudSync.connected = true;
    updateSyncStatus('connected');
  }, (err)=>{
    console.error('Cloud sync error:', err);
    cloudSync.connected = false;
    updateSyncStatus('error', err.message);
  });
}

// (2026-07-13) Isolated clean state for new users; prev: copied prior session
function buildCleanAccountState(){
  const rows = Array.from({length:8}, (_,i)=>({ id:'r'+(i+1), towerId:'t1', potCount:3 }));
  const pockets = [];
  let n=1;
  rows.forEach(row=>{ for(let i=0;i<3;i++) pockets.push({ id:String(n++), rowId:row.id, variety:null, datePlanted:null, override:null }); });
  return {
    towers: [{ id:'t1', name:'Main Tower' }],
    activeTowerId: 't1',
    rows: rows,
    pockets: pockets,
    trays: [],
    expenses: [],
    harvests: [],
    settings: (typeof DEFAULT_SETTINGS !== 'undefined') ? JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) : {
      sunReminder:false, heatReminder:false, nightReminder:false,
      sunTime:'07:00', heatTime:'11:00', nightTime:'18:00',
      rainAlerts:false, windAlerts:false, browserNotifs:false, location:'Bogo City',
      customReminders: [
        { id: 'cr_1', title: 'Check Reservoir pH & EC', time: '08:30', active: true },
        { id: 'cr_2', title: 'Refill Water Tank', time: '17:00', active: true }
      ]
    },
    completed: {},
    alertLog: [],
    meta: { firstPlantPrompted:false },
    reservoir: { ph:6.0, targetPh:6.0, ec:1.6, targetEc:1.8, tempC:22, waterPct:85, capacityLiters:30, history:[] }
  };
}

function seedNewAccount(user){
  const seed = buildCleanAccountState();
  cloudSync.applyingRemote = true;
  applyRemoteState(seed);
  cloudSync.applyingRemote = false;
  cloudSync.pushNow();
}

function applyRemoteState(remote){
  if(!remote) return;
  if(Array.isArray(remote.towers)) state.towers = remote.towers;
  const validActive = [state.activeTowerId, remote.activeTowerId, store.get(KEYS.activeTower)].find(id => id && state.towers.some(t => t.id === id));
  state.activeTowerId = validActive || (state.towers.find(t=>t.id==='t1') || state.towers[0])?.id || 't1';
  if(Array.isArray(remote.rows)) state.rows = remote.rows;
  if(Array.isArray(remote.pockets)) state.pockets = remote.pockets;
  if(Array.isArray(remote.trays)) state.trays = remote.trays;
  if(Array.isArray(remote.expenses)) state.expenses = remote.expenses;
  if(Array.isArray(remote.harvests)) state.harvests = remote.harvests;
  if(remote.settings) state.settings = { ...(typeof DEFAULT_SETTINGS !== 'undefined' ? DEFAULT_SETTINGS : {}), ...remote.settings };
  if(remote.completed) state.completed = remote.completed;
  if(Array.isArray(remote.alertLog)) state.alertLog = remote.alertLog;
  if(remote.meta) state.meta = remote.meta;
  if(remote.reservoir) state.reservoir = remote.reservoir;
  
  // Load photos from subcollection
  if(cloudSync.connected) loadPhotosFromCloud();
  
  // Save to localStorage
  Object.keys(KEYS).forEach(k=>{ if(k!=='photoLog') store.set(KEYS[k], state[k]); });
  localStorage.setItem(KEYS.activeTower, state.activeTowerId);
  
  // Render pages and reminder views
  if(typeof renderPage==='function') renderPage(typeof currentPageName==='function' ? currentPageName() : 'dashboard');
  if(typeof renderReminders==='function') renderReminders();
  if(typeof renderCustomReminders==='function') renderCustomReminders();
}

// (2026-07-13) Load photos from Firestore subcollection
async function loadPhotosFromCloud(){
  try{
    const photos = await cloudSync.loadPhotos();
    if(photos.length > 0){
      state.photoLog = photos;
      store.set(KEYS.photoLog, photos);
      if(typeof renderPage==='function') renderPage(typeof currentPageName==='function' ? currentPageName() : 'dashboard');
    }
  } catch(err){
    console.error('Failed to load photos:', err);
  }
}

/* ---- Sign-in status pill (sidebar + mobile) ---- */
function updateUserUI(user){
  const nameEl = document.getElementById('googleUserName');
  const emailEl = document.getElementById('googleUserEmail');
  const avatarEl = document.getElementById('userAvatar');
  const fallbackEl = document.getElementById('userAvatarFallback');
  const btn = document.getElementById('btnGoogleSignIn');

  if(user){
    if(nameEl) nameEl.textContent = user.displayName || 'Signed in';
    if(emailEl) emailEl.textContent = user.email || '';
    if(user.photoURL && avatarEl){
      avatarEl.src = user.photoURL;
      avatarEl.classList.remove('hidden');
      fallbackEl?.classList.add('hidden');
    } else {
      avatarEl?.classList.add('hidden');
      fallbackEl?.classList.remove('hidden');
    }
    if(btn){ btn.innerHTML = `${icon('log-out','w-4 h-4',16)}<span>Sign Out</span>`; btn.onclick = () => cloudSync.signOutGoogle(); }
  } else {
    if(nameEl) nameEl.textContent = 'Not signed in';
    if(emailEl) emailEl.textContent = 'Sign in with Google to sync across devices';
    avatarEl?.classList.add('hidden');
    fallbackEl?.classList.remove('hidden');
    if(btn){
      btn.innerHTML = `<svg class="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.15C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.39l3.99-3.15z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.61l3.99 3.15c.95-2.85 3.6-4.96 6.72-4.96z"/></svg><span>Sign in with Google</span>`;
      btn.onclick = () => cloudSync.signInWithGoogle();
    }
  }
}

/* ---- Login overlay ---- */
// (2026-07-13) Prevent scroll during auth overlay; prev: free scrolling
function showAuthOverlay(errored){
  const el = document.getElementById('authOverlay');
  if(!el) return;
  document.body.style.overflow = 'hidden';
  document.body.style.touchAction = 'none';
  const inlineStyle = document.getElementById('authOverlayInlineStyle');
  if(inlineStyle) inlineStyle.remove();
  document.querySelectorAll('style').forEach(s => {
    if(s.textContent.includes('#authOverlay{display:none')) s.remove();
  });
  document.getElementById('dashboardSkeletonOverlay')?.classList.add('hidden');
  el.classList.remove('hidden');
  el.style.display = 'flex';
  el.style.visibility = 'visible';
  el.style.opacity = '1';
  document.getElementById('authOverlayLoading')?.classList.add('hidden');
  document.getElementById('authOverlayButtons')?.classList.remove('hidden');
  if(errored) document.getElementById('authOverlayError')?.classList.remove('hidden');
}

// (2026-07-13) Auto-run bootAuth & dismiss skeleton; prev: uninvoked on load
function hideAuthOverlay(){
  document.body.style.overflow = '';
  document.body.style.touchAction = '';
  const overlay = document.getElementById('authOverlay');
  const skeleton = document.getElementById('dashboardSkeletonOverlay');
  if(skeleton) skeleton.classList.add('hidden');
  if(!overlay) return;

  overlay.classList.add('hidden');
  overlay.style.display = 'none';
  if(typeof showPage === 'function') showPage('dashboard');
}
let _resolveAuthCheck;
const authCheckDone = new Promise(res=>{ _resolveAuthCheck = res; });
function resolveAuthCheck(){ _resolveAuthCheck(); }

function updateSyncStatus(status, detail){
  const dot = document.getElementById('syncStatusDot');
  const label = document.getElementById('syncStatusLabel');
  const toolsStatus = document.getElementById('cloudStatusText');
  const map = {
    offline: { color:'#B7C2BA', text:'Offline — local only' },
    connecting: { color:'#E8A33D', text:'Connecting…' },
    connected: { color:'#2F9E5B', text:'Signed in — synced' },
    error: { color:'#D96B4A', text:'Sync error' + (detail?': '+detail:'') }
  };
  const m = map[status] || map.offline;
  if(dot) dot.style.background = m.color;
  const dotMobile = document.getElementById('syncStatusDotMobile');
  if(dotMobile) dotMobile.style.background = m.color;
  if(label) label.textContent = m.text;
  if(toolsStatus) toolsStatus.textContent = m.text;
  document.querySelectorAll('.sync-pulse').forEach(el=>el.classList.toggle('hidden', status!=='connected'));
}

/* ---- Boot sequence ---- */
async function bootAuth(){
  const isLogged = localStorage.getItem('ht_logged_in') === 'true';
  const skeleton = document.getElementById('dashboardSkeletonOverlay');
  if(!isLogged){
    if(skeleton) skeleton.classList.add('hidden');
    showAuthOverlay();
  } else {
    hideAuthOverlay();
  }

  const authStateCheckPromise = new Promise((resolve) => {
    _resolveAuthCheck = resolve;
  });

  await cloudSync.initAuth();
  await authStateCheckPromise;
  if(skeleton) skeleton.classList.add('hidden');
}

// (2026-07-13) Export cloudSync globally on window object; prev: local const
window.cloudSync = cloudSync;
bootAuth().catch(err => console.log('Auth boot error:', err));
