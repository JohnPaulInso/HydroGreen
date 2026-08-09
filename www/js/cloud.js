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
          hideAuthOverlay();
          localStorage.removeItem(OFFLINE_MODE_KEY);
          connectFirestoreForUser(user);
// (2026-07-13) Always show login overlay when unauthenticated; prev: checked OFFLINE_MODE_KEY
        } else {
          this.connected = false;
          updateSyncStatus('offline');
          showAuthOverlay();
        }
        resolveAuthCheck();
      });
    } catch(err){
      console.error('Firebase auth init failed:', err);
      resolveAuthCheck();
      showAuthOverlay(true);
    }
  },

  async signInWithGoogle(){
    await this.initAuth();
    if(!this.auth || !this.fns.GoogleAuthProvider){ showToast('Sign-in is not ready yet — try again in a moment','clay','alert-triangle'); return; }
    try {
      const provider = new this.fns.GoogleAuthProvider();
      const result = await this.fns.signInWithPopup(this.auth, provider);
      showToast(`Signed in as ${result.user.displayName||result.user.email}`,'forest','check-circle-2');
      return result.user;
    } catch(err) {
      console.error('Google sign-in failed:', err);
      // (2026-07-13) Return null on sign-in error (was throw err)
      if(err.code === 'auth/unauthorized-domain') showToast('Domain not authorized in Firebase Console (' + window.location.hostname + ')', 'clay', 'alert-triangle');
      else if(err.code!=='auth/popup-closed-by-user') showToast('Sign-in failed: '+err.message,'clay','alert-triangle');
      return null;
    }
  },

  async signOutGoogle(){
    if(!this.auth) return;
    if(this.unsub){ this.unsub(); this.unsub=null; }
    this.connected = false; this.ref = null;
    await this.fns.signOut(this.auth);
    showToast('Signed out','clay','log-out');
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
  async pushNow(){
    if(!this.db || !this.ref) return;
    try{
      const payload = {
        towers: state.towers, activeTowerId: state.activeTowerId,
        rows: state.rows, pockets: state.pockets, trays: state.trays,
        expenses: state.expenses, harvests: state.harvests, settings: state.settings,
        completed: state.completed, alertLog: state.alertLog, meta: state.meta,
        _updatedAt: Date.now()
      };
      await this.fns.setDoc(this.ref, payload, { merge:true });
    } catch(err){ console.error('Cloud push failed:', err); }
  }
};

/* ---- Per-user Firestore document: subscribe, and seed on first login ---- */
async function connectFirestoreForUser(user){
  const ref = cloudSync.fns.doc(cloudSync.db, 'hydrotrack_towers', user.uid);
  cloudSync.ref = ref;
  if(cloudSync.unsub) cloudSync.unsub();
  updateSyncStatus('connecting');
  cloudSync.unsub = cloudSync.fns.onSnapshot(ref, (snap)=>{
    if(snap.exists()){
      cloudSync.applyingRemote = true;
      applyRemoteState(snap.data());
      cloudSync.applyingRemote = false;
    } else {
      seedNewAccount(user);
    }
    cloudSync.connected = true;
    updateSyncStatus('connected');
  }, (err)=>{
    console.error('Cloud sync error:', err);
    cloudSync.connected = false;
    updateSyncStatus('error', err.message);
  });
}

/* First time this Google account signs in: start from a clean, empty
   8-row x 3-column vertical tower — no fake demo plants. The expense log
   only pre-fills for the one account this was built around; everyone
   else starts with an empty expense log they fill in themselves. */
function buildCleanAccountState(seedExpenses){
  const rows = Array.from({length:8}, (_,i)=>({ id:'r'+(i+1), towerId:'t1', potCount:3 }));
  const pockets = [];
  let n=1;
  rows.forEach(row=>{ for(let i=0;i<3;i++) pockets.push({ id:n++, rowId:row.id, variety:null, datePlanted:null, override:null }); });
  return {
    towers: [{ id:'t1', name:'Main Tower' }],
    activeTowerId: 't1',
    rows, pockets,
    trays: [],
    expenses: seedExpenses ? JSON.parse(JSON.stringify(DEFAULT_EXPENSES)) : [],
    harvests: [],
    settings: DEFAULT_SETTINGS,
    completed: {},
    alertLog: [],
    meta: { firstPlantPrompted:false }
  };
}
function seedNewAccount(user){
  const isMainAccount = (user.email||'').toLowerCase() === MAIN_ACCOUNT_EMAIL;
  const seed = buildCleanAccountState(isMainAccount);
  cloudSync.applyingRemote = true;
  applyRemoteState(seed);
  cloudSync.applyingRemote = false;
  cloudSync.pushNow();
  if(isMainAccount) showToast('Welcome back — your starter expenses are already filled in','forest','wallet');
}

function applyRemoteState(remote){
  ['towers','rows','pockets','trays','expenses','harvests','settings','completed','alertLog','meta'].forEach(part=>{
    if(remote[part]!==undefined){ state[part] = remote[part]; store.set(KEYS[part], remote[part]); }
  });
  if(remote.activeTowerId!==undefined){
    state.activeTowerId = remote.activeTowerId;
    localStorage.setItem(KEYS.activeTower, remote.activeTowerId);
  }
  if(typeof renderPage==='function') renderPage(typeof currentPageName==='function' ? currentPageName() : 'dashboard');
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
function showAuthOverlay(errored){
  const el = document.getElementById('authOverlay');
  if(!el) return;
  el.classList.remove('hidden');
  document.getElementById('authOverlayLoading')?.classList.add('hidden');
  document.getElementById('authOverlayButtons')?.classList.remove('hidden');
  if(errored) document.getElementById('authOverlayError')?.classList.remove('hidden');
}
function hideAuthOverlay(){
  document.getElementById('authOverlay')?.classList.add('hidden');
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

/* ---- Boot sequence ----
   Show the overlay's loading state immediately (so there's no flash of
   the full app before we know if a session exists), kick off the quiet
   auth check, and only reveal the app once we have an answer — unless
   the person already chose to work offline. */
// (2026-07-13) Remove offline mode bypass in bootAuth; prev: checked OFFLINE_MODE_KEY
async function bootAuth(){
  localStorage.removeItem(OFFLINE_MODE_KEY);
  showAuthOverlay();
  document.getElementById('authOverlayLoading')?.classList.remove('hidden');
  document.getElementById('authOverlayButtons')?.classList.add('hidden');
  await cloudSync.initAuth();
  await authCheckDone;
}
