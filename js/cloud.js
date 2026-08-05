/* ============================================================
   Cloud Sync — real Firebase Firestore integration.
   Loaded lazily (dynamic import) only when the grower connects
   their own Firebase project, so the app stays 100% offline by
   default. Uses Firestore's onSnapshot for true real-time,
   automatic two-way sync across every open tab/device.

   How it works:
   - One Firestore document holds the entire app state:
       hydrotrack_towers/{uid}
   - onSnapshot fires instantly whenever ANY device writes to
     that document — including this one — so all open tabs stay
     in lock-step without polling.
   - Local writes are debounced (600ms) and pushed with setDoc(merge:true).
   - A flag (applyingRemote) prevents a remote update from
     immediately bouncing back out as a duplicate local write.
   ============================================================ */
const CLOUD_CONFIG_KEY = 'ht_cloud_config';
const FIREBASE_CDN = 'https://www.gstatic.com/firebasejs/10.13.0';

const cloudSync = {
  app:null, db:null, auth:null, user:null, unsub:null,
  connected:false, connecting:false, applyingRemote:false, pushTimer:null,
  fns:{},

  getConfig(){ return store.get(CLOUD_CONFIG_KEY, null); },
  saveConfig(cfg){ store.set(CLOUD_CONFIG_KEY, cfg); },
  clearConfig(){ localStorage.removeItem(CLOUD_CONFIG_KEY); },

  async connect(config){
    if(this.connecting) return;
    this.connecting = true;
    updateSyncStatus('connecting');
    try{
      const [{ initializeApp }, firestoreMod, authMod] = await Promise.all([
        import(`${FIREBASE_CDN}/firebase-app.js`),
        import(`${FIREBASE_CDN}/firebase-firestore.js`),
        import(`${FIREBASE_CDN}/firebase-auth.js`)
      ]);
      this.fns = { ...firestoreMod, ...authMod };
      this.app = initializeApp(config, 'hydrotrack-' + Date.now());
      this.db = this.fns.getFirestore(this.app);
      this.auth = this.fns.getAuth(this.app);

// (2026-07-13) Add Google Auth sign-in popup and UI update; prev: anonymous only
      this.fns.onAuthStateChanged(this.auth, (user)=>{
        this.user = user;
        this.updateUserUI(user);
        if(user){
          const ref = this.fns.doc(this.db, 'hydrotrack_towers', user.uid);
          this.ref = ref;
          if(this.unsub) this.unsub();
          this.unsub = this.fns.onSnapshot(ref, (snap)=>{
            if(snap.exists()){
              this.applyingRemote = true;
              applyRemoteState(snap.data());
              this.applyingRemote = false;
            } else {
              this.pushNow();
            }
            this.connected = true;
            updateSyncStatus('connected');
          }, (err)=>{
            console.error('Cloud sync error:', err);
            this.connected = false;
            updateSyncStatus('error', err.message);
          });
        }
      });

      if(!this.auth.currentUser){
        await this.fns.signInAnonymously(this.auth);
      }

      this.saveConfig(config);
      this.connecting = false;
      return true;
    } catch(err){
      this.connecting = false;
      this.connected = false;
      updateSyncStatus('error', err.message);
      throw err;
    }
  },

  async signInWithGoogle(){
    if(!this.auth || !this.fns.GoogleAuthProvider) return;
    try {
      const provider = new this.fns.GoogleAuthProvider();
      const result = await this.fns.signInWithPopup(this.auth, provider);
      this.user = result.user;
      this.updateUserUI(result.user);
      if(typeof showToast!=='undefined') showToast(`Signed in as ${result.user.displayName||result.user.email}`, 'forest', 'user-check');
      return result.user;
    } catch(err) {
      console.error('Google Auth failed:', err);
      if(typeof showToast!=='undefined') showToast('Google Login error: '+err.message, 'clay', 'alert-circle');
      throw err;
    }
  },

  async signOutGoogle(){
    if(!this.auth || !this.fns.signOut) return;
    await this.fns.signOut(this.auth);
    this.user = null;
    this.updateUserUI(null);
    if(typeof showToast!=='undefined') showToast('Signed out of Google', 'clay', 'log-out');
  },

  updateUserUI(user){
    const nameEl = document.getElementById('googleUserName');
    const emailEl = document.getElementById('googleUserEmail');
    const avatarEl = document.getElementById('userAvatar');
    const fallbackEl = document.getElementById('userAvatarFallback');
    const btn = document.getElementById('btnGoogleSignIn');

    if(user && !user.isAnonymous){
      if(nameEl) nameEl.textContent = user.displayName || 'Google User';
      if(emailEl) emailEl.textContent = user.email || '';
      if(user.photoURL && avatarEl){
        avatarEl.src = user.photoURL;
        avatarEl.classList.remove('hidden');
        if(fallbackEl) fallbackEl.classList.add('hidden');
      }
      if(btn){
        btn.innerHTML = '<span>Sign Out</span>';
        btn.onclick = () => this.signOutGoogle();
      }
    } else {
      if(nameEl) nameEl.textContent = 'Guest User';
      if(emailEl) emailEl.textContent = 'Sign in with Google to sync across Web and Android';
      if(avatarEl) avatarEl.classList.add('hidden');
      if(fallbackEl) fallbackEl.classList.remove('hidden');
      if(btn){
        btn.innerHTML = `<svg class="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.15C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.39l3.99-3.15z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.61l3.99 3.15c.95-2.85 3.6-4.96 6.72-4.96z"/></svg><span>Sign in with Google</span>`;
        btn.onclick = () => this.signInWithGoogle();
      }
    }
  },
      updateSyncStatus('error', err.message);
      throw err;
    }
  },

  disconnect(){
    if(this.unsub) this.unsub();
    this.unsub = null; this.app = null; this.db = null; this.user = null;
    this.connected = false;
    this.clearConfig();
    updateSyncStatus('offline');
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
        rows: state.rows, pockets: state.pockets, trays: state.trays,
        expenses: state.expenses, harvests: state.harvests, settings: state.settings,
        completed: state.completed, alertLog: state.alertLog, meta: state.meta,
        _updatedAt: Date.now()
      };
      await this.fns.setDoc(this.ref, payload, { merge:true });
    } catch(err){ console.error('Cloud push failed:', err); }
  }
};

function applyRemoteState(remote){
  ['rows','pockets','trays','expenses','harvests','settings','completed','alertLog','meta'].forEach(part=>{
    if(remote[part]!==undefined){ state[part] = remote[part]; store.set(KEYS[part], remote[part]); }
  });
  renderPage(currentPageName());
}

function updateSyncStatus(status, detail){
  const dot = document.getElementById('syncStatusDot');
  const label = document.getElementById('syncStatusLabel');
  const toolsStatus = document.getElementById('cloudStatusText');
  const map = {
    offline: { color:'#B7C2BA', text:'Offline — local only' },
    connecting: { color:'#E8A33D', text:'Connecting…' },
    connected: { color:'#2F9E5B', text:'Live sync active' },
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

/* Auto-reconnect on load if the grower previously connected a project. */
async function autoReconnectCloud(){
  const cfg = cloudSync.getConfig();
  if(!cfg) { updateSyncStatus('offline'); return; }
  try{ await cloudSync.connect(cfg); }
  catch(err){ /* stays offline; user can retry from Tools */ }
}
