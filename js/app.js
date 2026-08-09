/* ============================================================
   HydroTrack / TowerCrop — application logic
   All persistence flows through `store.*` — swapping this block
   for Firestore + Auth later won't require touching render code.
   ============================================================ */

// (2026-07-13) Add reservoir key to KEYS for pH/EC/Water tracking; prev: none
const KEYS = {
  rows:'ht_rows', pockets:'ht_pockets', trays:'ht_trays', expenses:'ht_expenses',
  harvests:'ht_harvests', settings:'ht_settings', completed:'ht_completed',
  alertLog:'ht_alertlog', meta:'ht_meta', towers:'ht_towers', activeTower:'ht_active_tower', reservoir:'ht_reservoir',
  // (2026-07-13) Add photoLog key for tower-wide growth photo history; prev: none
  photoLog:'ht_photo_log'
};

// (2026-07-13) Expand CROP_PRESETS with popular hydroponic seeds; prev: 8 presets
const CROP_PRESETS = [
  { name:'Black Seeded Simpson', totalDays:45 },
  { name:'Lollo Rossa', totalDays:45 },
  { name:'Batavia Lettuce', totalDays:42 },
  { name:'Butterhead Lettuce', totalDays:45 },
  { name:'Romaine Lettuce', totalDays:50 },
  { name:'Pechay (Bok Choy)', totalDays:35 },
  { name:'Kale', totalDays:50 },
  { name:'Spinach', totalDays:40 },
  { name:'Arugula', totalDays:30 },
  { name:'Genovese Basil', totalDays:45 },
  { name:'Cilantro', totalDays:40 },
  { name:'Parsley', totalDays:50 },
  { name:'Sweet Mint', totalDays:45 },
  { name:'Kangkong', totalDays:30 },
  { name:'Mustard Greens', totalDays:35 },
  { name:'Swiss Chard', totalDays:45 },
  { name:'Spring Onion', totalDays:40 },
  { name:'Custom Variety', totalDays:45 }
];

const STAGES = [
  { key:'germination', label:'Germination', range:[1,3], note:'Dark & humid tray phase.' },
  { key:'cotyledon', label:'Cotyledon & Morning Sun', range:[4,9], note:'Uncover — needs direct morning sun.' },
  { key:'thinning', label:'Thinning Phase', range:[10,11], note:'Snip weak sprouts, keep one per cube.' },
  { key:'transplant', label:'True Leaves & Transplant', range:[12,14], note:'Move rockwool into tower net pots.' },
  { key:'vegetative', label:'Main Growth Phase', range:[15,35], note:'Recirculating nutrient solution running.' },
  { key:'harvest', label:'Harvest Window', range:[36,9999], note:'Harvest heads or outer leaves.' }
];

const STATUS_BY_STAGE = { germination:'seedling', cotyledon:'seedling', thinning:'seedling', transplant:'transplanted', vegetative:'vegetative', harvest:'harvest' };
const STATUS_LABEL = { seedling:'Seedling', transplanted:'Transplanted', vegetative:'Vegetative', harvest:'Harvest Ready', empty:'Empty' };
const STATUS_HEX = { seedling:'#EFCB5A', transplanted:'#8CD9A0', vegetative:'#2F8F4E', harvest:'#E8A33D', empty:'#E2E8E4' };

const DEFAULT_EXPENSES = [
  { id:'e1', name:'PVC Pipes & Channels (3 tiers)', amount:1450, category:'Equipment' },
  { id:'e2', name:'Bucket Reservoir (30L)', amount:420, category:'Equipment' },
  { id:'e3', name:'Submersible Water Pump', amount:650, category:'Equipment' },
  { id:'e4', name:'Support Frame & End Caps', amount:380, category:'Equipment' },
  { id:'e5', name:'Spray Paint (Pipe Coating)', amount:120, category:'Equipment' },
  { id:'e6', name:'Net Pots (24 pcs)', amount:360, category:'Equipment' },
  { id:'e7', name:'Lettuce Seeds (Assorted)', amount:220, category:'Consumables' },
  { id:'e8', name:'Rockwool Cubes', amount:300, category:'Consumables' },
  { id:'e9', name:'SNAP Nutrient Solution A & B', amount:420, category:'Consumables' }
];

const DEFAULT_SETTINGS = {
  sunReminder:false, heatReminder:false, nightReminder:false,
  sunTime:'07:00', heatTime:'11:00', nightTime:'18:00',
  rainAlerts:false, windAlerts:false, browserNotifs:false, location:'Bogo City'
};

/* ---------------- storage module ---------------- */
const SCHEMA_VERSION = 2; // bump whenever default/sample data shape changes (e.g. row x column layout)
const store = {
  get(key, fallback){ try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch(e){ return fallback; } },
  set(key, val){ localStorage.setItem(key, JSON.stringify(val)); },
  init(){
    const storedVersion = Number(localStorage.getItem('ht_schema_version')||0);
    if(storedVersion !== SCHEMA_VERSION){
      // Sample/demo layout changed since this browser last loaded the app —
      // wipe the old auto-seeded data so the new defaults take over. This
      // never touches a real Firebase-synced document, only local storage.
      Object.values(KEYS).forEach(k=>localStorage.removeItem(k));
      localStorage.removeItem('ht_notified');
      localStorage.setItem('ht_schema_version', String(SCHEMA_VERSION));
    }
    // (2026-07-13) Add multi-tower support with default 4 rows; prev: single tower
    if(!localStorage.getItem(KEYS.towers)){
      this.set(KEYS.towers, [{ id:'t1', name:'Main Tower' }]);
      localStorage.setItem(KEYS.activeTower, 't1');
    }
    if(!localStorage.getItem(KEYS.rows)){
      // Production tower: 8 rows x 3 columns, all empty for manual setup
      const rowIds = ['r1','r2','r3','r4','r5','r6','r7','r8'];
      const rows = rowIds.map(id=>({ id, towerId:'t1', potCount:3 }));
      const pockets = [];
      let n=1;
      
      // All pockets start empty - user fills manually
      rowIds.forEach((rowId)=>{
        for(let i=0;i<3;i++){
          pockets.push({ 
            id:n++, 
            rowId, 
            variety: null, 
            datePlanted: null, 
            override: null 
          });
        }
      });
      
      this.set(KEYS.rows, rows);
      this.set(KEYS.pockets, pockets);
    }
    
    // Empty nursery - no demo trays
    if(!localStorage.getItem(KEYS.trays)) {
      this.set(KEYS.trays, []);
    }
    
    // Keep real expenses as initial equipment cost
    if(!localStorage.getItem(KEYS.expenses)) {
      const initialDate = todayISO();
      const realExpenses = DEFAULT_EXPENSES.map(exp => ({
        ...exp,
        date: initialDate
      }));
      this.set(KEYS.expenses, realExpenses);
    }
    
    if(!localStorage.getItem(KEYS.harvests)) this.set(KEYS.harvests, []);
    if(!localStorage.getItem(KEYS.settings)) this.set(KEYS.settings, DEFAULT_SETTINGS);
    if(!localStorage.getItem(KEYS.completed)) this.set(KEYS.completed, {});
    if(!localStorage.getItem(KEYS.alertLog)) this.set(KEYS.alertLog, []);
    if(!localStorage.getItem(KEYS.meta)) this.set(KEYS.meta, { firstPlantPrompted:false });
    // (2026-07-13) Initialize reservoir data for pH/EC/Water tracking; prev: none
    if(!localStorage.getItem(KEYS.reservoir)) this.set(KEYS.reservoir, { ph:6.0, targetPh:6.0, ec:1.6, targetEc:1.8, tempC:22, waterPct:85, capacityLiters:30, history:[] });
  }
};

/* ---------------- helpers ---------------- */
function uid(){ return Math.random().toString(36).slice(2,10); }
function todayISO(){ const d=new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); }
function daysAgoISO(n){ const d=new Date(); d.setDate(d.getDate()-n); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); }
function addDays(iso,n){ const d=new Date(iso+'T00:00:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
function dayOfCycle(dateISO){ const start=new Date(dateISO+'T00:00:00'); const now=new Date(); now.setHours(0,0,0,0); return Math.floor((now-start)/86400000)+1; }
function stageForDay(day){ for(const s of STAGES){ if(day>=s.range[0] && day<=s.range[1]) return s; } return day<1?STAGES[0]:STAGES[STAGES.length-1]; }
function stageIndex(key){ return STAGES.findIndex(s=>s.key===key); }
function fmtPeso(n){ return Math.round(n).toLocaleString('en-PH'); }
function fmtDate(iso){ if(!iso) return '—'; return new Date(iso+'T00:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}); }

/* ---- Image compression for Firebase (fixes "invalid nested entity" error) ---- */
function compressImage(file, maxWidth = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Scale down if larger than maxWidth
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to JPEG with quality compression
        canvas.toBlob(
          (blob) => {
            if(!blob){ reject(new Error('Compression failed')); return; }
            const compressedReader = new FileReader();
            compressedReader.onload = () => resolve(compressedReader.result);
            compressedReader.onerror = reject;
            compressedReader.readAsDataURL(blob);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Calculate file size from base64 data URL
function getFileSizeFromDataUrl(dataUrl) {
  if(!dataUrl) return '0 KB';
  // Remove data URL prefix to get base64 string
  const base64 = dataUrl.split(',')[1] || '';
  // Calculate actual size (base64 is ~4/3 of original)
  const sizeBytes = (base64.length * 3) / 4;
  
  if (sizeBytes < 1024) return `${sizeBytes.toFixed(0)} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getPocketState(p){
  if(!p.variety) return { status:'empty', stage:null, day:0 };
  const day = Math.max(1, dayOfCycle(p.datePlanted));
  const stage = (p.override!=null) ? STAGES[p.override] : stageForDay(day);
  return { status: STATUS_BY_STAGE[stage.key], stage, day };
}

/** Estimate when this plant (or tray) moves into its next stage. */
function nextTransitionInfo(day, stageKeyOrObj){
  const stage = typeof stageKeyOrObj==='string' ? STAGES.find(s=>s.key===stageKeyOrObj) : stageKeyOrObj;
  const idx = stageIndex(stage.key);
  if(idx>=STAGES.length-1){
    return { done:true, label:'Harvest window is open', daysUntil:0, date:null };
  }
  const next = STAGES[idx+1];
  const daysUntil = next.range[0]-day;
  const date = addDays(todayISO(), Math.max(0,daysUntil));
  return { done:false, label:next.label, daysUntil: Math.max(0,daysUntil), date, nextKey:next.key };
}

/* ================= INIT ================= */
store.init();
let state = {
  towers: store.get(KEYS.towers, [{ id:'t1', name:'Main Tower' }]),
  activeTowerId: localStorage.getItem(KEYS.activeTower) || 't1',
  rows: store.get(KEYS.rows, []),
  pockets: store.get(KEYS.pockets, []),
  trays: store.get(KEYS.trays, []),
  expenses: store.get(KEYS.expenses, []),
  harvests: store.get(KEYS.harvests, []),
  settings: store.get(KEYS.settings, DEFAULT_SETTINGS),
  completed: store.get(KEYS.completed, {}),
  alertLog: store.get(KEYS.alertLog, []),
  meta: store.get(KEYS.meta, { firstPlantPrompted:false }),
  // (2026-07-13) Tower-wide photo history log; prev: per-plant p.photo only
  photoLog: store.get(KEYS.photoLog, []),
  reservoir: store.get(KEYS.reservoir, { ph:6.0, targetPh:6.0, ec:1.6, targetEc:1.8, tempC:22, waterPct:85, capacityLiters:30, history:[] })
};
// Ensure all rows have a towerId assigned
state.rows.forEach(r => { if(!r.towerId) r.towerId = 't1'; });

function getActiveTower(){
  let t = state.towers.find(x=>x.id===state.activeTowerId);
  if(!t){
    if(state.towers.length===0){
      t = { id:'t1', name:'Main Tower' };
      state.towers.push(t);
      persist('towers');
    } else {
      t = state.towers[0];
    }
    state.activeTowerId = t.id;
    localStorage.setItem(KEYS.activeTower, t.id);
  }
  return t;
}
function persist(part){
  if(state[part]===undefined) return;
  store.set(KEYS[part], state[part]);
  if(typeof cloudSync!=='undefined' && cloudSync.connected && !cloudSync.applyingRemote) cloudSync.pushDebounced();
}
// (2026-07-13) White bg undo snackbar with text line break; prev: dark bg
let activeUndoTimer = null;
let activeUndoInterval = null;
function triggerUndoSnackbar(message, restoreFn){
  if(activeUndoTimer){ clearTimeout(activeUndoTimer); activeUndoTimer = null; }
  if(activeUndoInterval){ clearInterval(activeUndoInterval); activeUndoInterval = null; }
  const existing = document.getElementById('undoSnackbar');
  if(existing) existing.remove();

  const snackbar = document.createElement('div');
  snackbar.id = 'undoSnackbar';
  snackbar.style.cssText = 'position:fixed; bottom:max(5.5rem, calc(4.5rem + env(safe-area-inset-bottom))); left:50%; transform:translateX(-50%); z-index:99999; background-color:#FFFFFF !important; color:#0F172A !important; padding:10px 14px; border-radius:16px; box-shadow:0 10px 25px rgba(0,0,0,0.18); display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:12px; font-weight:600; border:1.5px solid #CBD5E1; max-width:88vw; min-width:280px;';
  
  let seconds = 5;
  snackbar.innerHTML = `
    <span style="color:#0F172A !important; font-size:12px; font-weight:600; word-break:break-word; white-space:normal; line-height:1.35; flex:1; min-width:0;">${message}</span>
    <button id="btnUndoAction" type="button" style="background-color:#166534 !important; color:#FFFFFF !important; font-size:11.5px; font-weight:700; padding:6px 12px; border-radius:10px; border:none; cursor:pointer; display:flex; align-items:center; gap:6px; flex-shrink:0; box-shadow:0 2px 6px rgba(0,0,0,0.12);">
      <span style="color:#FFFFFF !important;">Undo</span>
      <span id="undoCountdown" style="background-color:rgba(255,255,255,0.3) !important; color:#FFFFFF !important; font-family:monospace; font-weight:700; font-size:10.5px; padding:1.5px 5px; border-radius:5px;">5s</span>
    </button>
  `;

  document.body.appendChild(snackbar);

  const countdownEl = snackbar.querySelector('#undoCountdown');
  const btnUndo = snackbar.querySelector('#btnUndoAction');

  btnUndo.addEventListener('click', ()=>{
    if(activeUndoTimer){ clearTimeout(activeUndoTimer); activeUndoTimer = null; }
    if(activeUndoInterval){ clearInterval(activeUndoInterval); activeUndoInterval = null; }
    snackbar.remove();
    restoreFn();
    showToast('Action undone', 'forest', 'check');
  });

  activeUndoInterval = setInterval(()=>{
    seconds--;
    if(countdownEl) countdownEl.textContent = `${seconds}s`;
    if(seconds <= 0){
      clearInterval(activeUndoInterval);
      activeUndoInterval = null;
      if(snackbar.parentElement) snackbar.remove();
    }
  }, 1000);

  activeUndoTimer = setTimeout(()=>{
    if(activeUndoInterval){ clearInterval(activeUndoInterval); activeUndoInterval = null; }
    if(snackbar.parentElement) snackbar.remove();
    activeUndoTimer = null;
  }, 5200);
}
function hasAnyPlant(){ return state.pockets.some(p=>p.variety) || state.trays.length>0; }

/* ================= AUTO-NOTIFY AFTER FIRST PLANT =================
   The moment the grower's first plant exists (tray or pocket), we
   switch every reminder toggle on automatically and surface a single
   permission prompt. Browsers require a real user click to grant
   Notification access, so "automatic" here means: no more hunting
   through settings — the prompt finds the grower instead. */
function maybeTriggerFirstPlantFlow(){
  if(state.meta.firstPlantPrompted) return;
  if(!hasAnyPlant()) return;
  state.meta.firstPlantPrompted = true;
  state.settings.sunReminder = true; state.settings.heatReminder = true; state.settings.nightReminder = true;
  state.settings.rainAlerts = true; state.settings.windAlerts = true;
  persist('meta'); persist('settings');
  showFirstPlantBanner();
}
function showFirstPlantBanner(){
  const el = document.getElementById('firstPlantPrompt');
  if(!el) return;
  el.classList.remove('hidden');
}

/* ================= NAVIGATION ================= */
// (2026-07-13) Fast subtle page fade-out fade-in transition; prev: instant toggle
function showPage(name, opts){
  const activePage = document.querySelector('.page:not(.hidden)');
  const targetPage = document.getElementById('page-'+name);
  if(!targetPage) return;

  if(activePage && activePage !== targetPage && !opts?.instant){
    activePage.classList.add('page-exit');
    setTimeout(()=>{
      activePage.classList.remove('page-exit');
      activePage.classList.add('hidden');
      performPageSwitch(name, targetPage, opts);
    }, 60);
  } else {
    performPageSwitch(name, targetPage, opts);
  }
}

// (2026-07-13) Save active page in localStorage for page reload; prev: default dashboard
function performPageSwitch(name, pageEl, opts){
  try { localStorage.setItem('ht_active_page', name); } catch(e){}
  document.querySelectorAll('.page').forEach(p=>{ if(p!==pageEl) p.classList.add('hidden'); });
  pageEl.classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b=>{
    const active = b.dataset.page===name;
    b.classList.toggle('active', active);
    b.setAttribute('aria-current', active ? 'page' : 'false');
  });
  document.querySelectorAll('.tab-btn').forEach(b=>{
    const active = b.dataset.page===name;
    b.classList.toggle('active', active);
    b.setAttribute('aria-current', active ? 'page' : 'false');
  });
  renderPage(name);
  window.scrollTo({top:0,behavior:'instant'});
  if(opts?.fromNav){
    const heading = pageEl.querySelector('h1');
    if(heading){ heading.setAttribute('tabindex','-1'); heading.focus({preventScroll:true}); }
  }
  announce(`${name.charAt(0).toUpperCase()+name.slice(1)} page loaded`);
}
function announce(msg){
  const region = document.getElementById('a11yLiveRegion');
  if(region) region.textContent = msg;
}
document.querySelectorAll('[data-page]').forEach(btn=>btn.addEventListener('click', ()=>showPage(btn.dataset.page, {fromNav:true})));
document.querySelectorAll('[data-goto]').forEach(btn=>btn.addEventListener('click', ()=>showPage(btn.dataset.goto, {fromNav:true})));

function renderPage(name){
  if(name==='dashboard') renderDashboard();
  if(name==='tower') renderTower();
  if(name==='nursery') renderNursery();
  if(name==='reminders') renderReminders();
  if(name==='expenses') renderExpenses();
  if(name==='tools') renderTools();
}

// (2026-07-13) Define MAX_TOASTS constant for showToast; prev: undefined variable
const MAX_TOASTS = 3;

function showToast(msg, tone='forest', iconName='info', opts){
  const wrap = document.getElementById('toastContainer');
  if(!wrap) return;
  announce(msg.replace(/<[^>]+>/g,''));
  const existingToasts = wrap.querySelectorAll('.toast');
  if(existingToasts.length >= MAX_TOASTS){
    existingToasts[0].remove();
  }
  const el = document.createElement('div');
  const bg = { forest:'bg-forest', clay:'bg-clay', gold:'bg-gold' }[tone] || 'bg-forest';
  el.className = `toast ${bg} text-white text-[13px] font-medium px-4 py-3 rounded-xl shadow-lg flex items-center justify-between gap-3 max-w-sm pointer-events-auto`;
  
  let actionHtml = '';
  if(opts && opts.actionLabel){
    actionHtml = `<button id="toastActionBtn" type="button" class="ml-2 bg-white/20 hover:bg-white/35 active:scale-95 text-white font-semibold text-[11.5px] px-2.5 py-1 rounded-lg transition-all underline flex-shrink-0">${opts.actionLabel}</button>`;
  }

  el.innerHTML = `<div class="flex items-center gap-2 min-w-0">${icon(iconName,'w-4 h-4 flex-shrink-0',16)}<span class="truncate">${msg}</span></div>${actionHtml}`;
  wrap.appendChild(el);

  if(opts && opts.onAction){
    const btn = el.querySelector('#toastActionBtn');
    if(btn){
      btn.onclick = (ev) => {
        ev.stopPropagation();
        el.remove();
        opts.onAction();
      };
    }
  }

  setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateX(16px)'; el.style.transition='.25s'; setTimeout(()=>el.remove(),260); }, 4500);
}

/* ================= CONFIRMATION MODAL ================= */
function showConfirm(message, title='Confirm Action'){
  return new Promise((resolve)=>{
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalMessage').textContent = message;
    modal.classList.remove('hidden');
    
    const handleConfirm = ()=>{
      cleanup();
      resolve(true);
    };
    const handleCancel = ()=>{
      cleanup();
      resolve(false);
    };
    const cleanup = ()=>{
      modal.classList.add('hidden');
      document.getElementById('confirmModalConfirm').removeEventListener('click', handleConfirm);
      document.getElementById('confirmModalCancel').removeEventListener('click', handleCancel);
    };
    
    document.getElementById('confirmModalConfirm').addEventListener('click', handleConfirm);
    document.getElementById('confirmModalCancel').addEventListener('click', handleCancel);
  });
}

/* ---- 24h "HH:MM" -> "7:00 AM" style label ---- */
function formatTimeLabel(hhmm){
  const [h,m] = (hhmm||'07:00').split(':').map(Number);
  const period = h>=12 ? 'PM' : 'AM';
  const h12 = ((h%12)||12);
  return `${h12}:${String(m).padStart(2,'0')} ${period}`;
}

/* ================= TASKS + UPCOMING TRANSITIONS ================= */
function towerNameForRow(row){
  const t = state.towers.find(x=>x.id===(row.towerId||'t1'));
  return t ? t.name : 'Tower';
}
function locationLabel(row){
  return state.towers.length>1 ? `${towerNameForRow(row)} · ${rowLabel(row)}` : rowLabel(row);
}
function computeTasks(){
  const tasks = [];
  if(state.settings.sunReminder) tasks.push({ id:'sun-morning', time:formatTimeLabel(state.settings.sunTime), text:'Put seedling trays in direct morning sun', iconName:'sun' });
  if(state.settings.heatReminder) tasks.push({ id:'heat-midday', time:formatTimeLabel(state.settings.heatTime), text:'Move trays to shade — scorching midday heat', iconName:'thermometer' });
  if(state.settings.nightReminder) tasks.push({ id:'dark-night', time:formatTimeLabel(state.settings.nightTime), text:'Turn off porch lights — plants need full darkness', iconName:'moon' in ICONS ? 'moon':'bell' });

  state.trays.forEach(t=>{
    const day = dayOfCycle(t.startDate);
    if(day===3) tasks.push({ id:'tray-'+t.id+'-d3', time:'Milestone', text:`Sprouts appearing in "${t.variety}" tray — uncover & check the water puddle`, iconName:'sprout' });
    if(day===10) tasks.push({ id:'tray-'+t.id+'-d10', time:'Milestone', text:`Thinning time for "${t.variety}" — keep 1 sprout per cube`, iconName:'scissors' });
    if(day>=12) tasks.push({ id:'tray-'+t.id+'-ready', time:'Milestone', text:`"${t.variety}" tray is ready to transplant to a tower`, iconName:'move-up-right' });
  });

  state.pockets.forEach(p=>{
    if(!p.variety) return;
    const {stage, day} = getPocketState(p);
    const row = state.rows.find(r=>r.id===p.rowId);
    if(stage.key==='harvest' && day===36) tasks.push({ id:'pocket-'+p.id+'-harvest', time:'Milestone', text:`${row?locationLabel(row):''} · #${p.id} (${p.variety}) entered its harvest window`, iconName:'scissors' });
  });
  return tasks;
}
function upcomingTransitions(limit){
  const items = [];
  state.trays.forEach(t=>{
    const day = Math.max(1,dayOfCycle(t.startDate));
    const stage = stageForDay(day);
    const est = nextTransitionInfo(day, stage);
    if(!est.done) items.push({ label:t.variety, sub:'Nursery Tray', next:est.label, daysUntil:est.daysUntil, date:est.date, iconName:'sprout' });
  });
  state.pockets.forEach(p=>{
    if(!p.variety) return;
    const {stage, day} = getPocketState(p);
    const row = state.rows.find(r=>r.id===p.rowId);
    const est = nextTransitionInfo(day, stage);
    if(!est.done) items.push({ label:p.variety, sub:`${row?locationLabel(row):'Row'} · Pocket #${p.id}`, next:est.label, daysUntil:est.daysUntil, date:est.date, iconName:'waypoints' });
  });
  items.sort((a,b)=>a.daysUntil-b.daysUntil);
  return items.slice(0, limit||6);
}

/* ================= DASHBOARD ================= */
function renderDashboard(){
  document.getElementById('dateToday').textContent = new Date().toLocaleDateString('en-PH',{weekday:'long', month:'long', day:'numeric', year:'numeric'});

  const activePlants = state.pockets.filter(p=>p.variety).length;
  const totalPockets = state.pockets.length;
  const seedlingCount = state.trays.reduce((s,t)=>s+Number(t.count||0),0);
  const totalSpent = state.expenses.reduce((s,e)=>s+Number(e.amount||0),0);
  const totalGrams = state.harvests.reduce((s,h)=>s+Number(h.grams||0),0);
  const savings = (totalGrams/1000)*500;
  const roi = totalSpent>0 ? (savings/totalSpent*100) : 0;

  document.getElementById('statActivePlants').textContent = `${activePlants}/${totalPockets}`;
  // (2026-07-13) Line-break multi-tower label; prev: single line with em dash
  const activeLabel = document.getElementById('statActivePlantsLabel');
  if(activeLabel) activeLabel.innerHTML = state.towers.length>1 ? `Active Plants<br><span style="font-size:0.9em;">All ${state.towers.length} Towers</span>` : 'Active Plants on Tower';
  document.getElementById('statSeedlings').textContent = seedlingCount;
  document.getElementById('statSpent').textContent = fmtPeso(totalSpent);
  document.getElementById('statROI').textContent = roi.toFixed(1);

  // (2026-07-13) Show rain warning banner on dashboard when rain prob > 50%; prev: none
  const rainBanner = document.getElementById('dashboardWeatherRainBanner');
  if(rainBanner){
    const lw = (typeof weatherService !== 'undefined') ? weatherService.lastWeather : null;
    const precipProb = lw?.daily?.precipitationProbMax?.[0] || 0;
    const isRainy = (state.settings?.rainAlert !== false) && (precipProb > 50 || lw?.current?.precipitation > 0);
    if(isRainy && !sessionStorage.getItem('dismiss_rain_banner')){
      rainBanner.classList.remove('hidden');
      document.getElementById('btnDismissRainBanner')?.addEventListener('click', ()=>{
        sessionStorage.setItem('dismiss_rain_banner', '1');
        rainBanner.classList.add('hidden');
      });
    } else {
      rainBanner.classList.add('hidden');
    }
  }

  const tasks = computeTasks();
  const today = todayISO();
  const listEl = document.getElementById('taskList');
  listEl.innerHTML = '';
  if(tasks.length===0){
    listEl.innerHTML = `<div class="text-center py-6 text-ink-soft text-[13px]">No tasks scheduled yet — plant your first tray or pocket to switch reminders on automatically.</div>`;
  }
  let doneCount = 0;
  tasks.forEach(t=>{
    const ck = `${today}_${t.id}`;
    const isDone = !!state.completed[ck];
    if(isDone) doneCount++;
    const row = document.createElement('label');
    row.className = 'flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-cream cursor-pointer';
    row.innerHTML = `
      <input type="checkbox" class="task-check mt-0.5 w-4 h-4 rounded" ${isDone?'checked':''}>
      <span class="w-7 h-7 rounded-lg bg-mint flex items-center justify-center text-forest flex-shrink-0">${icon(t.iconName,'w-3.5 h-3.5',14)}</span>
      <div class="flex-1">
        <div class="text-[13.5px] font-medium ${isDone?'line-through text-ink-soft':'text-ink'}">${t.text}</div>
        <div class="text-[11px] text-ink-soft mt-0.5 font-mono">${t.time}</div>
      </div>`;
    row.querySelector('input').addEventListener('change', (e)=>{ state.completed[ck]=e.target.checked; persist('completed'); renderDashboard(); });
    listEl.appendChild(row);
  });
  document.getElementById('taskProgressLabel').textContent = `${doneCount}/${tasks.length}`;
  document.getElementById('taskProgressBar').style.width = tasks.length ? (doneCount/tasks.length*100)+'%' : '0%';

  // Upcoming stage transitions (estimates)
  const upcoming = document.getElementById('upcomingList');
  const items = upcomingTransitions(6);
  upcoming.innerHTML = items.length ? '' : `<div class="text-center py-6 text-ink-soft text-[13px]">Nothing due — add a tray or assign a pocket to see estimates here.</div>`;
  items.forEach(it=>{
    const urgent = it.daysUntil<=1;
    const row = document.createElement('div');
    row.className = 'flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-cream';
    row.innerHTML = `
      <span class="w-7 h-7 rounded-lg ${urgent?'bg-[#FCEBD8] text-clay':'bg-mint text-forest'} flex items-center justify-center flex-shrink-0">${icon(it.iconName,'w-3.5 h-3.5',14)}</span>
      <div class="flex-1 min-w-0">
        <div class="text-[13px] font-medium text-ink truncate">${it.label} <span class="text-ink-soft font-normal">· ${it.sub}</span></div>
        <div class="text-[11.5px] text-ink-soft">${it.next}</div>
      </div>
      <div class="text-right flex-shrink-0">
        <div class="font-mono text-[12.5px] font-semibold ${urgent?'text-clay':'text-forest'}">${it.daysUntil===0?'Today':it.daysUntil+'d'}</div>
        <div class="text-[10px] text-ink-soft">${fmtDate(it.date)}</div>
      </div>`;
    upcoming.appendChild(row);
  });

  // (2026-07-13) Support Growth Gallery on tower page; prev: dashboard only
  renderGrowthGallery('galleryStrip');
  renderGrowthGallery('galleryStripTower');

  renderAlertBanner('alertBanner');
  // (2026-07-13) Render reservoir health card on dashboard; prev: none
  renderReservoirWidget();
  document.getElementById('firstPlantPrompt')?.classList.toggle('hidden', state.meta.firstPlantPrompted!==true || state.settings.browserNotifs);
}

// (2026-07-13) Show stage modal on Growth Gallery click; prev: STAGE_DESCRIPTIONS error
function renderGrowthGallery(containerId){
  const gallery = document.getElementById(containerId);
  if(!gallery) return;
  gallery.innerHTML = '';
  STAGES.forEach(meta=>{
    const key = meta.key;
    const card = document.createElement('button');
    card.type = 'button';
    // (2026-07-13) Center content vertically inside stage cards; prev: justify-between
    card.className = 'flex flex-col items-center justify-center text-center bg-cream hover:bg-mint/80 rounded-xl p-3 sm:p-3.5 transition-all border border-transparent hover:border-leaf/30 shadow-xs cursor-pointer';
    const dayText = meta.range[1]>900 ? `Day ${meta.range[0]}+` : `Day ${meta.range[0]}-${meta.range[1]}`;
    card.innerHTML = `${plantIcon(key, 36)}<div class="mt-1.5"><div class="text-[10.5px] font-semibold text-ink leading-tight">${meta.label.split(' ')[0]}</div><div style="font-size:7.5px !important; line-height:1 !important; font-weight:600; color:#64748B !important; margin-top:2px;">${dayText}</div></div>`;
    card.addEventListener('click', ()=>openStageDetailModal(meta));
    gallery.appendChild(card);
  });
}

function openStageDetailModal(meta){
  let existing = document.getElementById('stageDetailModal');
  if(existing) existing.remove();
  const dayStr = meta.range[1]>900 ? `Day ${meta.range[0]}+` : `Day ${meta.range[0]} – ${meta.range[1]}`;
  const modal = document.createElement('div');
  modal.id = 'stageDetailModal';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');
  modal.className = 'fixed inset-0 z-[75] modal-backdrop flex items-end md:items-center justify-center p-0 md:p-4';
  modal.innerHTML = `
    <div class="modal-panel bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-3xl p-5 md:p-6 shadow-2xl">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="p-2.5 rounded-xl bg-mint/50 border border-leaf/30">${plantIcon(meta.key, 40)}</div>
          <div>
            <h3 class="font-display font-bold text-[17px] text-forest leading-tight">${meta.label}</h3>
            <span class="text-[11px] font-semibold font-mono text-forest bg-mint px-2.5 py-0.5 rounded-full inline-block mt-0.5">${dayStr}</span>
          </div>
        </div>
        <button id="stageDetailClose" class="w-8 h-8 rounded-full bg-cream hover:bg-cream-dark flex items-center justify-center text-ink-soft font-bold text-[14px]">✕</button>
      </div>
      <div class="bg-cream/60 rounded-2xl p-4 border border-line/60 mb-4">
        <div class="text-[11px] font-semibold text-ink-soft uppercase tracking-wider mb-1">Stage Care & Instructions</div>
        <p class="text-[13px] text-ink font-medium leading-relaxed">${meta.note}</p>
      </div>
      <button id="stageDetailDone" class="w-full bg-forest text-white font-semibold text-[13.5px] py-2.5 rounded-xl shadow-sm">Got It</button>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('stageDetailClose').onclick = ()=>modal.remove();
  document.getElementById('stageDetailDone').onclick = ()=>modal.remove();
  modal.addEventListener('click', ev=>{ if(ev.target===modal) modal.remove(); });
}

/* ================= TOWER (rows x columns) ================= */
function rowLabel(row){
  const towerId = row.towerId || 't1';
  const towerRows = state.rows.filter(r=>(r.towerId||'t1')===towerId);
  const idx = towerRows.findIndex(r=>r.id===row.id);
  return `Row ${idx+1}`;
}
function rowSummary(row){
  const pockets = state.pockets.filter(p=>p.rowId===row.id);
  const planted = pockets.filter(p=>p.variety);
  if(planted.length===0) return 'Empty row';
  const varieties = [...new Set(planted.map(p=>p.variety))];
  const days = planted.map(p=>getPocketState(p).day);
  const minD = Math.min(...days), maxD = Math.max(...days);
  const varietyLabel = varieties.length===1 ? varieties[0] : `${varieties.length} varieties`;
  const dayLabel = minD===maxD ? `Day ${minD}` : `Day ${minD}–${maxD}`;
  const emptyNote = planted.length<pockets.length ? ` · ${pockets.length-planted.length} empty` : '';
  return `${varietyLabel} · ${dayLabel}${emptyNote}`;
}

/* Realistic single-cylinder tower (matches the real product: one vertical pipe
   sitting in a black reservoir with a white lid). 8 tiers x 3 pockets/tier by
   default, fully parametric so Add/Remove Row redraws it correctly. Every
   pocket is a real interactive <g data-pocket-id> element — see the pointer
   handlers wired in initTowerInteraction() below for tap / long-press / drag-select. */
function pocketAriaLabel(id){
  const p = state.pockets.find(x=>x.id===id);
  if(!p || !p.variety) return `Pocket ${id}, empty`;
  const {stage, day} = getPocketState(p);
  return `Pocket ${id}, ${p.variety}, ${stage.label}, day ${day}`;
}
// (2026-07-13) Render health status outline rings on visualizer SVG pots; prev: static stroke
function potCup(id, ax, ay, nx, ny, status, stageKey){
  const ring = `<circle class="pocket-select-ring" cx="${ax}" cy="${ay+9}" r="19" fill="none" stroke="#E8A33D" stroke-width="3.5" opacity="0"/>`;
  const iconR = 12;
  const hitCircle = `<circle cx="${ax}" cy="${ay+9}" r="24" fill="#000000" fill-opacity="0"/>`;
  const pData = state.pockets.find(p=>String(p.id)===String(id));
  const health = pData ? (pData.health || 'healthy') : 'healthy';
  const isOccupied = pData && pData.variety;
  const strokeColor = !isOccupied ? '#E3E9E3' : (health === 'unhealthy' ? '#F59E0B' : (health === 'dead' ? '#EF4444' : '#22C55E'));
  const strokeW = isOccupied ? '2.5' : '1.5';
  return `<g class="tower-pocket" data-pocket-id="${id}" data-status="${status}" tabindex="0" role="button" aria-label="${pocketAriaLabel(id)}">${hitCircle}
    <line x1="${nx}" y1="${ny}" x2="${ax}" y2="${ay+8}" stroke="#C7D1CA" stroke-width="5" stroke-linecap="round"/>
    <path d="M${ax-15} ${ay+8} Q${ax-16} ${ay+24} ${ax} ${ay+26} Q${ax+16} ${ay+24} ${ax+15} ${ay+8} Z" fill="url(#pipeGrad)" stroke="#C2CCC5" stroke-width="1.5"/>
    <circle cx="${ax}" cy="${ay+9}" r="${iconR+2}" fill="#FFFFFF" stroke="${strokeColor}" stroke-width="${strokeW}"/>
    <g transform="translate(${ax-iconR},${ay+9-iconR}) scale(${(iconR*2)/100})">${plantIconInner(stageKey)}</g>
    ${ring}
  </g>`;
}
function buildTowerSVG(filterVariety, targetRows){
  const rows = targetRows || state.rows;
  const pipeR = 26, tierH = 96, capH = 40, basinH = 118, marginTop = 6, W = 300;
  const H = marginTop + capH + rows.length*tierH + basinH;
  const cx = W/2;
  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto select-none" id="towerSvgRoot">`;
  svg += `<defs>
    <linearGradient id="pipeGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#E3E9E3"/><stop offset=".45" stop-color="#FFFFFF"/><stop offset="1" stop-color="#CBD5CE"/>
    </linearGradient>
    <linearGradient id="bowlGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2B2F33"/><stop offset="1" stop-color="#131619"/>
    </linearGradient>
  </defs>`;

  const pipeTop = marginTop + capH;
  const pipeBottom = pipeTop + rows.length*tierH;
  svg += `<rect x="${cx-pipeR}" y="${pipeTop-8}" width="${pipeR*2}" height="${pipeBottom-pipeTop+16}" rx="${pipeR*0.35}" fill="url(#pipeGrad)" stroke="#C2CCC5" stroke-width="1.5"/>`;
  svg += `<ellipse cx="${cx}" cy="${pipeTop-8}" rx="${pipeR}" ry="9" fill="#FFFFFF" stroke="#C2CCC5" stroke-width="1.5"/>`;

  rows.forEach((row, i)=>{
    const tierY = pipeTop + tierH*i + tierH*0.34;
    const pockets = state.pockets.filter(p=>p.rowId===row.id);
    const offsets = [-60, 0, 60];
    pockets.forEach((p, idx)=>{
      const {status, stage} = getPocketState(p);
      const stageKey = stage ? stage.key : 'empty';
      const dim = filterVariety && p.variety!==filterVariety;
      const off = offsets[idx]!==undefined?offsets[idx]:0;
      const ax = cx + off;
      const isCenter = idx===1;
      const ay = isCenter ? tierY+22 : tierY;
      const nx = cx + (off<0?-pipeR:off>0?pipeR:0);
      const ny = isCenter ? tierY-6 : tierY-2;
      svg += `<g opacity="${dim?0.28:1}">${potCup(p.id, ax, ay, nx, ny, status, stageKey)}</g>`;
    });
    svg += `<text x="10" y="${tierY+2}" font-size="11" font-family="Montserrat,sans-serif" font-weight="600" fill="#8B9791" text-anchor="start">${rowLabel(row)}</text>`;
  });

  const lidY = pipeBottom + 10;
  svg += `<ellipse cx="${cx}" cy="${lidY}" rx="82" ry="15" fill="#FFFFFF" stroke="#C2CCC5" stroke-width="1.5"/>`;
  svg += `<ellipse cx="${cx}" cy="${lidY}" rx="17" ry="6" fill="#E7ECE8"/>`;
  svg += `<path d="M${cx-82} ${lidY} Q${cx-82} ${lidY+4} ${cx-74} ${lidY+8} L${cx-58} ${lidY+basinH-30} Q${cx-56} ${lidY+basinH-6} ${cx-24} ${lidY+basinH-6} L${cx+24} ${lidY+basinH-6} Q${cx+56} ${lidY+basinH-6} ${cx+58} ${lidY+basinH-30} L${cx+74} ${lidY+8} Q${cx+82} ${lidY+4} ${cx+82} ${lidY} Z" fill="url(#bowlGrad)"/>`;

  svg += `</svg>`;
  return svg;
}

/* ---- Horizontal tower type: real NFT/DWC channels — flat gutters with
   flush net-pot lids on a shelf rack, not a rotated version of the vertical
   cylinder. No reservoir graphic (per request) — channels just drain off
   the low end, same as a real bench system feeding an external tank. ---- */
function channelPot(id, x, channelTopY, status, stageKey){
  const r = 15, iconR = 12;
  const ring = `<circle class="pocket-select-ring" cx="${x}" cy="${channelTopY}" r="${r+5}" fill="none" stroke="#E8A33D" stroke-width="3.5" opacity="0"/>`;
  const hitCircle = `<circle cx="${x}" cy="${channelTopY}" r="${r+8}" fill="#000000" fill-opacity="0"/>`;
  const pData = state.pockets.find(p=>String(p.id)===String(id));
  const health = pData ? (pData.health || 'healthy') : 'healthy';
  const isOccupied = pData && pData.variety;
  const strokeColor = !isOccupied ? '#C2CCC5' : (health === 'unhealthy' ? '#F59E0B' : (health === 'dead' ? '#EF4444' : '#22C55E'));
  const strokeW = isOccupied ? '2.5' : '1.5';
  return `<g class="tower-pocket" data-pocket-id="${id}" data-status="${status}" tabindex="0" role="button" aria-label="${pocketAriaLabel(id)}">${hitCircle}
    <ellipse cx="${x}" cy="${channelTopY+3}" rx="${r+2}" ry="${(r+2)*0.55}" fill="#00000014"/>
    <circle cx="${x}" cy="${channelTopY}" r="${r}" fill="#FFFFFF" stroke="${strokeColor}" stroke-width="${strokeW}"/>
    <circle cx="${x}" cy="${channelTopY}" r="${iconR}" fill="#FBFCFA"/>
    <g transform="translate(${x-iconR+1},${channelTopY-iconR+1}) scale(${(iconR*2-2)/100})">${plantIconInner(stageKey)}</g>
    ${ring}
  </g>`;
}
function buildHorizontalTowerSVG(filterVariety, targetRows){
  const rows = targetRows || state.rows;
  const maxCols = Math.max(3, ...rows.map(r=>state.pockets.filter(p=>p.rowId===r.id).length || r.potCount || 3));
  const potSpacing = 46;
  const W = Math.max(300, 70 + potSpacing*(maxCols-1) + 70);
  const channelH = 30, wallH = 10, tierGap = 74, topMargin = 40, bottomPad = 26, marginX = (W-(potSpacing*(maxCols-1)))/2;
  const H = topMargin + rows.length*tierGap + bottomPad;
  const x1 = marginX, x2 = W - marginX;
  const cx = W/2;
  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto select-none" id="towerSvgRoot">`;
  svg += `<defs>
    <linearGradient id="pipeGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D7DED9"/>
    </linearGradient>
    <linearGradient id="gutterWall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#DCE3DD"/><stop offset="1" stop-color="#B9C4BC"/>
    </linearGradient>
  </defs>`;

  // Shelf-rack side rails with small feet — no reservoir.
  const railX1 = x1-22, railX2 = x2+22;
  const topY = topMargin-14, bottomY = topMargin + (rows.length-1)*tierGap + channelH + 14;
  [railX1, railX2].forEach(rx=>{
    svg += `<rect x="${rx-3}" y="${topY}" width="6" height="${bottomY-topY}" rx="3" fill="#CBD5CE"/>`;
    svg += `<rect x="${rx-9}" y="${bottomY}" width="18" height="7" rx="3.5" fill="#AEBBB2"/>`;
  });

  // Inlet feed line from the top
  svg += `<rect x="${cx-24}" y="4" width="48" height="13" rx="6.5" fill="url(#pipeGrad)" stroke="#C2CCC5" stroke-width="1.5"/>`;
  svg += `<line x1="${cx}" y1="17" x2="${cx}" y2="${topMargin-2}" stroke="#9FB3A4" stroke-width="3" stroke-dasharray="2 4"/>`;

  rows.forEach((row, i)=>{
    const gutterTopY = topMargin + tierGap*i;
    const potCenterY = gutterTopY + wallH + 2;
    // cross-brace linking this channel to the rails (shelf-rack look)
    svg += `<rect x="${railX1-3}" y="${gutterTopY+channelH/2-3}" width="${railX2-railX1+6}" height="6" rx="3" fill="#E2E8E4"/>`;
    // gutter body: side walls + slightly recessed lid so pots read as "inset"
    svg += `<rect x="${x1-8}" y="${gutterTopY}" width="${x2-x1+16}" height="${channelH}" rx="8" fill="url(#gutterWall)" stroke="#AEBBB2" stroke-width="1.5"/>`;
    svg += `<rect x="${x1-4}" y="${gutterTopY+4}" width="${x2-x1+8}" height="${channelH-8}" rx="6" fill="url(#pipeGrad)"/>`;
    // end caps
    svg += `<rect x="${x1-14}" y="${gutterTopY-1}" width="10" height="${channelH+2}" rx="4" fill="#AEBBB2"/>`;
    svg += `<rect x="${x2+4}" y="${gutterTopY-1}" width="10" height="${channelH+2}" rx="4" fill="#AEBBB2"/>`;

    const pockets = state.pockets.filter(p=>p.rowId===row.id);
    const n = pockets.length || row.potCount || 3;
    pockets.forEach((p, idx)=>{
      const {status, stage} = getPocketState(p);
      const stageKey = stage ? stage.key : 'empty';
      const dim = filterVariety && p.variety!==filterVariety;
      const px = x1 + (n>1 ? (x2-x1)*(idx/(n-1)) : (x2-x1)/2);
      svg += `<g opacity="${dim?0.28:1}">${channelPot(p.id, px, potCenterY, status, stageKey)}</g>`;
    });
    svg += `<text x="${railX1-10}" y="${gutterTopY+channelH/2+4}" font-size="10.5" font-family="Montserrat,sans-serif" font-weight="600" fill="#8B9791" text-anchor="end">${rowLabel(row)}</text>`;
    if(i<rows.length-1){
      svg += `<line x1="${railX2}" y1="${gutterTopY+channelH}" x2="${railX2}" y2="${gutterTopY+tierGap}" stroke="#9FB3A4" stroke-width="3" stroke-dasharray="2 4"/>`;
      svg += `<path d="M${railX2} ${gutterTopY+tierGap-6} l-5 -8 l10 0 z" fill="#9FB3A4"/>`;
    } else {
      // drain stub off the low end — flows to an external reservoir, no bowl drawn
      const dy = gutterTopY+channelH;
      svg += `<path d="M${x2+9} ${dy-4} q10 4 10 14" stroke="#9FB3A4" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="2 4"/>`;
      svg += `<path d="M${x2+16} ${dy+10} l-5 3 l7 5 z" fill="#9FB3A4"/>`;
    }
  });

  svg += `</svg>`;
  return svg;
}

/* ---- Multi-select via tap / long-press + drag (mouse & touch, via Pointer Events) ---- */
const selectionState = { active:false, ids:new Set() };
let lp = { timer:null, dragging:false, fired:false, startX:0, startY:0, activeId:null };
const LONG_PRESS_MS = 380, MOVE_CANCEL_PX = 12;

// (2026-07-13) Consolidate tap modal opening to click event; prev: duplicate pointerup
function initTowerInteraction(){
  const el = document.getElementById('towerDiagram');
  if(el.dataset.wired) return;
  el.dataset.wired = '1';
  el.addEventListener('keydown', (e)=>{
    if(e.key!=='Enter' && e.key!==' ') return;
    const pocketEl = e.target.closest('[data-pocket-id]');
    if(!pocketEl) return;
    e.preventDefault();
    const id = Number(pocketEl.dataset.pocketId);
    if(selectionState.active) toggleSelect(id, !selectionState.ids.has(id));
    else openPocketModal(id);
  });
  el.addEventListener('pointerdown', (e)=>{
    const pocketEl = e.target.closest('[data-pocket-id]');
    if(!pocketEl) return;
    lp.activeId = Number(pocketEl.dataset.pocketId);
    lp.startX=e.clientX; lp.startY=e.clientY; lp.fired=false; lp.dragging=false;
    lp.timer = setTimeout(()=>{
      lp.fired = true; lp.dragging = true;
      selectionState.active = true;
      toggleSelect(lp.activeId, true);
      try{ el.setPointerCapture(e.pointerId); }catch(err){}
      if(navigator.vibrate) navigator.vibrate(12);
    }, LONG_PRESS_MS);
  });
  el.addEventListener('pointermove', (e)=>{
    if(lp.timer && !lp.fired){
      if(Math.hypot(e.clientX-lp.startX, e.clientY-lp.startY) > MOVE_CANCEL_PX){ clearTimeout(lp.timer); lp.timer=null; }
    }
    if(lp.dragging){
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const pocketEl = under && under.closest && under.closest('[data-pocket-id]');
      if(pocketEl) toggleSelect(Number(pocketEl.dataset.pocketId), true);
    }
  });
  el.addEventListener('pointerup', (e)=>{
    if(lp.timer){ clearTimeout(lp.timer); lp.timer=null; }
    if(lp.dragging){
      lp.dragging = false;
      try{ el.releasePointerCapture(e.pointerId); }catch(err){}
    }
  });
  el.addEventListener('pointercancel', ()=>{
    if(lp.timer){ clearTimeout(lp.timer); lp.timer=null; }
    lp.dragging = false;
  });
  el.addEventListener('click', (e)=>{
    if(lp.dragging || lp.fired){
      lp.fired = false;
      return;
    }
    const pocketEl = e.target.closest('[data-pocket-id]');
    if(!pocketEl) return;
    const id = Number(pocketEl.dataset.pocketId);
    if(isNaN(id)) return;
    if(selectionState.active) toggleSelect(id, !selectionState.ids.has(id));
    else openPocketModal(id);
  });
}
function toggleSelect(id, on){
  if(on) selectionState.ids.add(id); else selectionState.ids.delete(id);
  if(selectionState.ids.size===0) selectionState.active=false;
  updateSelectionVisuals();
  renderSelectionBar();
}
function exitSelectionMode(){
  selectionState.active = false; selectionState.ids.clear();
  updateSelectionVisuals(); renderSelectionBar();
  document.getElementById('btnToggleSelectMode')?.classList.remove('!bg-forest','!text-white');
}
// (2026-07-13) Set data-selected attribute in updateSelectionVisuals; prev: none
function updateSelectionVisuals(){
  document.querySelectorAll('#towerDiagram [data-pocket-id]').forEach(g=>{
    const id = Number(g.dataset.pocketId);
    const isSel = selectionState.ids.has(id);
    g.setAttribute('data-selected', isSel ? 'true' : 'false');
    const ring = g.querySelector('.pocket-select-ring');
    if(ring) ring.setAttribute('opacity', isSel ? '1' : '0');
  });
  document.querySelectorAll('[data-pocket-chip]').forEach(chip=>{
    chip.classList.toggle('ring-2', selectionState.ids.has(Number(chip.dataset.pocketChip)));
    chip.classList.toggle('ring-gold', selectionState.ids.has(Number(chip.dataset.pocketChip)));
  });
}
function renderSelectionBar(){
  const bar = document.getElementById('selectionBar');
  if(!bar) return;
  if(!selectionState.active){ bar.classList.add('hidden'); return; }
  const anyModalOpen = [...document.querySelectorAll('.modal-backdrop')].some(m=>!m.classList.contains('hidden'));
  bar.classList.toggle('hidden', anyModalOpen);
  document.getElementById('selectionCount').textContent = `${selectionState.ids.size} selected`;
  const disabled = selectionState.ids.size===0;
  document.getElementById('btnSelectionAssign').toggleAttribute('disabled', disabled);
  document.getElementById('btnSelectionClear').toggleAttribute('disabled', disabled);
  document.getElementById('btnSelectionAssign').classList.toggle('opacity-40', disabled);
  document.getElementById('btnSelectionAssign').classList.toggle('pointer-events-none', disabled);
  document.getElementById('btnSelectionClear').classList.toggle('opacity-40', disabled);
  document.getElementById('btnSelectionClear').classList.toggle('pointer-events-none', disabled);
}
// Only the modal elements themselves need watching — narrower and avoids
// re-triggering on unrelated class changes (chip highlights, nav state, etc).
const modalObserver = new MutationObserver(()=>renderSelectionBar());
document.querySelectorAll('.modal-backdrop').forEach(m=>modalObserver.observe(m, { attributes:true, attributeFilter:['class'] }));

// (2026-07-13) Lock body scrolling whenever any modal is active; prev: no scroll lock
function syncModalScrollLock(){
  const anyOpen = [...document.querySelectorAll('.modal-backdrop')].some(m=>!m.classList.contains('hidden'));
  document.body.classList.toggle('overflow-hidden', anyOpen);
  document.body.style.overflow = anyOpen ? 'hidden' : '';
}

let lastFocusedBeforeModal = null;
document.querySelectorAll('.modal-backdrop').forEach(modal=>{
  const heading = modal.querySelector('h3, h2');
  if(heading){
    if(!heading.id) heading.id = modal.id + 'Heading';
    modal.setAttribute('aria-labelledby', heading.id);
  }
  new MutationObserver(()=>{
    const isOpen = !modal.classList.contains('hidden');
    syncModalScrollLock();
    if(isOpen){
      lastFocusedBeforeModal = document.activeElement;
      const focusable = modal.querySelector('input, select, textarea, button:not([disabled])');
      focusable?.focus({preventScroll:true});
    } else if(lastFocusedBeforeModal){
      lastFocusedBeforeModal.focus?.({preventScroll:true});
      lastFocusedBeforeModal = null;
    }
  }).observe(modal, { attributes:true, attributeFilter:['class'] });
  // Esc closes any open modal, and Tab is trapped inside it while open.
  modal.addEventListener('keydown', (e)=>{
    if(e.key==='Escape'){ modal.classList.add('hidden'); return; }
    if(e.key!=='Tab') return;
    const focusables = [...modal.querySelectorAll('input, select, textarea, button:not([disabled]), [tabindex="0"]')].filter(el=>el.offsetParent!==null);
    if(focusables.length===0) return;
    const first = focusables[0], last = focusables[focusables.length-1];
    if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
  });
});
function enterSelectMode(){
  selectionState.active = true;
  updateSelectionVisuals(); renderSelectionBar();
  document.getElementById('btnToggleSelectMode')?.classList.add('!bg-forest','!text-white');
}
document.getElementById('btnToggleSelectMode')?.addEventListener('click', ()=>{
  if(selectionState.active) exitSelectionMode();
  else enterSelectMode();
});
document.getElementById('btnSelectionAll')?.addEventListener('click', ()=>{
  const activeTower = getActiveTower();
  const towerRowIds = new Set(state.rows.filter(r=>(r.towerId||'t1')===activeTower.id).map(r=>r.id));
  state.pockets.forEach(p=>{ if(towerRowIds.has(p.rowId)) selectionState.ids.add(p.id); });
  selectionState.active = true;
  updateSelectionVisuals(); renderSelectionBar();
});
document.getElementById('btnSelectionAssign')?.addEventListener('click', ()=>openBulkAssignModal());
document.getElementById('btnSelectionClear')?.addEventListener('click', async ()=>{
  if(!await showConfirm(`Clear ${selectionState.ids.size} selected pocket(s)?`, 'Clear Selection')) return;
  const snapshotPockets = JSON.parse(JSON.stringify(state.pockets));
  const count = selectionState.ids.size;
  selectionState.ids.forEach(id=>{ const p=state.pockets.find(x=>x.id===id); if(p){ p.variety=null; p.datePlanted=null; p.override=null; } });
  persist('pockets'); exitSelectionMode(); renderTower();
  triggerUndoSnackbar(`Cleared ${count} selected pocket(s)`, ()=>{
    state.pockets = snapshotPockets;
    persist('pockets'); renderTower();
  });
});
document.getElementById('btnSelectionCancel')?.addEventListener('click', exitSelectionMode);

// (2026-07-13) Toggle custom seed input visibility on select change; prev: static
function setupCustomSeedToggle(selectId, inputId){
  const selectEl = document.getElementById(selectId);
  const inputEl = document.getElementById(inputId);
  if(!selectEl || !inputEl) return;
  const update = ()=>{
    const isCustom = selectEl.value === 'Custom Variety';
    inputEl.classList.toggle('hidden', !isCustom);
    if(isCustom) setTimeout(()=>inputEl.focus(), 50);
  };
  selectEl.removeEventListener('change', update);
  selectEl.addEventListener('change', update);
  update();
}

function openBulkAssignModal(){
  document.getElementById('bulkAssignCount').textContent = selectionState.ids.size;
  document.getElementById('bulkAssignVariety').innerHTML = CROP_PRESETS.map(c=>`<option value="${c.name}">${c.name}</option>`).join('');
  const customName = document.getElementById('bulkAssignCustomName');
  if(customName) customName.value = '';
  document.getElementById('bulkAssignDaysOld').value = 0;
  setupCustomSeedToggle('bulkAssignVariety', 'bulkAssignCustomName');
  document.getElementById('bulkAssignModal').classList.remove('hidden');
}
document.getElementById('bulkAssignModalClose')?.addEventListener('click', ()=>closeModal('bulkAssignModal'));
document.getElementById('bulkAssignForm')?.addEventListener('submit', (e)=>{
  e.preventDefault();
  const customVal = document.getElementById('bulkAssignCustomName')?.value.trim();
  const selectVal = document.getElementById('bulkAssignVariety')?.value;
  const variety = customVal || selectVal || 'Custom Crop';
  const daysOld = Number(document.getElementById('bulkAssignDaysOld').value)||0;
  selectionState.ids.forEach(id=>{
    const p = state.pockets.find(x=>String(x.id)===String(id));
    if(p){ p.variety=variety; p.datePlanted=daysAgoISO(daysOld); p.override=null; }
  });
  persist('pockets'); closeModal('bulkAssignModal'); exitSelectionMode(); renderTower();
  maybeTriggerFirstPlantFlow();
  showToast(`Assigned ${variety} to selected pockets`,'forest','layers');
});

// (2026-07-13) Set visualizer green name & append dotted add row card; prev: none
function renderTower(){
  const activeTower = getActiveTower();
  const towerType = activeTower.type === 'horizontal' ? 'horizontal' : 'vertical';

  const selectEl = document.getElementById('towerSelect');
  if(selectEl){
    selectEl.innerHTML = state.towers.map(t=>`<option value="${t.id}" ${t.id===activeTower.id?'selected':''}>${t.name}</option>`).join('');
    selectEl.onchange = (e)=>{
      state.activeTowerId = e.target.value;
      localStorage.setItem(KEYS.activeTower, e.target.value);
      renderTower();
    };
  }

  const towerRows = state.rows.filter(r=>(r.towerId||'t1')===activeTower.id);
  const towerPockets = state.pockets.filter(p=>{ const r=state.rows.find(x=>x.id===p.rowId); return r && (r.towerId||'t1')===activeTower.id; });
  const filterVariety = document.getElementById('towerSearch')?.value.trim() || '';

  const diagramEl = document.getElementById('towerDiagram');
  diagramEl.innerHTML = towerType==='horizontal'
    ? buildHorizontalTowerSVG(filterVariety || null, towerRows)
    : buildTowerSVG(filterVariety || null, towerRows);
  diagramEl.style.maxWidth = towerType==='horizontal' ? '480px' : '220px';

  const typeLabel = towerType==='horizontal' ? 'Horizontal Channels' : 'Vertical Tower';
  document.getElementById('towerMeta').textContent = `${typeLabel} · ${towerRows.length} Rows × ${towerRows[0]?.potCount||3} Columns · ${towerPockets.length} Pockets Total`;
  initTowerInteraction();

  const list = document.getElementById('rowList');
  list.innerHTML = '';
  towerRows.forEach(row=>{
    const pockets = state.pockets.filter(p=>p.rowId===row.id);
    const card = document.createElement('div');
    card.className = 'bg-white rounded-2xl shadow-card border border-line p-4 md:p-5 flex flex-col gap-3';
    card.innerHTML = `
      <!-- (2026-07-13) Add Fill Tier bulk plant button on row card header; prev: text only -->
      <div class="w-full flex items-center justify-between">
        <button data-row-select="${row.id}" class="flex-1 flex items-center gap-3 text-left group">
          <span class="w-10 h-10 rounded-2xl bg-mint text-forest flex items-center justify-center flex-shrink-0">${icon('layers','w-5 h-5',20)}</span>
          <div>
            <div class="font-semibold text-[15px] text-ink">${rowLabel(row)} <span class="text-ink-soft font-normal text-[13px]">· ${pockets.length} pockets</span></div>
            <div class="text-[12.5px] text-ink-soft mt-0.5">${rowSummary(row)}</div>
          </div>
        </button>
        <button data-row-fill="${row.id}" class="text-[12px] font-semibold text-forest bg-mint hover:bg-mint/80 px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1 flex-shrink-0 shadow-xs">${icon('layers','w-3.5 h-3.5',14)} Fill Tier</button>
      </div>
      <div class="flex gap-3 overflow-x-auto scrollbar-thin py-1">
        ${pockets.map(p=>pocketChipHTML(p)).join('')}
      </div>`;
    list.appendChild(card);
  });

  const addCard = document.createElement('div');
  addCard.className = 'border-2 border-dashed border-forest/40 bg-mint/15 hover:bg-mint/30 opacity-80 cursor-pointer rounded-2xl p-4 flex items-center justify-center gap-2 text-forest font-semibold text-[14px] transition-all hover:opacity-100 mt-1';
  addCard.innerHTML = `${icon('plus','w-5 h-5',20)} Add Row`;
  addCard.onclick = () => document.getElementById('btnAddRow')?.click();
  list.appendChild(addCard);

  list.querySelectorAll('[data-row-select]').forEach(btn=>btn.addEventListener('click', ()=>openRowModal(btn.dataset.rowSelect)));
  list.querySelectorAll('[data-row-fill]').forEach(btn=>btn.addEventListener('click', ()=>openRowModal(btn.dataset.rowFill)));
  list.querySelectorAll('[data-pocket-chip]').forEach(btn=>btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    if(selectionState.active) toggleSelect(Number(btn.dataset.pocketChip), !selectionState.ids.has(Number(btn.dataset.pocketChip)));
    else openPocketModal(Number(btn.dataset.pocketChip));
  }));
  updateSelectionVisuals();
  renderSelectionBar();
  renderTowerPhotoGallery();
  
  // Render Growth Gallery on Tower page
  renderGrowthGallery('galleryStripTower');
}

// (2026-07-13) Constant 380px height, SVG arrow nav, Jan 1, 2020 date; prev: dynamic
function formatLogDate(dateStr){
  if(!dateStr || dateStr === '—') return '—';
  const d = new Date(dateStr);
  if(isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderTowerPhotoGallery(){
  const grid = document.getElementById('towerPhotoGalleryGrid');
  const listFeed = document.getElementById('towerPhotoGalleryList');
  const btnLoadMore = document.getElementById('btnLoadMorePhotos');
  const empty = document.getElementById('towerPhotoGalleryEmpty');
  const countEl = document.getElementById('photoLogCount');
  const btnGrid = document.getElementById('btnPhotoViewGrid');
  const btnList = document.getElementById('btnPhotoViewList');

  if(!grid) return;

  const log = (state.photoLog || []).filter(e=> !state.activeTowerId || e.towerId === state.activeTowerId);
  if(countEl) countEl.textContent = `${log.length} photo${log.length!==1?'s':''}`;

  // Initialize multi-select state
  if(!state.photoMultiSelect) state.photoMultiSelect = { active: false, selectedIds: [] };

  if(log.length === 0){
    grid.innerHTML='';
    if(listFeed) listFeed.innerHTML='';
    grid.classList.add('hidden');
    listFeed?.classList.add('hidden');
    btnLoadMore?.classList.add('hidden');
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  const viewMode = state.photoViewMode || 'grid';
  if(btnGrid && btnList){
    btnGrid.className = viewMode === 'grid' ? 'px-2.5 py-1 rounded-lg text-[11.5px] font-semibold bg-white text-forest shadow-xs border border-line/40 transition-all' : 'px-2.5 py-1 rounded-lg text-[11.5px] font-semibold text-ink-soft hover:text-forest bg-transparent transition-all';
    btnList.className = viewMode === 'list' ? 'px-2.5 py-1 rounded-lg text-[11.5px] font-semibold bg-white text-forest shadow-xs border border-line/40 transition-all' : 'px-2.5 py-1 rounded-lg text-[11.5px] font-semibold text-ink-soft hover:text-forest bg-transparent transition-all';

    btnGrid.onclick = () => { state.photoViewMode = 'grid'; renderTowerPhotoGallery(); };
    btnList.onclick = () => { state.photoViewMode = 'list'; renderTowerPhotoGallery(); };
  }

  const healthColor = { healthy:'#22C55E', unhealthy:'#F59E0B', dead:'#EF4444' };
  const healthLabel = { healthy:'Healthy', unhealthy:'Unhealthy', dead:'Dead' };

  if(viewMode === 'grid'){
    listFeed?.classList.add('hidden');
    btnLoadMore?.classList.add('hidden');
    grid.classList.remove('hidden');

    const MAX_VISIBLE = 9;
    const visible = log.slice(0, MAX_VISIBLE);
    const overflow = log.length - MAX_VISIBLE;

    let html = '';
    visible.forEach((e, i)=>{
      const isLastAndHasMore = i === MAX_VISIBLE - 1 && overflow > 0;
      const overflowLabel = overflow >= 99 ? '99+' : `+${overflow}`;
      // (2026-07-13) Object-cover & dark bottom gradient on grid tiles; prev: fit stretch
      html += `<div class="photo-log-card group relative cursor-pointer rounded-2xl overflow-hidden bg-black shadow-sm border border-line/20 aspect-square" data-photo-id="${e.id}">
        <img src="${e.dataUrl}" style="width:100% !important; height:100% !important; object-fit:cover !important;" class="block ${isLastAndHasMore?'brightness-50':'group-hover:scale-105 transition-transform duration-300'}" alt="${e.variety} photo" loading="lazy">
        // (2026-07-13) Soft gradient & z-20 pure white text overlay; prev: dark covered
        ${isLastAndHasMore ? `
          <div class="absolute inset-0 flex flex-col items-center justify-center text-white pointer-events-none bg-black/40 z-20">
            <div class="font-display font-bold text-[28px] leading-none">${overflowLabel}</div>
            <div class="text-[11px] font-medium opacity-80 mt-1">more photos</div>
          </div>` : `
          <div style="position:absolute !important; bottom:0 !important; left:0 !important; right:0 !important; width:100% !important; height:50% !important; background:linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0) 100%) !important; pointer-events:none !important; z-index:5 !important;"></div>
          <div class="absolute inset-x-0 bottom-0 p-2 text-white pointer-events-none w-full overflow-hidden" style="z-index:20 !important;">
            <div class="font-bold truncate text-white" style="font-size:10px !important; line-height:1.15; color:#FFFFFF !important; text-shadow:0 1px 3px rgba(0,0,0,0.9);">${e.variety}</div>
            <div class="truncate mt-0.5" style="font-size:8.5px !important; line-height:1.1; color:#FFFFFF !important; opacity:0.9; text-shadow:0 1px 2px rgba(0,0,0,0.9);">${e.stage} · Day ${e.day}</div>
          </div>`}
      </div>`;
    });
    grid.innerHTML = html;

    grid.querySelectorAll('[data-photo-id]').forEach(card=>{
      card.addEventListener('click', ()=>openPhotoDetailModal(card.dataset.photoId));
    });
  } else {
    grid.classList.add('hidden');
    listFeed?.classList.remove('hidden');

    const limit = state.photoListLimit || 4;
    const visible = log.slice(0, limit);
    const hasMore = log.length > limit;

    let html = '';
    // (2026-07-13) Compact Google Drive style list row with 32px thumbnail + multi-select support
    visible.forEach(e=>{
      const hc = healthColor[e.health] || '#22C55E';
      const hl = healthLabel[e.health] || 'Healthy';
      const formattedDate = formatLogDate(e.dateLabel || e.datePlanted);
      const isSelected = state.photoMultiSelect.selectedIds.includes(e.id);
      const checkboxHtml = state.photoMultiSelect.active ? `<div class="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'bg-forest border-forest' : 'border-ink-soft/40 bg-white'}">
        ${isSelected ? '<svg class="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      </div>` : '';
      
      html += `<div class="photo-log-item group flex items-center justify-between py-2 px-1.5 border-b border-line/30 hover:bg-cream/60 transition-colors cursor-pointer ${isSelected ? 'bg-forest/5' : ''}" data-photo-id="${e.id}">
        <div class="flex items-center gap-3 min-w-0 pr-2">
          ${checkboxHtml}
          <img src="${e.dataUrl}" class="w-8 h-8 rounded-md object-cover flex-shrink-0 bg-black border border-line/40 shadow-xs" alt="${e.variety} photo" loading="lazy">
          <div class="min-w-0">
            <div class="text-[13px] font-semibold text-ink truncate leading-tight">${e.variety}</div>
            <div class="text-[10.5px] text-ink-soft truncate mt-0.5">${e.stage} · Day ${e.day}</div>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="text-[10.5px] font-mono text-ink-soft">${formattedDate}</span>
          <span class="text-[9.5px] font-semibold px-2 py-0.5 rounded-full" style="background:${hc}18;color:${hc};border:1px solid ${hc}44">${hl}</span>
        </div>
      </div>`;
    });
    listFeed.innerHTML = html;

    // Multi-select functionality with long press
    let longPressTimer = null;
    let touchStartY = 0;
    let touchStartX = 0;
    let lastSelectedId = null;
    let isDraggingToSelect = false;
    let hasMovedEnough = false;

    listFeed.querySelectorAll('.photo-log-item').forEach(item=>{
      const photoId = item.dataset.photoId;
      
      // Touch events for long press activation
      item.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
        isDraggingToSelect = false;
        hasMovedEnough = false;
        
        longPressTimer = setTimeout(() => {
          // Long press triggered - activate drag-to-select
          if(!hasMovedEnough){
            if(!state.photoMultiSelect.active){
              // First time activating multi-select
              state.photoMultiSelect.active = true;
              state.photoMultiSelect.selectedIds = [photoId];
            }
            // Enable dragging to select more items (works on subsequent long-presses too)
            isDraggingToSelect = true;
            renderTowerPhotoGallery();
            renderPhotoMultiSelectBar();
            // Haptic feedback if available
            if(window.navigator && window.navigator.vibrate){
              window.navigator.vibrate(50);
            }
          }
        }, 500); // 500ms long press
      });

      item.addEventListener('touchmove', (e) => {
        const currentY = e.touches[0].clientY;
        const currentX = e.touches[0].clientX;
        const scrollDistance = Math.abs(currentY - touchStartY);
        const horizontalDistance = Math.abs(currentX - touchStartX);
        
        // User has moved enough to be considered scrolling
        if(scrollDistance > 10 || horizontalDistance > 10){
          hasMovedEnough = true;
          
          // Cancel long press timer if user is scrolling (not in multi-select mode yet)
          if(!state.photoMultiSelect.active){
            clearTimeout(longPressTimer);
            return;
          }
        }
        
        // Only prevent scrolling if we're actively dragging to select in multi-select mode
        if(state.photoMultiSelect.active && isDraggingToSelect){
          e.preventDefault(); // Stop page scroll only when dragging to select
          e.stopPropagation();
          
          // Find which item is under the touch
          const touchedElement = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
          const touchedItem = touchedElement?.closest('.photo-log-item');
          if(touchedItem && touchedItem.dataset.photoId){
            const touchedId = touchedItem.dataset.photoId;
            if(!state.photoMultiSelect.selectedIds.includes(touchedId)){
              state.photoMultiSelect.selectedIds.push(touchedId);
              renderTowerPhotoGallery();
              renderPhotoMultiSelectBar();
              // Small haptic on each selection
              if(window.navigator && window.navigator.vibrate){
                window.navigator.vibrate(10);
              }
            }
          }
        }
      }, { passive: false }); // Important: passive: false to allow preventDefault

      item.addEventListener('touchend', (e) => {
        clearTimeout(longPressTimer);
        
        // If was dragging in multi-select mode, don't trigger click
        if(isDraggingToSelect){
          e.preventDefault();
          isDraggingToSelect = false;
          return;
        }
        isDraggingToSelect = false;
        hasMovedEnough = false;
      });

      item.addEventListener('touchcancel', () => {
        clearTimeout(longPressTimer);
        isDraggingToSelect = false;
        hasMovedEnough = false;
      });

      // Click handler
      item.addEventListener('click', (e) => {
        // Don't open photo if we were dragging
        if(isDraggingToSelect){
          e.preventDefault();
          return;
        }
        
        if(state.photoMultiSelect.active){
          // Toggle selection
          const idx = state.photoMultiSelect.selectedIds.indexOf(photoId);
          if(idx > -1){
            state.photoMultiSelect.selectedIds.splice(idx, 1);
          } else {
            state.photoMultiSelect.selectedIds.push(photoId);
          }
          renderTowerPhotoGallery();
          renderPhotoMultiSelectBar();
          
          // Exit multi-select if no items selected
          if(state.photoMultiSelect.selectedIds.length === 0){
            state.photoMultiSelect.active = false;
            renderTowerPhotoGallery();
            renderPhotoMultiSelectBar();
          }
        } else {
          openPhotoDetailModal(photoId);
        }
      });
    });

    if(hasMore && btnLoadMore){
      btnLoadMore.classList.remove('hidden');
      btnLoadMore.onclick = () => {
        state.photoListLimit = (state.photoListLimit || 4) + 4;
        renderTowerPhotoGallery();
      };
    } else {
      btnLoadMore?.classList.add('hidden');
    }
  }
}

// Multi-select action bar for photos
function renderPhotoMultiSelectBar(){
  let bar = document.getElementById('photoMultiSelectBar');
  
  if(!state.photoMultiSelect || !state.photoMultiSelect.active || state.photoMultiSelect.selectedIds.length === 0){
    if(bar) bar.remove();
    return;
  }

  const count = state.photoMultiSelect.selectedIds.length;
  
  if(!bar){
    bar = document.createElement('div');
    bar.id = 'photoMultiSelectBar';
    bar.className = 'fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 bg-forest text-white rounded-2xl shadow-lg px-3 py-2.5 flex items-center gap-2 max-w-[94vw]';
    bar.style.cssText = 'animation: slideUpIn 0.3s ease-out; z-index: 9999999;';
    document.body.appendChild(bar);
  }

  bar.innerHTML = `
    <button id="btnCancelMultiSelect" class="text-white/70 p-1.5 flex-shrink-0">
      ${icon('x','w-4 h-4',16)}
    </button>
    <span class="text-[13px] font-semibold whitespace-nowrap flex-shrink-0">${count} selected</span>
    <div class="w-px h-5 bg-white/20 flex-shrink-0"></div>
    <button id="btnDeleteSelected" class="text-[12.5px] font-semibold bg-white/15 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" aria-label="Delete selected">
      ${icon('trash-2','w-4 h-4',16)}
    </button>
  `;

  // Cancel button
  bar.querySelector('#btnCancelMultiSelect').onclick = () => {
    state.photoMultiSelect.active = false;
    state.photoMultiSelect.selectedIds = [];
    renderTowerPhotoGallery();
    renderPhotoMultiSelectBar();
  };

  // Delete button
  bar.querySelector('#btnDeleteSelected').onclick = () => {
    // Show custom delete confirmation modal
    showDeletePhotosModal(count, () => {
      const idsToDelete = [...state.photoMultiSelect.selectedIds];
      
      // Delete from state
      state.photoLog = (state.photoLog || []).filter(x => !idsToDelete.includes(x.id));
      persist('photoLog');
      
      // Delete from Firestore
      if(typeof cloudSync !== 'undefined' && cloudSync.connected){
        idsToDelete.forEach(id => {
          cloudSync.deletePhoto(id).catch(err => console.error('Photo delete error:', err));
        });
      }
      
      // Reset multi-select
      state.photoMultiSelect.active = false;
      state.photoMultiSelect.selectedIds = [];
      
      renderTowerPhotoGallery();
      renderPhotoMultiSelectBar();
      showToast(`Deleted ${count} photo${count !== 1 ? 's' : ''}`, 'clay', 'trash-2');
    });
  };
}

// Delete photos confirmation modal
function showDeletePhotosModal(count, onConfirm){
  let existing = document.getElementById('deletePhotosModal');
  if(existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'deletePhotosModal';
  modal.className = 'fixed inset-0 flex items-center justify-center p-4';
  modal.style.cssText = 'background:rgba(15,25,20,0.95); backdrop-filter:blur(16px); opacity:0; transition:opacity 0.25s ease-out; z-index: 999999999 !important;';
  
  modal.innerHTML = `
    <div class="bg-white w-full max-w-sm p-6 shadow-2xl relative" style="border-radius: 32px; animation: modalPopIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; z-index: 999999999 !important;">
      <div class="flex items-center justify-center mb-4">
        <div class="w-16 h-16 rounded-full bg-clay/10 flex items-center justify-center">
          ${icon('trash-2','w-8 h-8 text-clay',32)}
        </div>
      </div>
      
      <h3 class="font-display font-bold text-[22px] text-forest text-center mb-2">Delete Photos?</h3>
      <p class="text-[15px] text-ink-soft text-center mb-6 leading-relaxed">Are you sure you want to delete <strong class="text-ink">${count} photo${count !== 1 ? 's' : ''}</strong>? This action cannot be undone.</p>
      
      <div class="flex gap-3">
        <button id="btnCancelDelete" class="flex-1 bg-cream hover:bg-cream-dark text-ink font-bold text-[15px] py-4 transition-colors" style="border-radius: 20px;">
          Cancel
        </button>
        <button id="btnConfirmDelete" class="flex-1 bg-clay hover:bg-clay/90 text-white font-bold text-[15px] py-4 transition-colors active:scale-[0.98] shadow-lg" style="border-radius: 20px;">
          Delete
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  
  // Fade in
  requestAnimationFrame(() => {
    modal.style.opacity = '1';
  });

  const closeModal = () => {
    modal.style.opacity = '0';
    setTimeout(() => modal.remove(), 200);
  };

  modal.querySelector('#btnCancelDelete').onclick = closeModal;
  modal.querySelector('#btnConfirmDelete').onclick = () => {
    closeModal();
    onConfirm();
  };
  
  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if(e.target === modal) closeModal();
  });
}

// (2026-07-13) Immutable snapshot attributes for photo logs; prev: live compute
function getTowerCropSummary(e){
  if(e && (e.snapshotCropBatches || e.cropSummary)){
    const cropSummary = e.snapshotCropBatches || e.cropSummary;
    const healthLabel = e.snapshotOverallHealth || e.healthLabel || 'Healthy';
    const healthColor = e.snapshotHealthColor || e.healthColor || '#22C55E';
    const healthKey = e.snapshotHealthKey || e.healthKey || 'healthy';
    const datePlanted = e.snapshotDatePlanted || (e.datePlanted ? formatLogDate(e.datePlanted) : 'Aug 8, 2026');

    if(typeof e === 'object'){
      e.snapshotCropBatches = cropSummary;
      e.snapshotOverallHealth = healthLabel;
      e.snapshotHealthColor = healthColor;
      e.snapshotHealthKey = healthKey;
      e.snapshotDatePlanted = datePlanted;
      e.cropSummary = cropSummary;
      e.healthLabel = healthLabel;
      e.healthColor = healthColor;
    }

    return { cropSummary, healthKey, healthLabel, healthColor, datePlanted };
  }

  const towerId = e?.towerId || state.activeTowerId;
  const towerPockets = state.pockets.filter(p=> p.variety && state.rows.find(r=>r.id===p.rowId && r.towerId===towerId));

  let healthyCount = 0, unhealthyCount = 0, deadCount = 0;
  const batchesMap = new Map();

  if(towerPockets.length > 0){
    towerPockets.forEach(p => {
      const row = state.rows.find(r=>r.id===p.rowId);
      const pState = getPocketState(p);
      const day = pState.day || (row && row.startDate ? Math.max(1, dayOfCycle(row.startDate)) : (p.day || e?.day || 1));
      const key = `${p.variety}_${day}`;
      if(!batchesMap.has(key)){
        batchesMap.set(key, { variety: p.variety, day });
      }
      const h = p.health || 'healthy';
      if(h === 'healthy') healthyCount++;
      else if(h === 'unhealthy') unhealthyCount++;
      else if(h === 'dead') deadCount++;
    });
  } else {
    batchesMap.set(`${e?.variety||'Tower General'}_${e?.day||0}`, { variety: e?.variety||'Tower General', day: e?.day||0 });
    if(e?.health === 'healthy') healthyCount++;
    else if(e?.health === 'unhealthy') unhealthyCount++;
    else if(e?.health === 'dead') deadCount++;
  }

  const batches = Array.from(batchesMap.values());
  const cropSummary = batches.map(b => `${b.variety} (Day ${b.day})`).join(' · ');

  const total = healthyCount + unhealthyCount + deadCount;
  const healthyPct = total > 0 ? (healthyCount / total) * 100 : 100;

  let healthKey = 'healthy';
  let healthLabel = 'Healthy';
  let healthColor = '#22C55E';

  if(healthyPct >= 80){
    healthKey = 'healthy';
    healthLabel = healthyPct === 100 ? 'Healthy' : 'Mostly Healthy';
    healthColor = '#22C55E';
  } else if(unhealthyCount >= deadCount){
    healthKey = 'unhealthy';
    healthLabel = 'Needs Attention';
    healthColor = '#F59E0B';
  } else {
    healthKey = 'dead';
    healthLabel = 'Requires Care';
    healthColor = '#EF4444';
  }

  const datePlanted = e?.datePlanted ? formatLogDate(e.datePlanted) : 'Aug 8, 2026';

  if(e && typeof e === 'object'){
    e.snapshotCropBatches = cropSummary;
    e.snapshotOverallHealth = healthLabel;
    e.snapshotHealthColor = healthColor;
    e.snapshotHealthKey = healthKey;
    e.snapshotDatePlanted = datePlanted;
    e.cropSummary = cropSummary;
    e.healthLabel = healthLabel;
    e.healthColor = healthColor;
    persist('photoLog');
  }

  return { cropSummary, healthKey, healthLabel, healthColor, datePlanted };
}

function openPhotoDetailModal(photoId){
  const log = (state.photoLog || []).filter(e=> !state.activeTowerId || e.towerId === state.activeTowerId);
  if(log.length === 0) return;

  let currentIndex = log.findIndex(x=>x.id===photoId);
  if(currentIndex === -1) currentIndex = 0;

  let existing = document.getElementById('photoDetailModal');
  if(existing) existing.remove();

  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const modal = document.createElement('div');
  modal.id = 'photoDetailModal';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');
  modal.style.cssText = 'position:fixed !important; top:0 !important; left:0 !important; right:0 !important; bottom:0 !important; width:100vw !important; height:100vh !important; z-index:999999 !important; background:#ffffff !important; display:flex; flex-direction:column; justify-content:space-between; overflow-y:auto; user-select:none; transition:all 0.2s ease-out; opacity:0; transform:scale(0.98);';

  requestAnimationFrame(()=>{
    modal.style.opacity = '1';
    modal.style.transform = 'scale(1)';
  });

  // (2026-07-13) Compact 25% top gradient, smaller text & 7x7 X button; prev: 45%
  function renderLightboxContent(slideDirection = ''){
    const e = log[currentIndex];
    const prevPhoto = currentIndex > 0 ? log[currentIndex - 1] : null;
    const nextPhoto = currentIndex < log.length - 1 ? log[currentIndex + 1] : null;
    const formattedDate = formatLogDate(e.dateLabel || e.datePlanted);

    // (2026-07-13) Render detail cards strictly from static snapshot metadata; prev: live
    const summaryInfo = getTowerCropSummary(e);
    const snapshotCropBatches = e.snapshotCropBatches || summaryInfo.cropSummary;
    const snapshotOverallHealth = e.snapshotOverallHealth || summaryInfo.healthLabel;
    const snapshotHealthColor = e.snapshotHealthColor || summaryInfo.healthColor;
    const snapshotDatePlanted = e.snapshotDatePlanted || summaryInfo.datePlanted;
    const snapshotStage = e.snapshotStage || e.stage || 'Vegetative';

    const slideAnimClass = slideDirection === 'left' ? 'animate-slide-left' : slideDirection === 'right' ? 'animate-slide-right' : 'animate-fade-in';

    // Calculate file size for display
    const fileSize = getFileSizeFromDataUrl(e.dataUrl);

    // (2026-07-13) Add Growth Stage 4th card for 2x2 grid symmetry; prev: 3 cards
    modal.innerHTML = `
      <div style="width:100% !important; height:60vh !important; max-height:60vh !important; min-height:60vh !important; flex-shrink:0 !important; overflow:hidden !important; position:relative !important; background:#111111 !important;" class="flex items-center justify-center">
        <div id="photoSlideWrapper" class="w-full h-full relative flex items-center justify-center transition-transform duration-300 ${slideAnimClass}">
          ${prevPhoto ? `<img src="${prevPhoto.dataUrl}" style="position:absolute !important; left:-86% !important; top:0 !important; width:82% !important; height:100% !important; object-fit:cover !important; opacity:0.35 !important; filter:brightness(0.6) blur(0.5px) !important; border-radius:16px !important;" class="pointer-events-none" alt="previous photo preview">` : ''}
          <img id="lightboxImg" src="${e.dataUrl}" style="width:100% !important; height:100% !important; max-height:60vh !important; object-fit:cover !important; object-position:center !important;" class="block transition-all duration-300 cursor-pointer relative z-10" alt="${e.variety} photo">
          ${nextPhoto ? `<img src="${nextPhoto.dataUrl}" style="position:absolute !important; right:-86% !important; top:0 !important; width:82% !important; height:100% !important; object-fit:cover !important; opacity:0.35 !important; filter:brightness(0.6) blur(0.5px) !important; border-radius:16px !important;" class="pointer-events-none" alt="next photo preview">` : ''}
        </div>

        <div style="position:absolute !important; top:0 !important; left:0 !important; right:0 !important; width:100% !important; height:25% !important; background:linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 65%, rgba(0,0,0,0) 100%) !important; pointer-events:none !important; z-index:25 !important;"></div>
        <div style="position:absolute !important; top:max(18px, calc(14px + env(safe-area-inset-top))) !important; left:0 !important; right:0 !important; width:100% !important; z-index:40 !important;" class="px-4 pt-1 flex items-center justify-between text-white pointer-events-auto">
          <div class="flex items-center gap-2">
            <span class="text-[10.5px] font-semibold bg-black/50 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/20 text-white shadow-xs">${currentIndex + 1} of ${log.length}</span>
            <span class="text-[11px] font-medium text-white/90 drop-shadow-sm">${e.towerName}</span>
          </div>
          <button id="photoDetailClose" type="button" class="w-7 h-7 rounded-full bg-black/50 backdrop-blur-md hover:bg-black/70 active:scale-95 flex items-center justify-center text-white font-bold text-[13px] transition-all border border-white/20 shadow-xs">✕</button>
        </div>

        ${currentIndex > 0 ? `
          <button id="btnPrevPhoto" type="button" style="position:absolute !important; left:6px !important; top:50% !important; transform:translateY(-50%) !important; z-index:40 !important; cursor:pointer !important;" class="p-2 text-white/40 hover:text-white/95 active:scale-95 transition-opacity duration-200 pointer-events-auto">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 drop-shadow-md"><path d="m15 18-6-6 6-6"/></svg>
          </button>` : ''}
        
        ${currentIndex < log.length - 1 ? `
          <button id="btnNextPhoto" type="button" style="position:absolute !important; right:6px !important; top:50% !important; transform:translateY(-50%) !important; z-index:40 !important; cursor:pointer !important;" class="p-2 text-white/40 hover:text-white/95 active:scale-95 transition-opacity duration-200 pointer-events-auto">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 drop-shadow-md"><path d="m9 18 6-6-6-6"/></svg>
          </button>` : ''}

        <div class="absolute bottom-0 left-0 right-0 w-full p-4 pt-12 text-white flex items-end justify-between pointer-events-none z-20" style="background: linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 50%, transparent 100%);">
          <div class="min-w-0 pr-3">
            <div class="text-[17px] font-bold text-white drop-shadow-md leading-tight truncate">${e.towerName}</div>
            <div class="text-[12.5px] text-white/90 drop-shadow-md mt-0.5 font-medium truncate">${snapshotCropBatches}</div>
          </div>
          <span class="text-[11px] font-semibold px-3 py-1 rounded-full drop-shadow-md flex-shrink-0" style="background:${snapshotHealthColor}44;color:#FFFFFF;border:1px solid ${snapshotHealthColor}">${snapshotOverallHealth}</span>
        </div>
      </div>

      <div class="flex-1 bg-white p-4 md:p-5 flex flex-col justify-between max-w-xl mx-auto w-full">
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <h3 class="font-display font-bold text-[18px] text-forest truncate min-w-0">${e.towerName}</h3>
            <div class="flex items-center gap-2 flex-shrink-0">
              <span class="text-[10.5px] font-semibold font-mono text-ink-soft/80 bg-cream/80 px-2 py-0.5 rounded-md border border-line/50">${fileSize}</span>
              <span class="text-[11.5px] font-semibold font-mono text-ink-soft bg-cream px-2.5 py-1 rounded-full border border-line/60">${formattedDate}</span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2.5 text-[12.5px]">
            <div class="bg-cream/60 rounded-2xl p-3 border border-line/60 col-span-2">
              <div class="text-[10.5px] font-semibold text-ink-soft uppercase tracking-wider mb-0.5">Crop Batches</div>
              <div class="font-semibold text-ink leading-snug">${snapshotCropBatches}</div>
            </div>
            <div class="bg-cream/60 rounded-2xl p-3 border border-line/60">
              <div class="text-[10.5px] font-semibold text-ink-soft uppercase tracking-wider mb-0.5">Overall Health</div>
              <div class="font-semibold" style="color:${snapshotHealthColor}">${snapshotOverallHealth}</div>
            </div>
            <div class="bg-cream/60 rounded-2xl p-3 border border-line/60">
              <div class="text-[10.5px] font-semibold text-ink-soft uppercase tracking-wider mb-0.5">Growth Stage</div>
              <div class="font-semibold text-forest">${snapshotStage}</div>
            </div>
            <div class="bg-cream/60 rounded-2xl p-3 border border-line/60 col-span-2">
              <div class="text-[10.5px] font-semibold text-ink-soft uppercase tracking-wider mb-0.5">Date Planted</div>
              <div class="font-semibold text-ink">${snapshotDatePlanted}</div>
            </div>
          </div>
        </div>

        <button id="photoDetailDelete" type="button" class="w-full mt-4 text-[13px] font-semibold text-clay bg-[#FCEBD8] hover:bg-[#F8DEC0] rounded-xl py-3 flex items-center justify-center gap-1.5 transition-colors">
          ${icon('trash-2','w-4 h-4',16)} Delete Photo Log
        </button>
      </div>
    `;

    const imgEl = modal.querySelector('#lightboxImg');
    if(imgEl){
      imgEl.addEventListener('click', ()=>{
        openFullscreenZoomViewer(log, currentIndex);
      });
    }

    document.getElementById('photoDetailClose').onclick = closeModal;

    const btnPrev = document.getElementById('btnPrevPhoto');
    if(btnPrev) btnPrev.onclick = () => { if(currentIndex > 0){ currentIndex--; renderLightboxContent('right'); } };

    const btnNext = document.getElementById('btnNextPhoto');
    if(btnNext) btnNext.onclick = () => { if(currentIndex < log.length - 1){ currentIndex++; renderLightboxContent('left'); } };

    // (2026-07-13) Photo deletion with interactive Undo toast action; prev: no undo
    const btnDel = document.getElementById('photoDetailDelete');
    if(btnDel){
      btnDel.onclick = () => {
        const deletedEntry = log[currentIndex];
        const deletedIdx = currentIndex;
        state.photoLog = (state.photoLog||[]).filter(x=>x.id!==deletedEntry.id);
        persist('photoLog');
        
        // (2026-07-13) Delete photo from Firestore subcollection
        if(typeof cloudSync !== 'undefined' && cloudSync.connected){
          cloudSync.deletePhoto(deletedEntry.id).catch(err => console.error('Photo delete error:', err));
        }
        
        closeModal();
        renderTowerPhotoGallery();

        showToast('Photo log deleted', 'clay', 'trash-2', {
          actionLabel: 'Undo',
          onAction: () => {
            if(deletedEntry){
              if(!state.photoLog) state.photoLog = [];
              state.photoLog.splice(Math.min(deletedIdx, state.photoLog.length), 0, deletedEntry);
              persist('photoLog');
              
              // Re-sync to Firestore on undo
              if(typeof cloudSync !== 'undefined' && cloudSync.connected){
                cloudSync.syncPhoto(deletedEntry).catch(err => console.error('Photo restore error:', err));
              }
              
              renderTowerPhotoGallery();
              showToast('Photo log restored', 'forest', 'rotate-ccw');
            }
          }
        });
      };
    }

    const viewerArea = modal.querySelector('#photoSlideWrapper');
    let startX = 0;
    let startY = 0;
    let isDraggingDown = false;

    viewerArea.addEventListener('touchstart', (ev) => {
      if(ev.touches.length === 1){
        startX = ev.touches[0].clientX;
        startY = ev.touches[0].clientY;
        isDraggingDown = false;
      }
    }, { passive: true });

    viewerArea.addEventListener('touchmove', (ev) => {
      if(ev.touches.length === 1 && !isDraggingDown){
        const deltaY = ev.touches[0].clientY - startY;
        if(deltaY > 20){
          isDraggingDown = true;
          modal.style.transition = 'none';
        }
        if(isDraggingDown && deltaY > 0){
          modal.style.transform = `translateY(${deltaY * 0.5}px) scale(${1 - deltaY * 0.0003})`;
          modal.style.opacity = `${1 - deltaY * 0.002}`;
        }
      }
    }, { passive: true });

    viewerArea.addEventListener('touchend', (ev) => {
      if(ev.changedTouches.length === 1){
        const deltaX = ev.changedTouches[0].clientX - startX;
        const deltaY = ev.changedTouches[0].clientY - startY;

        if(isDraggingDown && deltaY > 120){
          modal.style.transition = 'all 0.25s ease-out';
          modal.style.opacity = '0';
          modal.style.transform = 'translateY(100%) scale(0.9)';
          setTimeout(()=>{
            document.body.style.overflow = prevOverflow;
            window.removeEventListener('keydown', handleKeyNav);
            modal.remove();
          }, 250);
          return;
        }

        if(isDraggingDown){
          modal.style.transition = 'all 0.2s ease-out';
          modal.style.transform = 'scale(1)';
          modal.style.opacity = '1';
          isDraggingDown = false;
        }

        if(!isDraggingDown && Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)){
          if(deltaX < 0 && currentIndex < log.length - 1){
            currentIndex++;
            renderLightboxContent('left');
          } else if(deltaX > 0 && currentIndex > 0){
            currentIndex--;
            renderLightboxContent('right');
          }
        }
      }
    }, { passive: true });
  }

  function closeModal(){
    modal.style.opacity = '0';
    modal.style.transform = 'scale(0.98)';
    setTimeout(()=>{
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyNav);
      modal.remove();
    }, 150);
  }

  function handleKeyNav(ev){
    if(ev.key === 'ArrowLeft' && currentIndex > 0){
      currentIndex--; renderLightboxContent('right');
    } else if(ev.key === 'ArrowRight' && currentIndex < log.length - 1){
      currentIndex++; renderLightboxContent('left');
    } else if(ev.key === 'Escape'){
      closeModal();
    }
  }

  window.addEventListener('keydown', handleKeyNav);
  document.body.appendChild(modal);
  renderLightboxContent();
}

// (2026-07-13) Fullscreen gallery: double-tap zoom, swipe peeking & album filmstrip
function openFullscreenZoomViewer(log, initialIndex = 0){
  if(!log || log.length === 0) return;
  let currentIndex = Math.max(0, Math.min(initialIndex, log.length - 1));
  let existing = document.getElementById('fullscreenZoomModal');
  if(existing) existing.remove();

  // (2026-07-13) Set role=dialog for universal back button stack; prev: no role
  const fullModal = document.createElement('div');
  fullModal.id = 'fullscreenZoomModal';
  fullModal.setAttribute('role', 'dialog');
  fullModal.setAttribute('aria-modal', 'true');
  fullModal.style.cssText = 'position:fixed !important; top:0 !important; left:0 !important; right:0 !important; bottom:0 !important; width:100vw !important; height:100vh !important; z-index:9999999 !important; background:#000000 !important; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:hidden; user-select:none; transition:opacity 0.2s ease-out; opacity:0;';

  // (2026-07-13) Deep 6x pinch zoom, 4x double-tap & pan drag; prev: 2.2x scale
  let zoomScale = 1;
  let translateX = 0, translateY = 0;
  let initialPinchDist = 0;
  let initialScale = 1;
  let isDragging = false;
  let dragStartX = 0, dragStartY = 0;
  let initialTranslateX = 0, initialTranslateY = 0;
  let isAlbumVisible = true;
  let lastTapTime = 0;
  let tapTimer = null;

  function updateZoomTransform(){
    const zoomImg = fullModal.querySelector('#fullscreenZoomImg');
    if(zoomImg){
      zoomImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${zoomScale})`;
    }
  }

  function renderFullscreenContent(slideDir = ''){
    zoomScale = 1; translateX = 0; translateY = 0;
    const e = log[currentIndex];
    const prevPhoto = currentIndex > 0 ? log[currentIndex - 1] : null;
    const nextPhoto = currentIndex < log.length - 1 ? log[currentIndex + 1] : null;

    const animClass = slideDir === 'left' ? 'animate-slide-left' : slideDir === 'right' ? 'animate-slide-right' : 'animate-fade-in';

    fullModal.innerHTML = `
      <div id="fullscreenHeaderBar" style="position:absolute !important; top:max(16px, env(safe-area-inset-top)) !important; left:0 !important; right:0 !important; width:100% !important; z-index:100 !important; transition:all 0.25s ease-out; opacity:${isAlbumVisible?1:0}; transform:translateY(${isAlbumVisible?0:-30}px); pointer-events:${isAlbumVisible?'auto':'none'};" class="px-4 flex items-center justify-between text-white">
        <div class="flex items-center gap-2.5">
          <span class="text-[12px] font-semibold bg-white/20 backdrop-blur-md px-3 py-1 rounded-full border border-white/20 text-white shadow-sm">${currentIndex + 1} of ${log.length}</span>
          <span class="text-[13px] font-semibold text-white/90 drop-shadow-md truncate max-w-[180px]">${e.towerName} · ${e.variety}</span>
        </div>
        <button id="fullscreenZoomClose" type="button" class="w-9 h-9 rounded-full bg-black/60 backdrop-blur-md hover:bg-black/80 active:scale-95 flex items-center justify-center text-white font-bold text-[18px] transition-all border border-white/20 shadow-md">✕</button>
      </div>

      <div id="zoomImgWrapper" class="w-full h-full relative flex items-center justify-center overflow-hidden cursor-pointer ${animClass}">
        ${prevPhoto ? `<img src="${prevPhoto.dataUrl}" style="position:absolute !important; left:-86% !important; top:10% !important; width:82% !important; height:80% !important; object-fit:contain !important; opacity:0.3 !important; filter:brightness(0.5) !important;" class="pointer-events-none" alt="prev preview">` : ''}
        <img id="fullscreenZoomImg" src="${e.dataUrl}" style="width:100% !important; height:auto !important; max-height:100vh !important; object-fit:contain !important; transition:transform 0.25s ease-out; transform:translate(${translateX}px, ${translateY}px) scale(${zoomScale});" class="block relative z-10" alt="Fullscreen zoom photo">
        ${nextPhoto ? `<img src="${nextPhoto.dataUrl}" style="position:absolute !important; right:-86% !important; top:10% !important; width:82% !important; height:80% !important; object-fit:contain !important; opacity:0.3 !important; filter:brightness(0.5) !important;" class="pointer-events-none" alt="next preview">` : ''}
      </div>

      <div id="fullscreenAlbumBar" style="position:absolute !important; bottom:max(12px, env(safe-area-inset-bottom)) !important; left:0 !important; right:0 !important; width:100% !important; z-index:100 !important; transition:all 0.25s ease-out; opacity:${isAlbumVisible?1:0}; transform:translateY(${isAlbumVisible?0:30}px); pointer-events:${isAlbumVisible?'auto':'none'};" class="px-4">
        <div class="bg-black/60 backdrop-blur-xl rounded-2xl p-1.5 max-w-sm mx-auto flex items-center justify-center gap-1.5 overflow-x-auto scrollbar-none">
          ${log.map((item, idx) => `
            <button data-album-idx="${idx}" type="button" style="width:36px !important; height:36px !important; min-width:36px !important; min-height:36px !important; aspect-ratio:1/1 !important;" class="rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${idx===currentIndex ? 'border-emerald-400 scale-105 shadow-md ring-1 ring-emerald-400/50' : 'border-white/30 opacity-50 hover:opacity-100'}">
              <img src="${item.dataUrl}" style="width:100% !important; height:100% !important; object-fit:cover !important; object-position:center !important;" class="block" alt="album thumbnail ${idx+1}">
            </button>
          `).join('')}
        </div>
      </div>
    `;

    const closeBtn = fullModal.querySelector('#fullscreenZoomClose');
    if(closeBtn){
      closeBtn.onclick = (ev) => {
        ev.stopPropagation();
        fullModal.style.opacity = '0';
        setTimeout(()=>fullModal.remove(), 200);
      };
    }

    fullModal.querySelectorAll('[data-album-idx]').forEach(btn => {
      btn.onclick = (ev) => {
        ev.stopPropagation();
        const targetIdx = Number(btn.dataset.albumIdx);
        if(targetIdx !== currentIndex){
          const dir = targetIdx > currentIndex ? 'left' : 'right';
          currentIndex = targetIdx;
          renderFullscreenContent(dir);
        }
      };
    });

    // Auto-scroll to center the active thumbnail
    const scrollToActiveThumb = () => {
      const albumBar = fullModal.querySelector('#fullscreenAlbumBar');
      if(!albumBar) return;
      
      const scrollContainer = albumBar.querySelector('.overflow-x-auto');
      if(!scrollContainer) return;
      
      const activeThumb = scrollContainer.querySelector(`[data-album-idx="${currentIndex}"]`);
      if(!activeThumb) return;
      
      const containerWidth = scrollContainer.clientWidth;
      const thumbLeft = activeThumb.offsetLeft;
      const thumbWidth = activeThumb.clientWidth;
      
      // Calculate position to center the thumbnail
      const scrollPosition = thumbLeft - (containerWidth / 2) + (thumbWidth / 2);
      
      scrollContainer.scrollTo({
        left: scrollPosition,
        behavior: 'smooth'
      });
    };
    
    // Scroll to active thumbnail on initial render and after content changes
    setTimeout(scrollToActiveThumb, 100);

    const wrapper = fullModal.querySelector('#zoomImgWrapper');

    if(wrapper){
      wrapper.onclick = () => {
        const now = Date.now();
        if(now - lastTapTime < 300){
          if(tapTimer) clearTimeout(tapTimer);
          if(zoomScale > 1){
            zoomScale = 1;
            translateX = 0;
            translateY = 0;
          } else {
            zoomScale = 4.0;
          }
          updateZoomTransform();
        } else {
          tapTimer = setTimeout(() => {
            isAlbumVisible = !isAlbumVisible;
            const albumBar = fullModal.querySelector('#fullscreenAlbumBar');
            const headerBar = fullModal.querySelector('#fullscreenHeaderBar');
            if(albumBar){
              albumBar.style.opacity = isAlbumVisible ? '1' : '0';
              albumBar.style.transform = `translateY(${isAlbumVisible ? 0 : 30}px)`;
              albumBar.style.pointerEvents = isAlbumVisible ? 'auto' : 'none';
            }
            if(headerBar){
              headerBar.style.opacity = isAlbumVisible ? '1' : '0';
              headerBar.style.transform = `translateY(${isAlbumVisible ? 0 : -30}px)`;
              headerBar.style.pointerEvents = isAlbumVisible ? 'auto' : 'none';
            }
          }, 300);
        }
        lastTapTime = now;
      };

      let startX = 0, startY = 0;
      wrapper.addEventListener('touchstart', (ev) => {
        if(ev.touches.length === 2){
          initialPinchDist = Math.hypot(
            ev.touches[0].clientX - ev.touches[1].clientX,
            ev.touches[0].clientY - ev.touches[1].clientY
          );
          initialScale = zoomScale;
        } else if(ev.touches.length === 1){
          startX = ev.touches[0].clientX;
          startY = ev.touches[0].clientY;
          if(zoomScale > 1){
            isDragging = true;
            dragStartX = ev.touches[0].clientX;
            dragStartY = ev.touches[0].clientY;
            initialTranslateX = translateX;
            initialTranslateY = translateY;
          }
        }
      }, { passive: true });

      wrapper.addEventListener('touchmove', (ev) => {
        if(ev.touches.length === 2 && initialPinchDist > 0){
          const currentDist = Math.hypot(
            ev.touches[0].clientX - ev.touches[1].clientX,
            ev.touches[0].clientY - ev.touches[1].clientY
          );
          const factor = currentDist / initialPinchDist;
          zoomScale = Math.min(6.0, Math.max(1.0, initialScale * factor));
          if(zoomScale === 1){ translateX = 0; translateY = 0; }
          updateZoomTransform();
        } else if(ev.touches.length === 1 && isDragging && zoomScale > 1){
          translateX = initialTranslateX + (ev.touches[0].clientX - dragStartX);
          translateY = initialTranslateY + (ev.touches[0].clientY - dragStartY);
          updateZoomTransform();
        }
      }, { passive: true });

      wrapper.addEventListener('touchend', (ev) => {
        isDragging = false;
        initialPinchDist = 0;
        if(ev.changedTouches.length === 1){
          const deltaX = ev.changedTouches[0].clientX - startX;
          const deltaY = ev.changedTouches[0].clientY - startY;

          if(zoomScale === 1 && deltaY > 120 && deltaY > Math.abs(deltaX)){
            fullModal.style.opacity = '0';
            fullModal.style.transform = 'translateY(100%)';
            fullModal.style.transition = 'all 0.25s ease-out';
            setTimeout(()=>fullModal.remove(), 250);
            return;
          }

          if(zoomScale === 1 && Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)){
            if(deltaX < 0 && currentIndex < log.length - 1){
              currentIndex++;
              renderFullscreenContent('left');
            } else if(deltaX > 0 && currentIndex > 0){
              currentIndex--;
              renderFullscreenContent('right');
            }
          }
        }
      }, { passive: true });
    }
  }

  document.body.appendChild(fullModal);
  requestAnimationFrame(()=>{ fullModal.style.opacity = '1'; });
  renderFullscreenContent();
}

document.getElementById('towerSearch')?.addEventListener('input', ()=>renderTower());

// (2026-07-13) Support uploading up to 5 photos at once; prev: single file
document.getElementById('galleryPhotoInput')?.addEventListener('change', (e)=>{
  const files = Array.from(e.target.files || []).slice(0, 5);
  if(files.length === 0) return;

  const towerId = state.activeTowerId;
  const tower = state.towers.find(t=>t.id===towerId);
  const activePockets = state.pockets.filter(p=>p.variety && state.rows.find(r=>r.id===p.rowId && r.towerId===towerId));
  const p = activePockets[0] || null;
  const row = p ? state.rows.find(r=>r.id===p.rowId) : null;
  const { stage, day } = p ? getPocketState(p) : { stage:null, day:0 };

  // (2026-07-13) Dark blur backdrop & Okay button for upload modal; prev: plain
  let doneCount = 0;
  let autoCloseTimer = null;
  let progressModal = document.getElementById('photoUploadProgressModal');
  if(progressModal) progressModal.remove();

  progressModal = document.createElement('div');
  progressModal.id = 'photoUploadProgressModal';
  progressModal.style.cssText = 'position:fixed !important; top:0 !important; left:0 !important; right:0 !important; bottom:0 !important; width:100vw !important; height:100vh !important; z-index:9999999 !important; background:rgba(20,30,24,0.75) !important; backdrop-filter:blur(12px) !important; opacity:0; transition:opacity 0.2s ease-out;';
  progressModal.className = 'flex items-center justify-center p-4';
  progressModal.innerHTML = `
    <div class="bg-white rounded-2xl p-6 shadow-2xl max-w-[320px] w-full flex flex-col items-center text-center border border-line/20" style="animation: modalPopIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;">
      <div id="photoUploadThumbnail" class="w-24 h-24 rounded-xl overflow-hidden mb-4 bg-cream border-2 border-line/30 flex items-center justify-center" style="min-height:96px; max-height:96px; min-width:96px; max-width:96px;">
        <svg class="w-10 h-10 text-ink-soft/30" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </div>
      <div id="photoUploadIconContainer" class="mb-3">
        <svg class="animate-spin w-8 h-8 text-forest" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
      <h3 id="photoUploadTitle" class="font-display font-bold text-[20px] text-forest leading-tight mb-2">Uploading Photos...</h3>
      <p id="photoUploadSub" class="text-[13px] text-ink-soft/70 mb-5 leading-relaxed">Processing images</p>
      <button id="photoUploadOkBtn" type="button" class="w-full bg-forest hover:bg-forest/90 active:scale-[0.98] text-white font-bold text-[17px] py-4 rounded-xl shadow-lg transition-all hidden">
        Okay
      </button>
    </div>
  `;
  document.body.appendChild(progressModal);
  
  // Fade in the modal
  requestAnimationFrame(() => {
    progressModal.style.opacity = '1';
  });

  const barEl = null; // Progress bar removed
  const pctEl = null; // Percentage removed
  const iconContainer = progressModal.querySelector('#photoUploadIconContainer');
  const titleEl = progressModal.querySelector('#photoUploadTitle');
  const subEl = progressModal.querySelector('#photoUploadSub');
  const okBtn = progressModal.querySelector('#photoUploadOkBtn');
  const thumbnailEl = progressModal.querySelector('#photoUploadThumbnail');

  const closeUploadModal = () => {
    if(autoCloseTimer) clearTimeout(autoCloseTimer);
    progressModal.style.opacity = '0';
    progressModal.style.transition = 'opacity 0.2s ease-out';
    setTimeout(()=>progressModal.remove(), 200);
  };

  if(okBtn) okBtn.onclick = closeUploadModal;

  // Process files with compression (no fake animation delay)
  let processedCount = 0;
  const totalFiles = files.length;

  files.forEach(async (file, idx)=>{
    try {
      // Show first image thumbnail (with object-fit to prevent stretching)
      if(idx === 0 && thumbnailEl){
        const previewReader = new FileReader();
        previewReader.onload = (e) => {
          thumbnailEl.innerHTML = `<img src="${e.target.result}" class="w-full h-full" style="object-fit:cover; object-position:center; min-height:96px; max-height:96px; min-width:96px; max-width:96px;" alt="upload preview">`;
        };
        previewReader.readAsDataURL(file);
      }

      // Compress image (max 1200px width, 80% quality)
      const compressedDataUrl = await compressImage(file, 1200, 0.8);

      const currentBatchSummary = getTowerCropSummary({ towerId });
      const entry = {
        id: 'ph_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substring(2,6),
        dataUrl: compressedDataUrl,
        towerId,
        towerName: tower?.name || 'Tower',
        pocketId: p?.id || '—',
        rowLabel: row ? `Row ${state.rows.indexOf(row)+1}` : '—',
        variety: p?.variety || 'Tower General',
        health: p?.health || 'healthy',
        stage: stage?.label || 'N/A',
        stageKey: stage?.key || '',
        day: day || 0,
        datePlanted: p?.datePlanted || null,
        cropSummary: currentBatchSummary.cropSummary,
        healthKey: currentBatchSummary.healthKey,
        healthLabel: currentBatchSummary.healthLabel,
        healthColor: currentBatchSummary.healthColor,
        loggedAt: new Date().toISOString(),
        dateLabel: new Date().toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'})
      };
      
      if(!state.photoLog) state.photoLog = [];
      state.photoLog.unshift(entry);
      processedCount++;

      // (2026-07-13) Sync each photo to separate Firestore document
      if(typeof cloudSync !== 'undefined' && cloudSync.connected){
        cloudSync.syncPhoto(entry).catch(err => console.error('Photo sync error:', err));
      }

      // When all files are done processing, show success immediately
      if(processedCount === totalFiles){
        if(state.photoLog.length > 100) state.photoLog = state.photoLog.slice(0,100);
        persist('photoLog');
        renderTowerPhotoGallery();

        // Success state
        if(thumbnailEl){
          thumbnailEl.className = 'w-24 h-24 rounded-xl overflow-hidden mb-4 bg-forest/10 border-2 border-forest/30 flex items-center justify-center relative';
          thumbnailEl.style.cssText = 'min-height:96px; max-height:96px; min-width:96px; max-width:96px;';
          const checkIcon = document.createElement('div');
          checkIcon.className = 'absolute inset-0 bg-forest/90 flex items-center justify-center';
          checkIcon.innerHTML = `<svg class="w-12 h-12 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
          thumbnailEl.appendChild(checkIcon);
        }
        if(iconContainer){
          iconContainer.innerHTML = '';
          iconContainer.style.display = 'none';
        }
        if(titleEl){
          titleEl.className = 'font-display font-bold text-[20px] text-forest leading-tight mb-2';
          titleEl.innerHTML = `<span style="display:inline-block; margin-right:8px;">✓</span>Upload Successful!`;
        }
        if(subEl){
          subEl.className = 'text-[13px] text-ink-soft/70 mb-5 leading-relaxed';
          subEl.textContent = 'Photo saved to Tower Growth History';
        }
        if(okBtn){
          okBtn.classList.remove('hidden');
          okBtn.style.display = 'block';
        }
        showToast(`Uploaded ${totalFiles} photo(s) to Tower History`, 'forest', 'camera');
        e.target.value = '';

        autoCloseTimer = setTimeout(()=>{
          closeUploadModal();
        }, 2500);
      }
    } catch(err){
      console.error('Image compression failed:', err);
      processedCount++;
    }
  });
});
// (2026-07-13) Use SVG icons and yellow/red borders for pocket chip health; prev: emojis
function pocketChipHTML(p){
  const {status, day, stage} = getPocketState(p);
  const stageKey = stage ? stage.key : 'empty';
  const health = p.health || 'healthy';
  const healthBadge = p.variety && health==='unhealthy' ? `<span class="absolute top-0.5 right-0.5">${icon('alert-triangle','w-3 h-3 text-[#D97706]',12)}</span>` : p.variety && health==='dead' ? `<span class="absolute top-0.5 right-0.5">${icon('x-circle','w-3 h-3 text-[#DC2626]',12)}</span>` : '';
  const healthBorder = p.variety && health==='unhealthy' ? 'ring-2 ring-[#F59E0B] bg-[#FEF3C7]/40' : p.variety && health==='dead' ? 'ring-2 ring-[#EF4444] bg-[#FEE2E2]/40 opacity-75' : '';
  return `<button data-pocket-chip="${p.id}" class="pocket-chip status-${status} ${healthBorder} relative flex flex-col items-center justify-between p-2 flex-shrink-0 shadow-sm">
    ${healthBadge}
    <span class="text-[11px] font-mono font-bold text-ink-soft/90 pt-0.5">#${p.id}</span>
    <span class="my-auto">${plantIcon(status==='empty'?'empty':stageKey, 26)}</span>
    <span class="text-[9.5px] font-semibold text-ink-soft leading-none pb-0.5">${p.variety ? ('D'+day) : '—'}</span>
  </button>`;
}

/* ---- Row Inspector Modal ---- */
let activeRowId = null;
function openRowModal(rowId){
  activeRowId = rowId;
  const row = state.rows.find(r=>r.id===rowId);
  const pockets = state.pockets.filter(p=>p.rowId===rowId);
  document.getElementById('rowModalTitle').textContent = `${rowLabel(row)} · ${pockets.length} Pockets`;
  const body = document.getElementById('rowModalBody');
  body.innerHTML = `
    <div class="bg-cream rounded-xl p-3.5 mb-4">
      <p class="text-[12.5px] text-ink-soft mb-3">Assign a crop to the whole row at once. This overwrites every pocket in ${rowLabel(row)}.</p>
      <label class="text-[12px] font-medium text-ink-soft">Crop Variety</label>
      <select id="rowVariety" class="w-full border border-line rounded-lg px-3 py-2.5 mt-1 mb-3 text-[14px] bg-white">
        ${CROP_PRESETS.map(c=>`<option value="${c.name}">${c.name}</option>`).join('')}
      </select>
      <label class="text-[12px] font-medium text-ink-soft">Days Old</label>
      <input id="rowDaysOld" type="number" min="0" value="0" class="w-full border border-line rounded-lg px-3 py-2.5 mt-1 mb-3 text-[14px] font-mono bg-white">
      <button id="btnAssignRow" class="w-full bg-forest text-white font-semibold text-[13.5px] py-2.5 rounded-lg flex items-center justify-center gap-1.5">${icon('layers','w-4 h-4',16)} Assign Entire Row</button>
    </div>
    <div class="flex items-center justify-between mb-2">
      <span class="text-[12.5px] font-semibold text-ink-soft">Pockets in this row</span>
      <button id="btnClearRow" class="text-[11.5px] font-medium text-clay flex items-center gap-1">${icon('trash-2','w-3.5 h-3.5',14)} Clear all</button>
    </div>
    <div class="grid grid-cols-4 gap-2 mb-4">${pockets.map(p=>pocketChipHTML(p)).join('')}</div>
    <button id="btnDeleteRow" class="w-full text-[12.5px] font-medium text-clay bg-[#FCEBD8] rounded-lg py-2.5 flex items-center justify-center gap-1.5">${icon('x-circle','w-4 h-4',16)} Delete This Row</button>`;

  body.querySelectorAll('[data-pocket-chip]').forEach(btn=>btn.addEventListener('click', ()=>{ closeModal('rowModal'); openPocketModal(Number(btn.dataset.pocketChip)); }));

  document.getElementById('btnAssignRow').addEventListener('click', async ()=>{
    const variety = document.getElementById('rowVariety').value;
    const daysOld = Number(document.getElementById('rowDaysOld').value)||0;
    const planted = pockets.filter(p=>p.variety).length;
    if(planted>0 && !await showConfirm(`This will overwrite ${planted} already-planted pocket(s) in ${rowLabel(row)}. Continue?`, 'Overwrite Pockets')) return;
    pockets.forEach(p=>{ p.variety=variety; p.datePlanted=daysAgoISO(daysOld); p.override=null; });
    persist('pockets'); closeModal('rowModal'); renderTower();
    maybeTriggerFirstPlantFlow();
    showToast(`${rowLabel(row)} assigned to ${variety}`,'forest','layers');
  });
  document.getElementById('btnClearRow').addEventListener('click', async ()=>{
    if(!await showConfirm(`Clear every pocket in ${rowLabel(row)}?`, 'Clear Row')) return;
    pockets.forEach(p=>{ p.variety=null; p.datePlanted=null; p.override=null; });
    persist('pockets'); closeModal('rowModal'); renderTower();
  });
  document.getElementById('btnDeleteRow').addEventListener('click', async ()=>{
    if(state.rows.length<=1){ showToast('You need at least one row','clay','alert-triangle'); return; }
    if(!await showConfirm(`Delete ${rowLabel(row)} and its ${pockets.length} pockets? This can't be undone.`, 'Delete Row')) return;
    state.pockets = state.pockets.filter(p=>p.rowId!==rowId);
    state.rows = state.rows.filter(r=>r.id!==rowId);
    persist('pockets'); persist('rows'); closeModal('rowModal'); renderTower();
    showToast('Row deleted','clay','trash-2');
  });
  document.getElementById('rowModal').classList.remove('hidden');
}

// (2026-07-13) Support type, custom rows (default 8) & cols in newTowerForm
function applyTowerTypeDefaults(){
  const type = document.getElementById('newTowerType')?.value || 'vertical';
  const rowsInput = document.getElementById('newTowerRowsCount');
  const colsInput = document.getElementById('newTowerColsCount');
  if(type==='horizontal'){
    if(rowsInput) rowsInput.value = 3;
    if(colsInput) colsInput.value = 8;
  } else {
    if(rowsInput) rowsInput.value = 8;
    if(colsInput) colsInput.value = 3;
  }
}
document.getElementById('btnAddTower')?.addEventListener('click', ()=>{
  if(document.getElementById('newTowerName')) document.getElementById('newTowerName').value = '';
  applyTowerTypeDefaults();
  document.getElementById('newTowerModal').classList.remove('hidden');
});
document.getElementById('newTowerType')?.addEventListener('change', applyTowerTypeDefaults);
document.getElementById('newTowerForm')?.addEventListener('submit', (e)=>{
  e.preventDefault();
  const name = document.getElementById('newTowerName')?.value.trim() || `System #${state.towers.length + 1}`;
  const type = document.getElementById('newTowerType')?.value || 'vertical';
  const rowCount = Math.max(1, Math.min(24, Number(document.getElementById('newTowerRowsCount')?.value)||8));
  const colCount = Math.max(1, Math.min(12, Number(document.getElementById('newTowerColsCount')?.value)||3));
  const newTowerId = 't_' + Date.now();
  state.towers.push({ id: newTowerId, name, type });
  state.activeTowerId = newTowerId;
  localStorage.setItem(KEYS.activeTower, newTowerId);
  persist('towers');

  for(let r=1; r<=rowCount; r++){
    const rowId = uid();
    state.rows.push({ id: rowId, towerId: newTowerId, potCount: colCount });
    const maxId = state.pockets.reduce((m,p)=>Math.max(m,p.id),0);
    for(let i=0; i<colCount; i++){
      state.pockets.push({ id: maxId+i+1, rowId, variety:null, datePlanted:null, override:null });
    }
  }
  persist('rows'); persist('pockets');
  closeModal('newTowerModal');
  renderTower();
  showToast(`Created ${name} with ${rowCount} rows`,'forest','plus');
});

document.getElementById('btnRenameTower')?.addEventListener('click', ()=>{
  const activeTower = getActiveTower();
  document.getElementById('renameTowerInput').value = activeTower.name;
  document.getElementById('deleteTowerHint')?.classList.toggle('hidden', state.towers.length>1);
  document.getElementById('btnDeleteTower')?.toggleAttribute('disabled', state.towers.length<=1);
  document.getElementById('btnDeleteTower')?.classList.toggle('opacity-40', state.towers.length<=1);
  document.getElementById('btnDeleteTower')?.classList.toggle('pointer-events-none', state.towers.length<=1);
  document.getElementById('renameTowerModal').classList.remove('hidden');
});
document.getElementById('btnDeleteTower')?.addEventListener('click', ()=>{
  if(state.towers.length<=1) return;
  const activeTower = getActiveTower();
  if(!confirm(`Delete "${activeTower.name}" and every row and pocket in it? This can't be undone.`)) return;
  const snapshotTowers = JSON.parse(JSON.stringify(state.towers));
  const snapshotRows = JSON.parse(JSON.stringify(state.rows));
  const snapshotPockets = JSON.parse(JSON.stringify(state.pockets));
  const snapshotActive = state.activeTowerId;

  const rowIdsToRemove = new Set(state.rows.filter(r=>(r.towerId||'t1')===activeTower.id).map(r=>r.id));
  state.pockets = state.pockets.filter(p=>!rowIdsToRemove.has(p.rowId));
  state.rows = state.rows.filter(r=>!rowIdsToRemove.has(r.id));
  state.towers = state.towers.filter(t=>t.id!==activeTower.id);
  state.activeTowerId = state.towers[0].id;
  localStorage.setItem(KEYS.activeTower, state.activeTowerId);
  persist('towers'); persist('rows'); persist('pockets');
  closeModal('renameTowerModal');
  renderTower();
  triggerUndoSnackbar(`Deleted "${activeTower.name}"`, ()=>{
    state.towers = snapshotTowers;
    state.rows = snapshotRows;
    state.pockets = snapshotPockets;
    state.activeTowerId = snapshotActive;
    localStorage.setItem(KEYS.activeTower, snapshotActive);
    persist('towers'); persist('rows'); persist('pockets');
    renderTower();
  });
});
document.getElementById('renameTowerForm')?.addEventListener('submit', (e)=>{
  e.preventDefault();
  const newName = document.getElementById('renameTowerInput')?.value.trim();
  if(newName){
    const activeTower = getActiveTower();
    activeTower.name = newName;
    persist('towers');
    closeModal('renameTowerModal');
    renderTower();
    showToast(`Renamed tower to ${newName}`,'forest','edit');
  }
});

/* ---- Add Row ---- */
document.getElementById('btnAddRow').addEventListener('click', ()=>{
  const activeTower = getActiveTower();
  document.getElementById('addRowCount').value = activeTower.type==='horizontal' ? 8 : 3;
  document.getElementById('addRowModal').classList.remove('hidden');
});
document.getElementById('addRowForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const activeTower = getActiveTower();
  const count = Math.max(1, Math.min(16, Number(document.getElementById('addRowCount').value)||3));
  const newRow = { id: uid(), towerId: activeTower.id, potCount: count };
  state.rows.push(newRow);
  const maxId = state.pockets.reduce((m,p)=>Math.max(m,p.id),0);
  for(let i=0;i<count;i++) state.pockets.push({ id:maxId+i+1, rowId:newRow.id, variety:null, datePlanted:null, override:null });
  persist('rows'); persist('pockets');
  closeModal('addRowModal'); renderTower();
  showToast(`${rowLabel(newRow)} added with ${count} pockets`,'forest','list-plus');
});

// (2026-07-13) Fix pocket lookup using string matching; prev: strict x.id===id
function openPocketModal(id){
  const p = state.pockets.find(x=>String(x.id)===String(id));
  if(!p) return;
  const row = state.rows.find(r=>r.id===p.rowId);
  const {status, stage, day} = getPocketState(p);
  document.getElementById('pocketModalTitle').textContent = `${row?rowLabel(row):''} · Pocket #${id}`;
  const body = document.getElementById('pocketModalBody');

// (2026-07-13) Show custom seed input only on Custom Variety in pocket modal
  if(!p.variety){
    body.innerHTML = `
      <div class="flex flex-col items-center py-4 mb-2">${plantIcon('empty',64)}<p class="text-[13px] text-ink-soft mt-2">This pocket is empty.</p></div>
      <label class="text-[12.5px] font-medium text-ink-soft">Crop Variety / Seed Name</label>
      <div class="mt-1 mb-3">
        <select id="assignVariety" class="w-full border border-line rounded-lg px-2.5 py-2.5 text-[13px] bg-white">${CROP_PRESETS.map(c=>`<option value="${c.name}">${c.name}</option>`).join('')}</select>
        <input id="assignCustomName" type="text" placeholder="Enter custom seed name…" class="hidden w-full border border-line rounded-lg px-2.5 py-2.5 text-[13px] bg-white mt-2">
      </div>
      <label class="text-[12.5px] font-medium text-ink-soft">Days Old</label>
      <input id="assignDaysOld" type="number" min="0" value="0" class="w-full border border-line rounded-lg px-3 py-2.5 mt-1 mb-4 text-[14px] font-mono">
      <button id="btnAssignPocket" class="w-full bg-forest text-white font-semibold text-[14px] py-2.5 rounded-lg">Assign to Pocket</button>`;
    setupCustomSeedToggle('assignVariety', 'assignCustomName');
    document.getElementById('btnAssignPocket').addEventListener('click', ()=>{
      const customVal = document.getElementById('assignCustomName')?.value.trim();
      const selectVal = document.getElementById('assignVariety')?.value;
      p.variety = customVal || selectVal || 'Custom Crop';
      p.datePlanted = daysAgoISO(Number(document.getElementById('assignDaysOld').value)||0);
      p.override = null;
      persist('pockets'); closeModal('pocketModal'); renderTower();
      maybeTriggerFirstPlantFlow();
      showToast(`Assigned ${p.variety} to Pocket #${id}`,'forest','sprout');
    });
  } else {
    const idx = stageIndex(stage.key);
    const progressPct = Math.min(100, Math.round((day/45)*100));
    const est = nextTransitionInfo(day, stage);
    // (2026-07-13) Normalize health so single-tap works from fresh pocket; prev: !p.health fallback
    if(!p.health) p.health = 'healthy';
    const ph = p.health;
    body.innerHTML = `
      <div class="flex items-center gap-3 mb-4 bg-cream rounded-xl p-3">
        <div class="flex-shrink-0">${plantIcon(stage.key,56)}</div>
        <div>
          <div class="font-semibold text-[15px] text-ink">${p.variety}</div>
          <div class="text-[12px] text-ink-soft">Planted ${fmtDate(p.datePlanted)}</div>
          <span class="inline-block mt-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full status-${status}">${STATUS_LABEL[status]}</span>
        </div>
      </div>
      <div class="mb-4">
        <div class="flex items-center justify-between mb-1">
          <span class="text-[13px] font-semibold text-forest">${stage.label}</span>
          <span class="text-[12px] font-mono text-ink-soft">Day ${day}</span>
        </div>
        <div class="w-full h-2 bg-line rounded-full overflow-hidden mb-1.5"><div class="h-full bg-leaf rounded-full" style="width:${progressPct}%"></div></div>
        <p class="text-[12px] text-ink-soft">${stage.note}</p>
      </div>
      <div class="bg-[#FDF3D8] rounded-xl p-3 mb-4 flex items-center gap-2.5">
        ${icon('timer','w-4 h-4 text-[#8a6a12] flex-shrink-0',18)}
        <div class="text-[12px] text-[#8a6a12]">${est.done ? `<strong>Harvest window is open</strong> — pick whenever ready.` : `Next: <strong>${est.label}</strong> in ${est.daysUntil===0?'today':est.daysUntil+' day(s)'} <span class="opacity-70">(${fmtDate(est.date)})</span>`}</div>
      </div>
      <!-- (2026-07-13) Health buttons: all 3 get bg when active; prev: partial styling -->
      <div class="mb-4">
        <label class="text-[12px] font-semibold text-ink-soft mb-1.5 block">Plant Condition / Health</label>
        <div class="grid grid-cols-3 gap-2">
          <button id="btnPocketHealthHealthy" class="py-2.5 px-1 text-[12.5px] rounded-xl border flex items-center justify-center gap-1.5 transition-all ${ph==='healthy'?'bg-[#DCFCE7] border-[#22C55E] text-[#15803D] font-semibold shadow-sm':'border-line text-ink-soft'}">${icon('circle-check','w-4 h-4',16)} Healthy</button>
          <button id="btnPocketHealthUnhealthy" class="py-2.5 px-1 text-[12.5px] rounded-xl border flex items-center justify-center gap-1.5 transition-all ${ph==='unhealthy'?'bg-[#FEF3C7] border-[#F59E0B] text-[#92400E] font-semibold shadow-sm':'border-line text-ink-soft'}">${icon('alert-triangle','w-4 h-4',16)} Unhealthy</button>
          <button id="btnPocketHealthDead" class="py-2.5 px-1 text-[12.5px] rounded-xl border flex items-center justify-center gap-1.5 transition-all ${ph==='dead'?'bg-[#FEE2E2] border-[#EF4444] text-[#991B1B] font-semibold shadow-sm':'border-line text-ink-soft'}">${icon('x-circle','w-4 h-4',16)} Dead</button>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-2.5 mb-3">
        <button id="btnAdvanceStage" class="text-[13px] font-semibold text-forest bg-mint rounded-lg py-2.5 flex items-center justify-center gap-1.5" ${idx>=STAGES.length-1?'disabled':''}>${icon('arrow-right-circle','w-4 h-4',16)} Advance Stage</button>
        <button id="btnHarvestPocket" class="text-[13px] font-semibold text-white bg-gold rounded-lg py-2.5 flex items-center justify-center gap-1.5">${icon('scissors','w-4 h-4',16)} Harvest</button>
      </div>
      <div class="grid grid-cols-2 gap-2.5 mb-3">
        <button id="btnReturnToTray" class="text-[12.5px] font-semibold text-forest bg-mint/60 hover:bg-mint rounded-lg py-2.5 flex items-center justify-center gap-1.5 transition-colors">${icon('move-left','w-4 h-4',16)} Return to Tray</button>
        <button id="btnClearPocket" class="text-[12.5px] font-medium text-clay bg-[#FCEBD8] rounded-lg py-2.5 flex items-center justify-center gap-1.5">${icon('trash-2','w-4 h-4',16)} Clear Pocket</button>
      </div>`;

    const setPocketHealth = (h)=>{
      p.health = h;
      logActivityNotification('⚠️ Plant Health Updated', `Pocket #${id} (${p.variety}) marked as ${h}`, 'alert-triangle');
      persist('pockets'); openPocketModal(id); renderTower();
      showToast(`Pocket #${id} marked as ${h}`,'forest','sprout');
    };
    document.getElementById('btnPocketHealthHealthy')?.addEventListener('click', ()=>setPocketHealth('healthy'));
    document.getElementById('btnPocketHealthUnhealthy')?.addEventListener('click', ()=>setPocketHealth('unhealthy'));
    document.getElementById('btnPocketHealthDead')?.addEventListener('click', ()=>setPocketHealth('dead'));

    document.getElementById('btnAdvanceStage').addEventListener('click', ()=>{
      p.override = Math.min(STAGES.length-1, idx+1);
      persist('pockets'); openPocketModal(id); renderTower();
      showToast(`Pocket #${id} advanced to ${STAGES[p.override].label}`,'forest','arrow-right-circle');
    });
    document.getElementById('btnHarvestPocket').addEventListener('click', ()=>{ closeModal('pocketModal'); openHarvestModal(p); });
    // (2026-07-13) Open target tray selector modal on Return to Tray; prev: auto tray
    document.getElementById('btnReturnToTray')?.addEventListener('click', ()=>{
      closeModal('pocketModal');
      openReturnTrayModal(id);
    });
    document.getElementById('btnClearPocket').addEventListener('click', ()=>{
      const snapshotPockets = JSON.parse(JSON.stringify(state.pockets));
      const varName = p.variety || 'Plant';
      p.variety=null; p.datePlanted=null; p.override=null;
      persist('pockets'); closeModal('pocketModal'); renderTower();
      triggerUndoSnackbar(`Cleared ${varName} from Pocket #${id}`, ()=>{
        state.pockets = snapshotPockets;
        persist('pockets'); renderTower();
      });
    });
  }
  document.getElementById('pocketModal').classList.remove('hidden');
}

// (2026-07-13) Modal to select target tray and cell for reversion; prev: auto tray
function openReturnTrayModal(pocketId){
  const p = state.pockets.find(x=>String(x.id)===String(pocketId));
  if(!p || !p.variety) return;
  
  const selectEl = document.getElementById('returnTargetTraySelect');
  if(!selectEl) return;
  if(state.trays.length === 0){
    showToast('No seedling nursery trays available!', 'clay', 'alert-triangle');
    return;
  }
  
  selectEl.innerHTML = state.trays.map(t=>`<option value="${t.id}">${t.variety} (${t.count} cells filled)</option>`).join('');
  
  const renderCellGrid = ()=>{
    const targetTray = state.trays.find(t=>t.id===selectEl.value) || state.trays[0];
    const cells = getTrayCells(targetTray);
    const gridEl = document.getElementById('returnTrayCellGrid');
    if(!gridEl) return;
    const cols = targetTray.gridCols || 4;
    gridEl.style.display = 'grid';
    gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    gridEl.style.gap = '6px';
    gridEl.innerHTML = cells.map((c, i)=>`
      <div class="aspect-square rounded-md text-[10px] font-mono flex items-center justify-center border transition-all ${c.filled ? 'bg-line/40 text-ink-soft opacity-50' : 'bg-mint/40 border-forest text-forest font-bold'}">
        ${c.id}
      </div>`).join('');
  };
  
  selectEl.onchange = renderCellGrid;
  renderCellGrid();

  document.getElementById('btnConfirmReturnToTray').onclick = ()=>{
    const targetTray = state.trays.find(t=>t.id===selectEl.value) || state.trays[0];
    const cells = getTrayCells(targetTray);
    const emptyCell = cells.find(c=>!c.filled);
    if(!emptyCell){
      showToast('Selected tray has no empty cells!', 'clay', 'alert-triangle');
      return;
    }
    const snapshotPockets = JSON.parse(JSON.stringify(state.pockets));
    const snapshotTrays = JSON.parse(JSON.stringify(state.trays));
    
    emptyCell.filled = true;
    targetTray.count = cells.filter(c=>c.filled).length;
    const plantName = p.variety;
    p.variety = null; p.datePlanted = null; p.override = null; delete p.photo;
    
    persist('pockets'); persist('trays');
    closeModal('returnTrayModal');
    renderTower(); renderNursery();
    logActivityNotification('↩️ Returned to Tray', `Returned ${plantName} to tray "${targetTray.variety}" cell [${emptyCell.id}]`, 'move-left');
    triggerUndoSnackbar(`Returned ${plantName} to tray cell [${emptyCell.id}]`, ()=>{
      state.pockets = snapshotPockets; state.trays = snapshotTrays;
      persist('pockets'); persist('trays');
      renderTower(); renderNursery();
    });
  };
  
  document.getElementById('returnTrayModal').classList.remove('hidden');
}

function closeModal(id){ document.getElementById(id).classList.add('hidden'); }
// (2026-07-13) Add newTowerModalClose and renameTowerModalClose handlers
document.getElementById('newTowerModalClose')?.addEventListener('click', ()=>closeModal('newTowerModal'));
document.getElementById('renameTowerModalClose')?.addEventListener('click', ()=>closeModal('renameTowerModal'));
document.getElementById('returnTrayModalClose')?.addEventListener('click', ()=>closeModal('returnTrayModal'));
document.getElementById('pocketModalClose').addEventListener('click', ()=>closeModal('pocketModal'));
document.getElementById('rowModalClose').addEventListener('click', ()=>closeModal('rowModal'));
document.getElementById('addRowModalClose').addEventListener('click', ()=>closeModal('addRowModal'));
document.getElementById('trayModalClose').addEventListener('click', ()=>closeModal('trayModal'));
document.getElementById('transplantModalClose').addEventListener('click', ()=>closeModal('transplantModal'));
document.getElementById('expenseModalClose').addEventListener('click', ()=>closeModal('expenseModal'));
document.getElementById('harvestModalClose').addEventListener('click', ()=>closeModal('harvestModal'));
// (2026-07-13) Add reservoirModalClose listener; prev: none
document.getElementById('reservoirModalClose')?.addEventListener('click', ()=>closeModal('reservoirModal'));
document.querySelectorAll('.modal-backdrop').forEach(m=>m.addEventListener('click', (e)=>{ if(e.target===m) m.classList.add('hidden'); }));

/* ================= RESERVOIR & DOSING CALCULATOR ================= */
// (2026-07-13) Automated Dosing Calculator for pH & SNAP Nutrients; prev: none
function calcReservoirDosing(liters, currentPh, targetPh, currentEc, targetEc){
  liters = Number(liters) || 30;
  currentPh = Number(currentPh) || 6.0;
  targetPh = Number(targetPh) || 6.0;
  currentEc = Number(currentEc) || 1.6;
  targetEc = Number(targetEc) || 1.8;

  let phText = '';
  if(currentPh > targetPh + 0.05){
    const drop = (currentPh - targetPh) / 0.1;
    const mlDown = Math.max(1, Math.round(drop * 0.5 * (liters / 10)));
    phText = `Add ${mlDown} mL pH Down`;
  } else if(currentPh < targetPh - 0.05){
    const rise = (targetPh - currentPh) / 0.1;
    const mlUp = Math.max(1, Math.round(rise * 0.5 * (liters / 10)));
    phText = `Add ${mlUp} mL pH Up`;
  } else {
    phText = 'pH is optimal';
  }

  let ecText = '';
  if(currentEc < targetEc - 0.05){
    const diff = targetEc - currentEc;
    const mlPart = Math.max(1, Math.round((diff / 0.6) * 5 * (liters / 10)));
    ecText = `Add ${mlPart} mL Part A & Part B`;
  } else {
    ecText = 'EC is optimal';
  }

  return { phText, ecText, suggestion: `${phText} · ${ecText}` };
}

function renderReservoirWidget(){
  const res = state.reservoir || { ph:6.0, targetPh:6.0, ec:1.6, targetEc:1.8, tempC:22, waterPct:85, capacityLiters:30 };
  
  const phEl = document.getElementById('resCardPh');
  if(phEl) phEl.textContent = Number(res.ph||6.0).toFixed(1);
  const phStatEl = document.getElementById('resCardPhStatus');
  if(phStatEl){
    if(res.ph >= 5.8 && res.ph <= 6.4) phStatEl.textContent = 'Optimal (5.8 - 6.4)';
    else if(res.ph > 6.4) phStatEl.textContent = 'High — pH Down needed';
    else phStatEl.textContent = 'Low — pH Up needed';
  }

  const ecEl = document.getElementById('resCardEc');
  if(ecEl) ecEl.innerHTML = `${Number(res.ec||1.6).toFixed(1)} <span class="text-xs font-normal">mS/cm</span>`;
  const ecStatEl = document.getElementById('resCardEcStatus');
  if(ecStatEl){
    if(res.ec >= 1.2 && res.ec <= 2.0) ecStatEl.textContent = 'Optimal (1.2 - 2.0)';
    else if(res.ec < 1.2) ecStatEl.textContent = 'Low — Add nutrients';
    else ecStatEl.textContent = 'High — Dilute water';
  }

  const tempEl = document.getElementById('resCardTemp');
  if(tempEl) tempEl.textContent = `${Math.round(res.tempC||22)}°C`;
  const tempStatEl = document.getElementById('resCardTempStatus');
  if(tempStatEl){
    if(res.tempC >= 18 && res.tempC <= 23) tempStatEl.textContent = 'Safe (18°C - 23°C)';
    else if(res.tempC > 23) tempStatEl.textContent = 'Warm — Dissolved O2 risk!';
    else tempStatEl.textContent = 'Cool — Slow growth';
  }

  const waterEl = document.getElementById('resCardWater');
  if(waterEl) waterEl.textContent = `${Math.round(res.waterPct||85)}%`;
  const waterStatEl = document.getElementById('resCardWaterStatus');
  if(waterStatEl){
    if(res.waterPct < 30) waterStatEl.textContent = 'LOW! Refill reservoir now';
    else waterStatEl.textContent = `${res.capacityLiters||30}L Capacity`;
  }

  const dosing = calcReservoirDosing(res.capacityLiters||30, res.ph||6.0, res.targetPh||6.0, res.ec||1.6, res.targetEc||1.8);
  const dosingTextEl = document.getElementById('resDosingText');
  if(dosingTextEl) dosingTextEl.textContent = `${dosing.suggestion}`;
}

function openReservoirModal(){
  const res = state.reservoir || { ph:6.0, targetPh:6.0, ec:1.6, targetEc:1.8, tempC:22, waterPct:85, capacityLiters:30 };
  document.getElementById('resPhInput').value = res.ph || 6.0;
  document.getElementById('resTargetPhInput').value = res.targetPh || 6.0;
  document.getElementById('resEcInput').value = res.ec || 1.6;
  document.getElementById('resTargetEcInput').value = res.targetEc || 1.8;
  document.getElementById('resTempInput').value = res.tempC || 22;
  document.getElementById('resWaterPctInput').value = res.waterPct || 85;
  document.getElementById('resTopOffLitersInput').value = 0;
  updateReservoirDosingSuggestion();
  document.getElementById('reservoirModal').classList.remove('hidden');
}

function updateReservoirDosingSuggestion(){
  const ph = Number(document.getElementById('resPhInput')?.value)||6.0;
  const tPh = Number(document.getElementById('resTargetPhInput')?.value)||6.0;
  const ec = Number(document.getElementById('resEcInput')?.value)||1.6;
  const tEc = Number(document.getElementById('resTargetEcInput')?.value)||1.8;
  const cap = state.reservoir?.capacityLiters || 30;
  const dosing = calcReservoirDosing(cap, ph, tPh, ec, tEc);
  const el = document.getElementById('resDosingSuggestion');
  if(el) el.textContent = dosing.suggestion;
}

/* ================= NURSERY ================= */
// (2026-07-13) Define traySelection and drag selection state; prev: syntax error
const traySelection = { trayId:null, indices:new Set() };
const tlp = { timer:null, activeTrayId:null, fired:false, dragging:false, startX:0, startY:0 };
function trayCellSelect(trayId, idx){
  if(traySelection.trayId!==trayId){ traySelection.trayId=trayId; traySelection.indices=new Set(); }
  if(!traySelection.indices.has(idx)){
    traySelection.indices.add(idx);
    renderNursery();
  }
}
// (2026-07-13) Add health state to seedling tray cells; prev: filled only
function getTrayCells(tray){
  const rows = tray.gridRows || 3;
  const cols = tray.gridCols || 4;
  const total = rows * cols;
  if(!tray.cells || tray.cells.length !== total){
    const filledCount = tray.count !== undefined ? tray.count : total;
    tray.cells = Array.from({ length: total }, (_, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      return { id: `${r}-${c}`, index: i, filled: i < filledCount, health: 'healthy' };
    });
  }
  return tray.cells;
}

function trayCellToggle(trayId, idx){
  if(traySelection.trayId!==trayId){ traySelection.trayId=trayId; traySelection.indices=new Set(); }
  if(traySelection.indices.has(idx)) traySelection.indices.delete(idx); else traySelection.indices.add(idx);
  renderNursery();
}
function trayCellSelectAll(tray){
  const cells = getTrayCells(tray);
  const filledIndices = cells.map((c, i)=>c.filled ? i : -1).filter(i=>i!==-1);
  traySelection.trayId = tray.id;
  traySelection.indices = new Set(filledIndices);
  renderNursery();
}
function trayCellClearSelection(){
  traySelection.trayId = null; traySelection.indices = new Set();
  renderNursery();
}

function renderNursery(){
  const list = document.getElementById('trayList');
  const emptyState = document.getElementById('trayEmptyState');
  list.innerHTML = '';
  if(state.trays.length===0){ emptyState.classList.remove('hidden'); return; }
  emptyState.classList.add('hidden');

  state.trays.forEach(t=>{
    const day = Math.max(1, dayOfCycle(t.startDate));
    const stage = stageForDay(day);
    const ready = day>=12;
    const est = nextTransitionInfo(day, stage);
    const cols = t.gridCols || Math.min(6, t.count) || 4;
    const selectedHere = traySelection.trayId===t.id ? traySelection.indices : new Set();

    // (2026-07-13) Upgrade seedling card & rockwool tray grid UI; prev: dark grid
    const card = document.createElement('div');
    card.className = 'bg-white rounded-2xl shadow-card border border-line p-5 flex flex-col hover:border-forest/20 transition-all';
    card.innerHTML = `
      <div class="flex items-center gap-3 mb-3">
        <div class="flex-shrink-0 bg-mint/40 p-2 rounded-xl border border-leaf/20">${plantIcon(stage.key,38)}</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <div class="font-display font-semibold text-[15px] text-ink truncate">${t.variety}</div>
            <!-- (2026-07-13) Add edit tray button in card header; prev: none -->
            <button data-tray-edit="${t.id}" class="flex-shrink-0 w-6 h-6 rounded-full bg-cream hover:bg-mint/40 flex items-center justify-center text-ink-soft hover:text-forest transition-colors">${icon('pencil','w-3 h-3',12)}</button>
          </div>
          <div class="text-[12px] text-ink-soft mt-0.5">${t.dimensions?`${t.dimensions} tray (${t.count} cells)`:`${t.count} seedlings`} · started ${fmtDate(t.startDate)}</div>
        </div>
      </div>
      <!-- (2026-07-13) Segmented milestone progress bar fixed; prev: dot clipped, labels cramped -->
      <div class="mb-3">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[12.5px] font-semibold text-forest">${stage.label}</span>
          <span class="text-[11px] font-bold text-white bg-forest px-2 py-0.5 rounded-full">Day ${day}</span>
        </div>
        <!-- Bar wrapper: overflow-visible so the dot marker can extend outside -->
        <div class="relative flex gap-px" style="height:12px;">
          ${[{d:3,color:'#86EFAC'},{d:6,color:'#4ADE80'},{d:2,color:'#22C55E'},{d:3,color:'#16A34A'}].map((seg,si)=>{
            const segStart = [0,3,9,11][si];
            const segEnd   = segStart + seg.d;
            const fill = Math.min(100, Math.max(0, ((Math.min(day, segEnd) - segStart) / seg.d) * 100));
            const radius = si===0 ? '4px 0 0 4px' : si===3 ? '0 4px 4px 0' : '0';
            // (2026-07-13) Visible slate gray for unfilled nursery segments; prev: light gray
            return `<div class="relative overflow-hidden bg-[#CBD5E1]" style="flex:${seg.d};border-radius:${radius};background-color:#CBD5E1 !important;">
              <div style="height:100%;width:${fill}%;background:${seg.color};border-radius:${radius};transition:width .4s;"></div>
            </div>`;
          }).join('')}
          <!-- day marker dot — sibling to segments, not clipped -->
          <div style="position:absolute;top:50%;transform:translate(-50%,-50%);left:${Math.min(97, Math.round(Math.min(day,14)/14*100))}%;width:11px;height:11px;border-radius:50%;background:#fff;border:2.5px solid #2F9E5B;box-shadow:0 1px 4px rgba(0,0,0,.18);pointer-events:none;"></div>
        </div>
        <!-- Stage tick labels with dividers -->
        <div class="flex mt-1.5 select-none" style="font-size:9px;font-weight:600;color:#94a3b8;letter-spacing:.01em;">
          <div style="flex:3;">Germ.</div>
          <div style="flex:6;text-align:center;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">Cotyledon</div>
          <div style="flex:2;text-align:center;border-right:1px solid #e2e8f0;">Thin</div>
          <div style="flex:3;text-align:right;">Transplant</div>
        </div>
      </div>
      <div class="text-[11.5px] text-ink-soft mb-3 flex items-center gap-1.5 font-medium">${icon('timer','w-3.5 h-3.5 flex-shrink-0 text-forest',14)} ${ready? 'Ready now' : `${est.label} in ${est.daysUntil}d (${fmtDate(est.date)})`}</div>

      <!-- (2026-07-13) Apply dark nursery tray bed & green cell selection classes; prev: Tailwind inline hex -->
      <div class="rounded-xl p-3 mb-3 nursery-tray-bed">
        <div class="grid gap-1 sm:gap-1.5 touch-none" style="grid-template-columns:repeat(${cols},1fr)" data-tray-grid="${t.id}"></div>
      </div>

      <div class="flex items-center justify-between mb-3">
        <button data-tray-select-all="${t.id}" class="text-[12px] font-semibold text-forest hover:text-forest/80 transition-colors">Select all ${t.count}</button>
        ${selectedHere.size>0 ? `<span class="text-[12px] font-semibold text-forest bg-mint/60 px-2 py-0.5 rounded-md">${selectedHere.size} selected</span>` : ''}
      </div>
      <!-- (2026-07-13) Add single cell edit button & health styling; prev: bulk action -->
      <div class="flex gap-2 mt-auto">
        ${selectedHere.size>0
          ? `${selectedHere.size===1 ? `<button data-tray-edit-cell="${t.id}" data-cell-idx="${Array.from(selectedHere)[0]}" class="text-[12.5px] font-semibold text-forest bg-mint hover:bg-mint/80 rounded-xl py-2.5 px-3 transition-colors flex items-center justify-center gap-1">${icon('pencil','w-3.5 h-3.5',14)} Edit</button>` : ''}
             <button data-tray-move="${t.id}" class="flex-1 text-[12.5px] font-semibold text-white bg-forest hover:bg-forest/90 rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition-colors shadow-xs">${icon('move-up-right','w-3.5 h-3.5',14)} Move ${selectedHere.size} to Tower</button>
             <button data-tray-clear-sel="${t.id}" class="text-[12.5px] font-medium text-ink-soft bg-cream hover:bg-cream-dark rounded-xl py-2.5 px-3 transition-colors">${icon('x','w-3.5 h-3.5',14)}</button>`
          : ready
            ? `<button data-tray-transplant="${t.id}" class="flex-1 text-[12.5px] font-semibold text-white bg-forest hover:bg-forest/90 rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition-colors shadow-xs">${icon('move-up-right','w-3.5 h-3.5',14)} Move All to Tower</button>`
            : `<span class="flex-1 text-center text-[12px] font-medium text-ink-soft bg-cream/70 border border-line/60 rounded-xl py-2.5">Ready on ${fmtDate(addDays(t.startDate,12))}</span>`}
        <button data-tray-remove="${t.id}" class="text-[12.5px] font-medium text-clay bg-[#FCEBD8] hover:bg-[#F8DEC0] rounded-xl py-2.5 px-3 transition-colors">${icon('trash-2','w-3.5 h-3.5',14)}</button>
      </div>`;
    list.appendChild(card);

    const cells = getTrayCells(t);
    const gridEl = card.querySelector(`[data-tray-grid="${t.id}"]`);
    cells.forEach((cellData, i)=>{
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.dataset.cellIdx = String(i);
      cell.dataset.trayId = t.id;
      const isSelected = selectedHere.has(i);
      const isFilled = cellData.filled;
      const cellHealth = cellData.health || 'healthy';
      const healthBorder = cellHealth === 'unhealthy' ? 'ring-2 ring-[#F59E0B] bg-[#FEF3C7]/40' : cellHealth === 'dead' ? 'ring-2 ring-[#EF4444] bg-[#FEE2E2]/40 opacity-75' : '';
      const healthBadge = cellHealth === 'unhealthy' ? `<span class="absolute -top-1 -right-1">${icon('alert-triangle','w-3 h-3 text-[#D97706]',12)}</span>` : cellHealth === 'dead' ? `<span class="absolute -top-1 -right-1">${icon('x-circle','w-3 h-3 text-[#DC2626]',12)}</span>` : '';

      // (2026-07-13) Add health class so CSS can override selected green; prev: no health class on el
      const healthClass = isFilled && cellHealth !== 'healthy' ? `health-${cellHealth}` : '';
      cell.className = `aspect-square rounded-md flex items-center justify-center cursor-pointer touch-none nursery-cell-cube relative transition-all ${healthClass} ${isFilled ? (isSelected ? 'selected ' : '') + healthBorder : 'opacity-40 border border-dashed border-line/60 bg-black/10 hover:opacity-80 hover:border-forest/60 hover:bg-mint/20'}`;
      cell.setAttribute('aria-label', `Cell ${i+1} [${cellData.id}], ${t.variety}${isFilled ? (isSelected ? ', selected' : '') : ', empty (tap to plant)'}`);
      cell.setAttribute('aria-pressed', String(isSelected));
      cell.innerHTML = isFilled ? `${plantIcon(stage.key, 22)}${healthBadge}` : `<span class="text-[9px] font-mono text-ink-soft/60">${cellData.id}</span>`;
      
      if(isFilled){
        cell.addEventListener('pointerdown', (e)=>{
          tlp.activeTrayId = t.id;
          tlp.startX = e.clientX; tlp.startY = e.clientY;
          tlp.fired = false; tlp.dragging = false;
          tlp.timer = setTimeout(()=>{
            tlp.fired = true; tlp.dragging = true;
            trayCellSelect(t.id, i);
            try{ cell.setPointerCapture(e.pointerId); }catch(err){}
            if(navigator.vibrate) navigator.vibrate(12);
          }, 220);
        });
        cell.addEventListener('pointermove', (e)=>{
          if(tlp.timer && !tlp.fired){
            if(Math.hypot(e.clientX - tlp.startX, e.clientY - tlp.startY) > 8){
              clearTimeout(tlp.timer); tlp.timer = null;
            }
          }
          if(tlp.dragging){
            const under = document.elementFromPoint(e.clientX, e.clientY);
            const targetCell = under && under.closest && under.closest('[data-cell-idx]');
            if(targetCell){
              const tId = targetCell.dataset.trayId;
              const cIdx = Number(targetCell.dataset.cellIdx);
              if(tId === t.id && !isNaN(cIdx)){
                trayCellSelect(tId, cIdx);
              }
            }
          }
        });
        cell.addEventListener('pointerup', (e)=>{
          if(tlp.timer){ clearTimeout(tlp.timer); tlp.timer = null; }
          if(tlp.dragging){
            tlp.dragging = false;
            try{ cell.releasePointerCapture(e.pointerId); }catch(err){}
          }
        });
        cell.addEventListener('pointercancel', ()=>{
          if(tlp.timer){ clearTimeout(tlp.timer); tlp.timer = null; }
          tlp.dragging = false;
        });
        cell.addEventListener('click', ()=>{
          if(tlp.dragging || tlp.fired){
            tlp.fired = false;
            return;
          }
          trayCellToggle(t.id, i);
        });
      } else {
        // (2026-07-13) Allow tapping empty cells to plant/refill seeds; prev: disabled
        cell.addEventListener('click', ()=>{
          const snapshotTrays = JSON.parse(JSON.stringify(state.trays));
          cellData.filled = true;
          t.count = cells.filter(c=>c.filled).length;
          persist('trays');
          renderNursery();
          triggerUndoSnackbar(`Planted ${t.variety} in cell [${cellData.id}]`, ()=>{
            state.trays = snapshotTrays;
            persist('trays');
            renderNursery();
          });
        });
      }
      gridEl.appendChild(cell);
    });
  });

  list.querySelectorAll('[data-tray-transplant]').forEach(btn=>btn.addEventListener('click', ()=>openTransplantModal(btn.dataset.trayTransplant, null)));
  list.querySelectorAll('[data-tray-move]').forEach(btn=>btn.addEventListener('click', ()=>openTransplantModal(btn.dataset.trayMove, traySelection.indices.size)));
  list.querySelectorAll('[data-tray-select-all]').forEach(btn=>btn.addEventListener('click', ()=>{
    const tray = state.trays.find(x=>x.id===btn.dataset.traySelectAll);
    if(tray) trayCellSelectAll(tray);
  }));
  list.querySelectorAll('[data-tray-clear-sel]').forEach(btn=>btn.addEventListener('click', trayCellClearSelection));
  list.querySelectorAll('[data-tray-remove]').forEach(btn=>btn.addEventListener('click', ()=>{
    if(traySelection.trayId===btn.dataset.trayRemove) trayCellClearSelection();
    const snapshotTrays = JSON.parse(JSON.stringify(state.trays));
    const trayToRemove = state.trays.find(t=>t.id===btn.dataset.trayRemove);
    const trayName = trayToRemove ? trayToRemove.variety : 'Tray';
    state.trays=state.trays.filter(t=>t.id!==btn.dataset.trayRemove);
    persist('trays'); renderNursery();
    triggerUndoSnackbar(`Deleted "${trayName}" tray`, ()=>{
      state.trays = snapshotTrays;
      persist('trays'); renderNursery();
    });
  }));
  // (2026-07-13) Wire edit tray button & cell edit button; prev: edit tray only
  list.querySelectorAll('[data-tray-edit]').forEach(btn=>btn.addEventListener('click', ()=>openEditTrayModal(btn.dataset.trayEdit)));
  list.querySelectorAll('[data-tray-edit-cell]').forEach(btn=>btn.addEventListener('click', ()=>openTrayCellModal(btn.dataset.trayEditCell, Number(btn.dataset.cellIdx))));
}

// (2026-07-13) Modal logic to edit health status of specific tray seedling cell; prev: none
function openTrayCellModal(trayId, cellIdx){
  const tray = state.trays.find(t=>t.id===trayId);
  if(!tray) return;
  const cells = getTrayCells(tray);
  const cell = cells[cellIdx];
  if(!cell) return;
  // (2026-07-13) Normalize cell.health so single-tap works; prev: || fallback in template
  if(!cell.health) cell.health = 'healthy';
  const health = cell.health;
  
  document.getElementById('trayCellModalTitle').textContent = `Tray "${tray.variety}" · Cell #${cellIdx+1} [${cell.id}]`;
  const body = document.getElementById('trayCellModalBody');
  body.innerHTML = `
    <div class="bg-cream rounded-xl p-3.5 mb-4">
      <div class="text-[13px] font-semibold text-ink mb-1">Seedling Cell Details</div>
      <div class="text-[12px] text-ink-soft">Variety: <strong>${tray.variety}</strong> · Status: ${cell.filled?'Planted':'Empty'}</div>
    </div>
    <!-- (2026-07-13) SVG icons & yellow/red theme for tray cell health; prev: emojis -->
    <label class="text-[12px] font-semibold text-ink-soft mb-2 block">Seedling Health / Condition</label>
    <div class="grid grid-cols-3 gap-2 mb-4">
    <!-- (2026-07-13) Remove bg-white from inactive state so active bg renders; prev: bg-white conflict -->
    <button id="btnCellHealthHealthy" class="py-2.5 px-1 text-[12.5px] rounded-xl border flex items-center justify-center gap-1.5 transition-all ${health==='healthy'?'bg-[#DCFCE7] border-[#22C55E] text-[#15803D] font-semibold shadow-sm':'border-line text-ink-soft'}">${icon('circle-check','w-4 h-4',16)} Healthy</button>
      <button id="btnCellHealthUnhealthy" class="py-2.5 px-1 text-[12.5px] rounded-xl border flex items-center justify-center gap-1.5 transition-all ${health==='unhealthy'?'bg-[#FEF3C7] border-[#F59E0B] text-[#92400E] font-semibold shadow-sm':'border-line text-ink-soft'}">${icon('alert-triangle','w-4 h-4',16)} Unhealthy</button>
      <button id="btnCellHealthDead" class="py-2.5 px-1 text-[12.5px] rounded-xl border flex items-center justify-center gap-1.5 transition-all ${health==='dead'?'bg-[#FEE2E2] border-[#EF4444] text-[#991B1B] font-semibold shadow-sm':'border-line text-ink-soft'}">${icon('x-circle','w-4 h-4',16)} Dead</button>
    </div>
    <!-- (2026-07-13) Add photo attachment preview to seedling cell modal; prev: none -->
    <div class="mb-4 bg-cream/40 p-3 rounded-xl border border-line/60">
      <label class="text-[12px] font-semibold text-ink-soft mb-1.5 flex items-center justify-between cursor-pointer">
        <span>📷 Seedling Photo</span>
        <span class="text-[11.5px] font-semibold text-forest underline">${cell.photo?'Change Photo':'Attach Photo'}</span>
        <input id="cellPhotoInput" type="file" accept="image/*" class="hidden">
      </label>
      ${cell.photo ? `<div class="relative mt-1 max-h-[120px] rounded-lg overflow-hidden border border-line bg-black/5 flex items-center justify-center">
        <img src="${cell.photo}" class="max-h-[120px] object-contain rounded-lg" alt="Seedling Photo">
        <button id="btnRemoveCellPhoto" class="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center text-[10px]">✕</button>
      </div>` : '<p class="text-[11px] text-ink-soft">Attach a photo for this seedling cell.</p>'}
    </div>
    <div class="flex flex-col gap-2">
      <button id="btnClearDeadCell" class="w-full text-[12.5px] font-medium text-clay bg-[#FCEBD8] hover:bg-[#F8DEC0] rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition-colors">${icon('trash-2','w-4 h-4',16)} Clear / Remove Dead Seedling</button>
    </div>`;

  const setHealth = (h)=>{
    cell.health = h;
    logActivityNotification('⚠️ Seedling Health Updated', `Tray ${tray.variety} Cell #${cellIdx+1} marked as ${h}`, 'alert-triangle');
    persist('trays');
    openTrayCellModal(trayId, cellIdx);
    renderNursery();
    showToast(`Cell #${cellIdx+1} marked as ${h}`,'forest','sprout');
  };
  document.getElementById('btnCellHealthHealthy')?.addEventListener('click', ()=>setHealth('healthy'));
  document.getElementById('btnCellHealthUnhealthy')?.addEventListener('click', ()=>setHealth('unhealthy'));
  document.getElementById('btnCellHealthDead')?.addEventListener('click', ()=>setHealth('dead'));

  document.getElementById('cellPhotoInput')?.addEventListener('change', (e)=>{
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      cell.photo = reader.result;
      persist('trays'); openTrayCellModal(trayId, cellIdx);
      showToast('Seedling photo attached','forest','camera');
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('btnRemoveCellPhoto')?.addEventListener('click', ()=>{
    delete cell.photo;
    persist('trays'); openTrayCellModal(trayId, cellIdx);
  });
  document.getElementById('btnClearDeadCell')?.addEventListener('click', ()=>{
    const snapshotTrays = JSON.parse(JSON.stringify(state.trays));
    cell.filled = false;
    cell.health = 'healthy';
    tray.count = cells.filter(c=>c.filled).length;
    persist('trays');
    closeModal('trayCellModal');
    renderNursery();
    triggerUndoSnackbar(`Removed seedling from cell [${cell.id}]`, ()=>{
      state.trays = snapshotTrays;
      persist('trays');
      renderNursery();
    });
  });
  document.getElementById('trayCellModal').classList.remove('hidden');
}
document.getElementById('trayCellModalClose')?.addEventListener('click', ()=>closeModal('trayCellModal'));

// (2026-07-13) Edit tray modal logic; prev: none
let editingTrayId = null;
function openEditTrayModal(trayId){
  const tray = state.trays.find(t=>t.id===trayId);
  if(!tray) return;
  editingTrayId = trayId;

  const varSel = document.getElementById('editTrayVariety');
  const customEl = document.getElementById('editTrayCustomName');
  varSel.innerHTML = CROP_PRESETS.map(c=>`<option value="${c.name}">${c.name}</option>`).join('') + `<option value="__custom__">Custom Variety…</option>`;

  const isPreset = CROP_PRESETS.some(c=>c.name===tray.variety);
  if(isPreset){
    varSel.value = tray.variety;
    customEl.classList.add('hidden'); customEl.value = '';
  } else {
    varSel.value = '__custom__';
    customEl.classList.remove('hidden'); customEl.value = tray.variety;
  }
  setupCustomSeedToggle('editTrayVariety','editTrayCustomName');

  document.getElementById('editTrayDate').value = tray.startDate || todayISO();
  const rows = tray.gridRows || Math.ceil(tray.count / (tray.gridCols||Math.min(6,tray.count)||4));
  const cols = tray.gridCols || Math.min(6, tray.count) || 4;
  document.getElementById('editTrayGridRows').value = rows;
  document.getElementById('editTrayGridCols').value = cols;
  document.getElementById('editTrayCalcCount').textContent = rows * cols;

  const rowsEl = document.getElementById('editTrayGridRows');
  const colsEl = document.getElementById('editTrayGridCols');
  if(!rowsEl.dataset.wired){
    rowsEl.dataset.wired='1';
    const upd=()=>document.getElementById('editTrayCalcCount').textContent=Math.max(1,Number(rowsEl.value)||1)*Math.max(1,Number(colsEl.value)||1);
    rowsEl.addEventListener('input',upd); colsEl.addEventListener('input',upd);
  }

  document.getElementById('editTrayModal').classList.remove('hidden');
}

document.getElementById('editTrayModalClose')?.addEventListener('click',()=>closeModal('editTrayModal'));
document.getElementById('editTrayForm')?.addEventListener('submit',(e)=>{
  e.preventDefault();
  const tray = state.trays.find(t=>t.id===editingTrayId);
  if(!tray) return;
  const customName = document.getElementById('editTrayCustomName')?.value.trim();
  const presetVariety = document.getElementById('editTrayVariety')?.value;
  tray.variety = customName || (presetVariety==='__custom__' ? tray.variety : presetVariety) || tray.variety;
  tray.startDate = document.getElementById('editTrayDate').value || tray.startDate;
  const r = Math.max(1, Number(document.getElementById('editTrayGridRows')?.value)||1);
  const c = Math.max(1, Number(document.getElementById('editTrayGridCols')?.value)||1);
  tray.count = r * c; tray.gridRows = r; tray.gridCols = c; tray.dimensions = `${r}×${c}`;
  persist('trays'); closeModal('editTrayModal'); renderNursery();
  showToast(`Tray updated`,'forest','pencil');
});
// (2026-07-13) Call setupCustomSeedToggle in btnAddTray listener; prev: none
document.getElementById('btnAddTray').addEventListener('click', ()=>{
  document.getElementById('trayVariety').innerHTML = CROP_PRESETS.map(c=>`<option value="${c.name}">${c.name}</option>`).join('');
  const customName = document.getElementById('trayCustomName');
  if(customName) customName.value = '';
  setupCustomSeedToggle('trayVariety', 'trayCustomName');
  document.getElementById('trayDate').value = todayISO();
  const rowsEl = document.getElementById('trayGridRows');
  const colsEl = document.getElementById('trayGridCols');
  const updateCalc = ()=>{
    const r = Math.max(1, Number(rowsEl?.value)||1);
    const c = Math.max(1, Number(colsEl?.value)||1);
    const tot = r * c;
    const calcEl = document.getElementById('trayCalcCount');
    const cntEl = document.getElementById('trayCount');
    if(calcEl) calcEl.textContent = tot;
    if(cntEl) cntEl.value = tot;
  };
  if(rowsEl && colsEl && !rowsEl.dataset.wired){
    rowsEl.dataset.wired = '1';
    rowsEl.addEventListener('input', updateCalc);
    colsEl.addEventListener('input', updateCalc);
  }
  updateCalc();
  document.getElementById('trayModal').classList.remove('hidden');
});
document.getElementById('trayForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const customName = document.getElementById('trayCustomName')?.value.trim();
  const presetVariety = document.getElementById('trayVariety')?.value;
  const variety = customName || presetVariety || 'Custom Crop';
  const r = Math.max(1, Number(document.getElementById('trayGridRows')?.value)||1);
  const c = Math.max(1, Number(document.getElementById('trayGridCols')?.value)||1);
  const count = r * c;
  const dimensions = `${r}×${c}`;
  state.trays.push({ id: uid(), variety, startDate: document.getElementById('trayDate').value || todayISO(), count, gridRows:r, gridCols:c, dimensions });
  persist('trays'); closeModal('trayModal'); renderNursery();
  maybeTriggerFirstPlantFlow();
  showToast(`New ${dimensions} tray started (${variety})`,'forest','sprout');
});

let activeTrayId = null;
let activeMoveLimit = null; // null = move everything picked; a number = exact count expected from tray selection
// (2026-07-13) Render interactive 2D tower SVG drawings in transplant modal; prev: plain button grid
function openTransplantModal(trayId, limitCount){
  activeTrayId = trayId;
  activeMoveLimit = limitCount || null;

  const towerSel = document.getElementById('transplantTowerSelect');
  towerSel.innerHTML = state.towers.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
  towerSel.value = state.activeTowerId;

  document.getElementById('transplantModalTitle').textContent = activeMoveLimit ? `Move ${activeMoveLimit} Seedlings` : 'Move Tray to Tower';
  document.getElementById('transplantHint').textContent = activeMoveLimit
    ? `Pick exactly ${activeMoveLimit} empty pocket(s) in the destination tower drawing.`
    : `Tap empty pockets on the destination tower drawing — as many as you want to fill now.`;

  const populateGrid = ()=>{
    const diagramContainer = document.getElementById('transplantDiagramContainer');
    if(!diagramContainer) return;
    const towerId = towerSel.value;
    const targetTower = state.towers.find(t=>t.id===towerId);
    const towerRows = state.rows.filter(r=>(r.towerId||'t1')===towerId);

    // (2026-07-13) Wrap vertical tower in 200px scrollable viewport wrapper; prev: 220px unconstrained
    const isHorizontal = targetTower && targetTower.type==='horizontal';
    diagramContainer.style.width = '100%';
    if(isHorizontal){
      diagramContainer.innerHTML = buildHorizontalTowerSVG(null, towerRows);
    } else {
      const svgHtml = buildTowerSVG(null, towerRows);
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'width:200px;margin:0 auto;';
      wrapper.innerHTML = svgHtml;
      const svgEl = wrapper.querySelector('svg');
      if(svgEl){
        const vb = svgEl.getAttribute('viewBox')?.split(' ');
        if(vb && vb.length===4){ const natH = Math.round((200/Number(vb[2]))*Number(vb[3])); svgEl.style.height=`${natH}px`; svgEl.style.width='200px'; }
        svgEl.removeAttribute('class');
      }
      diagramContainer.innerHTML = '';
      diagramContainer.appendChild(wrapper);
    }

    const towerRowIds = new Set(towerRows.map(r=>r.id));
    const emptyPockets = new Set(state.pockets.filter(p=>!p.variety && towerRowIds.has(p.rowId)).map(p=>p.id));

    // (2026-07-13) Hold & drag multi-pocket selection via Pointer Events; prev: click-only
    let isDraggingPockets = false;
    let dragTargetState = true;
    const visitedPockets = new Set();

    const applyPocketSelectionUI = (g, nextState) => {
      g.setAttribute('data-transplant-selected', nextState ? 'true' : 'false');
      const innerCircle = g.querySelector('circle:not(.pocket-select-ring)');
      if(innerCircle){
        innerCircle.setAttribute('fill', nextState ? '#2F9E5B' : '#FFFFFF');
        innerCircle.setAttribute('stroke', nextState ? '#1E7A43' : '#E3E9E3');
      }
      const ring = g.querySelector('.pocket-select-ring');
      if(ring){
        ring.setAttribute('opacity', nextState ? '1' : '0');
        ring.setAttribute('stroke', '#1E7A43');
      }
    };

    diagramContainer.querySelectorAll('[data-pocket-id]').forEach(g=>{
      const pid = Number(g.dataset.pocketId);
      const isEmpty = emptyPockets.has(pid);

      if(!isEmpty){
        g.style.opacity = '0.35';
        g.style.cursor = 'not-allowed';
      } else {
        g.style.cursor = 'pointer';
      }

      g.addEventListener('pointerdown', (e)=>{
        if(!isEmpty){
          showToast('This pocket is already occupied', 'clay', 'alert-triangle');
          return;
        }
        isDraggingPockets = true;
        visitedPockets.clear();
        visitedPockets.add(pid);

        const isCurrentlySelected = g.getAttribute('data-transplant-selected') === 'true';
        dragTargetState = !isCurrentlySelected;

        if(dragTargetState && activeMoveLimit){
          const currentSelected = diagramContainer.querySelectorAll('[data-transplant-selected="true"]').length;
          if(currentSelected >= activeMoveLimit){
            showToast(`You only selected ${activeMoveLimit} seedling(s) to move`, 'clay', 'alert-triangle');
            isDraggingPockets = false;
            return;
          }
        }
        applyPocketSelectionUI(g, dragTargetState);
        try { g.setPointerCapture(e.pointerId); } catch(err){}
      });

      g.addEventListener('pointermove', (e)=>{
        if(!isDraggingPockets) return;
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const pocketG = under && under.closest ? under.closest('[data-pocket-id]') : null;
        if(pocketG){
          const targetPid = Number(pocketG.dataset.pocketId);
          if(emptyPockets.has(targetPid) && !visitedPockets.has(targetPid)){
            visitedPockets.add(targetPid);
            if(dragTargetState && activeMoveLimit){
              const currentSelected = diagramContainer.querySelectorAll('[data-transplant-selected="true"]').length;
              if(currentSelected >= activeMoveLimit){
                showToast(`Reached limit of ${activeMoveLimit} seedling(s)`, 'clay', 'alert-triangle');
                isDraggingPockets = false;
                return;
              }
            }
            applyPocketSelectionUI(pocketG, dragTargetState);
          }
        }
      });

      g.addEventListener('pointerup', (e)=>{
        if(isDraggingPockets){
          isDraggingPockets = false;
          try { g.releasePointerCapture(e.pointerId); } catch(err){}
        }
      });

      g.addEventListener('pointercancel', ()=>{
        isDraggingPockets = false;
      });
    });
  };
  towerSel.onchange = populateGrid;
  populateGrid();
  document.getElementById('transplantModal').classList.remove('hidden');
}
document.getElementById('btnConfirmTransplant').addEventListener('click', ()=>{
  const diagramContainer = document.getElementById('transplantDiagramContainer');
  const selected = diagramContainer ? [...diagramContainer.querySelectorAll('[data-transplant-selected="true"]')].map(g=>Number(g.dataset.pocketId)) : [];
  if(selected.length===0){ showToast('Pick at least one empty pocket on the tower','clay','alert-triangle'); return; }
  if(activeMoveLimit && selected.length!==activeMoveLimit){ showToast(`Pick exactly ${activeMoveLimit} pocket(s)`,'clay','alert-triangle'); return; }
  const tray = state.trays.find(t=>t.id===activeTrayId);
  const cells = getTrayCells(tray);

  // Targeted cell removal from tray
  if(traySelection.trayId === tray.id && traySelection.indices.size > 0){
    traySelection.indices.forEach(idx => {
      if(cells[idx]) cells[idx].filled = false;
    });
  } else {
    let needed = selected.length;
    for(let i = cells.length - 1; i >= 0 && needed > 0; i--){
      if(cells[i].filled){
        cells[i].filled = false;
        needed--;
      }
    }
  }

  selected.forEach(pid=>{ const p=state.pockets.find(x=>x.id===pid); p.variety=tray.variety; p.datePlanted=tray.startDate; p.override=null; });
  tray.count = cells.filter(c=>c.filled).length;
  if(tray.count<=0) state.trays = state.trays.filter(t=>t.id!==tray.id);
  trayCellClearSelection();
  persist('pockets'); persist('trays');
  closeModal('transplantModal'); renderNursery();
  maybeTriggerFirstPlantFlow();
  const towerName = state.towers.find(t=>t.id===document.getElementById('transplantTowerSelect').value)?.name || 'the tower';
  showToast(`Moved ${selected.length} seedling(s) to ${towerName}`,'forest','move-up-right');
});
const pickStyle = document.createElement('style');
pickStyle.textContent = `.pocket-pick.selected{ border-color:#2F9E5B; background:#DCF5E3; }`;
document.head.appendChild(pickStyle);

function renderReminders(){
  document.querySelectorAll('.switch[data-toggle]').forEach(sw=>{
    const on = !!state.settings[sw.dataset.toggle];
    sw.classList.toggle('on', on);
    sw.setAttribute('aria-checked', String(on));
  });
  document.querySelectorAll('.reminder-time').forEach(inp=>{
    const key = inp.dataset.timeKey;
    inp.value = state.settings[key] || inp.value;
    if(!inp.dataset.wired){
      inp.dataset.wired = '1';
      inp.addEventListener('change', ()=>{
        state.settings[key] = inp.value || '07:00';
        persist('settings');
        renderDashboard(); // task list times depend on this
        showToast(`${formatTimeLabel(inp.value)} saved`,'forest','clock');
      });
    }
  });
  const locInput = document.getElementById('locationInput');
  if(locInput) locInput.value = state.settings.location || 'Bogo City';
  renderAlertLog();
  renderAlertBanner('alertBanner2');
  if(typeof weatherService!=='undefined'){
    const initialData = weatherService.lastWeather || (weatherService.getDefaultWeatherData ? weatherService.getDefaultWeatherData() : null);
    if(initialData) renderGoogleWeatherWidget(initialData, state.settings.location || 'Bogo City');
    if(state.settings.coordinates){
      weatherService.getWeather(state.settings.coordinates.lat, state.settings.coordinates.lng).then(w=>{
        renderGoogleWeatherWidget(w, state.settings.location || 'Bogo City');
      }).catch(()=>{});
    }
  }
}
document.getElementById('btnUnitC')?.addEventListener('click', ()=>{ currentTempUnit='C'; renderReminders(); });
document.getElementById('btnUnitF')?.addEventListener('click', ()=>{ currentTempUnit='F'; renderReminders(); });
async function activateSwitch(sw){
  const key = sw.dataset.toggle; state.settings[key]=!state.settings[key]; persist('settings');
  sw.classList.toggle('on', state.settings[key]);
  sw.setAttribute('aria-checked', String(state.settings[key]));
  if(state.settings[key] && !state.settings.coordinates && typeof weatherService!=='undefined'){
    try {
      const loc = await weatherService.detectLocation();
      state.settings.location = loc.formatted;
      state.settings.coordinates = loc.coordinates;
      persist('settings');
      document.getElementById('locationInput').value = loc.formatted;
      weatherService.startMonitoring();
    } catch(e){}
  }
}
document.querySelectorAll('.switch[data-toggle]').forEach(sw=>{
  sw.addEventListener('click', ()=>activateSwitch(sw));
  sw.addEventListener('keydown', (e)=>{
    if(e.key==='Enter' || e.key===' '){ e.preventDefault(); activateSwitch(sw); }
  });
});

/* Accessibility toggles (larger text / high contrast / reduce motion) —
   applied as body classes so app.css can style everything at once, and
   persisted so they carry over between sessions. */
const A11Y_CLASS = { a11yLargeText:'a11y-large-text', a11yHighContrast:'a11y-high-contrast', a11yReduceMotion:'a11y-reduce-motion' };
function applyA11ySwitch(sw){
  const key = sw.dataset.a11yToggle;
  const cls = A11Y_CLASS[key];
  if(!cls) return;
  const on = !document.body.classList.contains(cls);
  document.body.classList.toggle(cls, on);
  sw.classList.toggle('on', on);
  sw.setAttribute('aria-checked', String(on));
  state.settings[key] = on;
  persist('settings');
}
function initA11ySwitches(){
  document.querySelectorAll('.switch[data-a11y-toggle]').forEach(sw=>{
    const key = sw.dataset.a11yToggle;
    const on = !!state.settings[key];
    document.body.classList.toggle(A11Y_CLASS[key], on);
    sw.classList.toggle('on', on);
    sw.setAttribute('aria-checked', String(on));
    if(sw.dataset.wired) return;
    sw.dataset.wired = '1';
    sw.addEventListener('click', ()=>applyA11ySwitch(sw));
    sw.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); applyA11ySwitch(sw); } });
  });
}
initA11ySwitches();
document.getElementById('btnAutoDetectLocation')?.addEventListener('click', async ()=>{
  if(typeof weatherService==='undefined') return;
  try {
    const loc = await weatherService.detectLocation();
    state.settings.location = loc.formatted;
    state.settings.coordinates = loc.coordinates;
    persist('settings');
    document.getElementById('locationInput').value = loc.formatted;
    showToast(`Location detected: ${loc.formatted}`,'forest','map-pin');
    weatherService.startMonitoring();
  } catch(err){
    showToast(err.message||'Could not detect location','clay','alert-triangle');
  }
});
document.getElementById('locationInput')?.addEventListener('change', async (e)=>{
  const val = e.target.value.trim();
  state.settings.location = val;
  persist('settings');
  if(val && typeof weatherService!=='undefined'){
    const loc = await weatherService.searchLocation(val);
    if(loc){
      state.settings.coordinates = loc.coordinates;
      state.settings.location = loc.formatted;
      persist('settings');
      e.target.value = loc.formatted;
      showToast(`Weather location set: ${loc.formatted}`,'forest','map-pin');
      weatherService.startMonitoring();
    }
  }
});

let currentAlert = null;
function renderAlertBanner(targetId){
  const el = document.getElementById(targetId); if(!el) return;
  if(!currentAlert){ el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const tone = currentAlert.type==='rain' ? 'bg-[#EAF3FF] text-[#2563A6] border-[#BEDBFF]' : 'bg-[#FCEBD8] text-clay border-[#F3CDA8]';
  el.innerHTML = `<div class="${tone} border rounded-xl px-4 py-3 flex items-start gap-2.5">
    <span class="text-lg">${currentAlert.type==='rain'?'🌧️':'💨'}</span>
    <div class="flex-1 text-[12.5px] leading-snug"><span class="font-semibold">${currentAlert.title}</span><br>${currentAlert.msg}</div>
    <button data-dismiss-alert class="text-[11px] font-semibold underline flex-shrink-0">Dismiss</button>
  </div>`;
  el.querySelector('[data-dismiss-alert]').addEventListener('click', ()=>{ currentAlert=null; renderAlertBanner('alertBanner'); renderAlertBanner('alertBanner2'); });
}
function renderAlertLog(){
  const el = document.getElementById('alertLog'); if(!el) return;
  el.innerHTML = '';
  if(state.alertLog.length===0){ el.innerHTML = `<div class="text-ink-soft/70">No alerts simulated yet.</div>`; return; }
  state.alertLog.slice(-5).reverse().forEach(a=>{
    const row = document.createElement('div'); row.className='flex items-center gap-2';
    row.innerHTML = `<span>${a.type==='rain'?'🌧️':'💨'}</span><span class="flex-1 truncate">${a.title}</span><span class="font-mono text-[10.5px]">${a.time}</span>`;
    el.appendChild(row);
  });
}
document.querySelectorAll('.weather-sim-btn').forEach(btn=>btn.addEventListener('click', ()=>{
  const type = btn.dataset.type; const loc = state.settings.location || 'your area';
  const alert = type==='rain'
    ? { type, title:`Heavy Rain Warning — ${loc}`, msg:`Protect your seedling trays under a roof so heavy drops don't crush or drown your sprouts.` }
    : { type, title:`High Wind / Typhoon Alert — ${loc}`, msg:`Check your reservoir water level and support frame — keep the base heavy so the tower doesn't tip over.` };
  currentAlert = alert;
  state.alertLog.push({ ...alert, time: new Date().toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}) });
  persist('alertLog');
  renderAlertBanner('alertBanner'); renderAlertBanner('alertBanner2'); renderAlertLog();
  showToast(alert.title, type==='rain'?'forest':'clay', type==='rain'?'cloud-rain':'wind');
}));
async function requestBrowserNotifs(){
  if(!('Notification' in window)){ showToast('Notifications are not supported in this browser','clay','alert-triangle'); return; }
  const perm = await Notification.requestPermission();
  if(perm==='granted'){ state.settings.browserNotifs=true; persist('settings'); showToast('Browser notifications enabled — keep this tab open','forest','bell'); document.getElementById('firstPlantPrompt')?.classList.add('hidden'); }
  else showToast('Notification permission was not granted','clay','bell-off');
}
// (2026-07-13) Guard btnEnableNotifs; element removed from HTML; prev: hard crash
document.getElementById('btnEnableNotifs')?.addEventListener('click', requestBrowserNotifs);
document.getElementById('btnEnableNotifsPrompt')?.addEventListener('click', requestBrowserNotifs);
document.getElementById('btnDismissFirstPlant')?.addEventListener('click', ()=>document.getElementById('firstPlantPrompt').classList.add('hidden'));

setInterval(()=>{
  if(!state.settings.browserNotifs || !('Notification' in window) || Notification.permission!=='granted') return;
  const now = new Date();
  const nowHM = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const seen = store.get('ht_notified', {});
  const fire = (key, timeStr, text)=>{
    const slot = `${todayISO()}_${key}_${timeStr}`;
    if(nowHM===timeStr && !seen[slot]){ new Notification('HydroTrack', { body:text }); seen[slot]=true; store.set('ht_notified', seen); }
  };
  if(state.settings.sunReminder) fire('sun', state.settings.sunTime||'07:00','Time to put your seedling tray into direct morning sun');
  if(state.settings.heatReminder) fire('heat', state.settings.heatTime||'11:00','Scorching sun — move seedlings to partial shade');
  if(state.settings.nightReminder) fire('night', state.settings.nightTime||'18:00','Lights off — plants need complete darkness');
}, 20000);

/* ================= EXPENSES / ROI ================= */
function renderExpenses(){
  const totalSpent = state.expenses.reduce((s,e)=>s+Number(e.amount||0),0);
  const totalGrams = state.harvests.reduce((s,h)=>s+Number(h.grams||0),0);
  const savings = (totalGrams/1000)*500;
  const roi = totalSpent>0 ? Math.min(999, savings/totalSpent*100) : 0;

  document.getElementById('expTotalSpent').textContent = fmtPeso(totalSpent);
  document.getElementById('expTotalGrams').textContent = totalGrams;
  document.getElementById('expSavings').textContent = fmtPeso(savings);
  document.getElementById('roiPctLabel').textContent = roi.toFixed(1)+'%';
  document.getElementById('roiBar').style.width = Math.min(100,roi)+'%';

  const expList = document.getElementById('expenseList');
  expList.innerHTML = '';
  state.expenses.slice().reverse().forEach(e=>{
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between py-2.5';
    row.innerHTML = `<div class="min-w-0"><div class="text-[13px] font-medium text-ink truncate">${e.name}</div><div class="text-[11px] text-ink-soft">${e.category}</div></div>
      <div class="flex items-center gap-2 flex-shrink-0"><span class="font-mono text-[13px] font-semibold">₱${fmtPeso(e.amount)}</span><button data-del-expense="${e.id}" class="text-ink-soft/60 hover:text-clay">${icon('x','w-3.5 h-3.5',14)}</button></div>`;
    expList.appendChild(row);
  });
  expList.querySelectorAll('[data-del-expense]').forEach(btn=>btn.addEventListener('click', ()=>{ state.expenses=state.expenses.filter(e=>e.id!==btn.dataset.delExpense); persist('expenses'); renderExpenses(); }));

  const harvestList = document.getElementById('harvestList');
  const harvestEmpty = document.getElementById('harvestEmptyState');
  harvestList.innerHTML = '';
  if(state.harvests.length===0){ harvestEmpty.classList.remove('hidden'); }
  else {
    harvestEmpty.classList.add('hidden');
    state.harvests.slice().reverse().forEach(h=>{
      const row = document.createElement('div'); row.className='flex items-center justify-between py-2.5';
      row.innerHTML = `<div class="min-w-0"><div class="text-[13px] font-medium text-ink truncate">${h.variety||'Unspecified'}</div><div class="text-[11px] text-ink-soft">${fmtDate(h.date)}${h.pocketId?` · Pocket #${h.pocketId}`:''}</div></div><span class="font-mono text-[13px] font-semibold text-gold flex-shrink-0">${h.grams}g</span>`;
      harvestList.appendChild(row);
    });
  }
  // (2026-07-13) Harvest photo upload & harvest gallery render; prev: no photos
  renderHarvestGallery();
}

let pendingHarvestPhoto = null;
document.getElementById('harvestPhotoInput')?.addEventListener('change', (e)=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    pendingHarvestPhoto = reader.result;
    const imgEl = document.getElementById('harvestPhotoImg');
    const prevEl = document.getElementById('harvestPhotoPreview');
    if(imgEl) imgEl.src = reader.result;
    if(prevEl) prevEl.classList.remove('hidden');
    showToast('Harvest photo attached', 'forest', 'camera');
  };
  reader.readAsDataURL(file);
});
document.getElementById('btnRemoveHarvestPhoto')?.addEventListener('click', ()=>{
  pendingHarvestPhoto = null;
  document.getElementById('harvestPhotoPreview')?.classList.add('hidden');
  const inp = document.getElementById('harvestPhotoInput');
  if(inp) inp.value = '';
});

function resetHarvestPhotoForm(){
  pendingHarvestPhoto = null;
  document.getElementById('harvestPhotoPreview')?.classList.add('hidden');
  const inp = document.getElementById('harvestPhotoInput');
  if(inp) inp.value = '';
}

function renderHarvestGallery(){
  const grid = document.getElementById('harvestGalleryGrid');
  const empty = document.getElementById('harvestGalleryEmpty');
  const countEl = document.getElementById('harvestPhotoCount');
  if(!grid) return;

  const photos = state.harvests.filter(h=>h.photo);
  if(countEl) countEl.textContent = `${photos.length} photo${photos.length!==1?'s':''}`;

  if(photos.length === 0){
    grid.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  // (2026-07-13) Soft gradient & z-20 pure white text overlay; prev: dark covered
  grid.innerHTML = photos.slice().reverse().map(h=>`
    <div class="photo-log-card group relative cursor-pointer rounded-2xl overflow-hidden bg-black shadow-sm border border-line/20" data-harvest-photo-id="${h.id}">
      <img src="${h.photo}" style="width:100% !important; height:100% !important; object-fit:cover !important;" class="w-full aspect-square block group-hover:scale-105 transition-transform duration-300" alt="${h.variety} harvest" loading="lazy">
      <div style="position:absolute !important; bottom:0 !important; left:0 !important; right:0 !important; width:100% !important; height:50% !important; background:linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0) 100%) !important; pointer-events:none !important; z-index:5 !important;"></div>
      <div class="absolute bottom-0 left-0 right-0 p-2 text-white" style="z-index:20 !important;">
        <div class="text-[11px] font-bold leading-tight truncate" style="color:#FFFFFF !important; text-shadow:0 1px 3px rgba(0,0,0,0.9);">${h.variety}</div>
        <div class="flex items-center justify-between mt-0.5">
          <span class="text-[9.5px]" style="color:#FFFFFF !important; opacity:0.9; text-shadow:0 1px 2px rgba(0,0,0,0.9);">${formatLogDate(h.date)}</span>
          <span class="text-[9.5px] font-mono font-bold text-gold bg-black/40 px-1.5 py-0.5 rounded-full">${h.grams}g</span>
        </div>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('[data-harvest-photo-id]').forEach(card=>{
    card.addEventListener('click', ()=>{
      const h = state.harvests.find(x=>x.id===card.dataset.harvestPhotoId);
      if(h) openPhotoDetailModal_Harvest(h);
    });
  });
}

// (2026-07-13) Fix z-index priority on harvest modal; prev: z-[100]
function openPhotoDetailModal_Harvest(h){
  let existing = document.getElementById('harvestDetailModal');
  if(existing) existing.remove();
  const val = Math.round((h.grams/1000)*(h.marketRate||500));
  const modal = document.createElement('div');
  modal.id = 'harvestDetailModal';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');
  modal.style.cssText = 'position:fixed !important; top:0 !important; left:0 !important; right:0 !important; bottom:0 !important; width:100vw !important; height:100vh !important; z-index:999999 !important; background:rgba(0,0,0,0.95) !important; display:flex; flex-direction:column; justify-content:space-between; padding:16px; overflow-y:auto; user-select:none; backdrop-filter:blur(12px);';
  modal.innerHTML = `
    <div class="flex items-center justify-between w-full max-w-lg mx-auto py-2 px-1 flex-shrink-0">
      <div>
        <div class="font-display font-bold text-[16px] leading-tight">${h.variety}</div>
        <div class="text-[11.5px] text-white/60">${fmtDate(h.date)}</div>
      </div>
      <button id="harvestDetailClose" type="button" class="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-[18px] font-bold transition-colors">✕</button>
    </div>

    <div class="flex-1 flex flex-col items-center justify-center my-auto py-3 w-full max-w-lg mx-auto">
      <div id="harvestPhotoFrame" class="relative max-w-md w-full aspect-square overflow-hidden rounded-2xl bg-black border border-white/15 shadow-2xl transition-all duration-300 cursor-pointer flex items-center justify-center">
        <img id="harvestDetailImg" src="${h.photo}" class="w-full h-full object-cover transition-all duration-300" alt="Harvest photo">
        <div id="harvestZoomBadge" class="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/65 backdrop-blur-md text-white/90 text-[10.5px] font-medium px-3 py-1 rounded-full border border-white/20 pointer-events-none shadow-md">
          Tap photo to view full / uncropped
        </div>
      </div>
    </div>

    <div class="w-full max-w-lg mx-auto bg-white/10 backdrop-blur-xl border border-white/15 rounded-2xl p-4 flex flex-col gap-3 flex-shrink-0 mb-2">
      <div class="flex items-center justify-between">
        <div class="font-display font-bold text-[17px] text-white">${h.variety}</div>
        <span class="text-[12px] font-mono font-bold text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 rounded-full">${h.grams} grams</span>
      </div>
      <div class="grid grid-cols-2 gap-2 text-[11.5px] text-white/80">
        <div class="bg-black/30 rounded-xl p-2.5 border border-white/10"><div class="text-white/40 text-[10px] uppercase font-semibold">Date Harvested</div><div class="font-medium mt-0.5">${fmtDate(h.date)}</div></div>
        <div class="bg-black/30 rounded-xl p-2.5 border border-white/10"><div class="text-white/40 text-[10px] uppercase font-semibold">Saved Market Value</div><div class="font-medium text-emerald-400 mt-0.5">₱${val}</div></div>
      </div>
    </div>`;

  document.body.appendChild(modal);

  let isFullView = false;
  const frame = modal.querySelector('#harvestPhotoFrame');
  const img = modal.querySelector('#harvestDetailImg');
  const badge = modal.querySelector('#harvestZoomBadge');

  frame.addEventListener('click', ()=>{
    isFullView = !isFullView;
    if(isFullView){
      frame.classList.remove('aspect-square', 'max-w-md');
      frame.classList.add('max-h-[75vh]');
      img.classList.remove('h-full', 'object-cover');
      img.classList.add('max-h-[75vh]', 'w-auto', 'object-contain');
      badge.textContent = 'Tap to fit 1:1 square';
    } else {
      frame.classList.remove('max-h-[75vh]');
      frame.classList.add('aspect-square', 'max-w-md');
      img.classList.remove('max-h-[75vh]', 'w-auto', 'object-contain');
      img.classList.add('h-full', 'object-cover');
      badge.textContent = 'Tap photo to view full / uncropped';
    }
  });

  document.getElementById('harvestDetailClose').onclick = ()=>modal.remove();
  modal.addEventListener('click', ev=>{ if(ev.target===modal) modal.remove(); });
}

document.getElementById('btnAddExpense').addEventListener('click', ()=>{ document.getElementById('expenseForm').reset(); document.getElementById('expenseModal').classList.remove('hidden'); });
document.getElementById('expenseForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  state.expenses.push({ id: uid(), name: document.getElementById('expenseName').value, amount: Number(document.getElementById('expenseAmount').value)||0, category: document.getElementById('expenseCategory').value });
  persist('expenses'); closeModal('expenseModal'); renderExpenses();
  showToast('Expense added','forest','wallet');
});
document.getElementById('btnAddHarvest').addEventListener('click', ()=>{
  document.getElementById('harvestForm').reset();
  resetHarvestPhotoForm();
  document.getElementById('harvestForm').onsubmit = harvestFormDefaultHandler;
  document.getElementById('harvestModal').classList.remove('hidden');
});
function harvestFormDefaultHandler(e){
  e.preventDefault();
  const rate = Number(document.getElementById('harvestMarketRate')?.value) || 500;
  state.harvests.push({ id: uid(), variety: document.getElementById('harvestVariety').value || 'Unspecified', grams: Number(document.getElementById('harvestGrams').value)||0, marketRate: rate, photo: pendingHarvestPhoto || null, date: todayISO() });
  persist('harvests'); closeModal('harvestModal'); resetHarvestPhotoForm(); renderExpenses();
  showToast('Harvest logged','gold','scissors');
}
document.getElementById('harvestForm').addEventListener('submit', harvestFormDefaultHandler);
function openHarvestModal(pocket){
  document.getElementById('harvestForm').reset();
  resetHarvestPhotoForm();
  document.getElementById('harvestVariety').value = pocket.variety;
  document.getElementById('harvestModal').classList.remove('hidden');
  document.getElementById('harvestForm').onsubmit = (e)=>{
    e.preventDefault();
    const rate = Number(document.getElementById('harvestMarketRate')?.value) || 500;
    state.harvests.push({ id: uid(), variety: document.getElementById('harvestVariety').value || pocket.variety, grams: Number(document.getElementById('harvestGrams').value)||0, marketRate: rate, photo: pendingHarvestPhoto || null, date: todayISO(), pocketId: pocket.id });
    pocket.variety=null; pocket.datePlanted=null; pocket.override=null;
    persist('harvests'); persist('pockets');
    closeModal('harvestModal'); resetHarvestPhotoForm(); renderTower();
    showToast(`Harvested Pocket #${pocket.id}`,'gold','scissors');
    document.getElementById('harvestForm').onsubmit = harvestFormDefaultHandler;
  };
}

/* ================= TOOLS ================= */
const TROUBLESHOOT = [
  { q:'Why is my stem long and falling over (leggy)?', a:'Your seedling is stretching toward light. It needs more direct morning sun — move the tray out of shade for at least 3–4 hours daily, and remove the plastic cover as soon as sprouts appear.' },
  { q:'Why are lower pockets leaking water?', a:'Check the pocket/net-pot angle — it should tilt slightly forward. Also inspect for root blockage clogging the drainage slit.' },
  { q:'Why are leaves turning yellow?', a:'Usually a nutrient deficiency or pH drift. Re-check your SNAP Part A/B ratio and test reservoir pH — hydroponic lettuce prefers 5.5–6.5.' },
  { q:'Why is the pump not circulating?', a:'Check for clogged intake screens and confirm the reservoir has enough water for the pump to stay submerged.' },
  { q:'Why is growth slow in the bottom row?', a:'Bottom rows sit furthest from the light source and closest to warm reservoir water. Consider supplemental side lighting or shading the reservoir to cool it.' }
];
function renderTools(){
  const acc = document.getElementById('troubleshootAccordion');
  if(acc.children.length===0){
    TROUBLESHOOT.forEach((item,i)=>{
      const wrap = document.createElement('div');
      wrap.className = 'border border-line rounded-lg overflow-hidden';
      wrap.innerHTML = `<button class="w-full flex items-center justify-between px-3.5 py-3 text-left text-[13px] font-medium" data-acc-toggle="${i}">${item.q} <span class="flex-shrink-0 transition-transform" data-acc-icon="${i}">${icon('chevron-down','w-4 h-4',16)}</span></button>
        <div class="px-3.5 pb-3 text-[12.5px] text-ink-soft hidden" data-acc-body="${i}">${item.a}</div>`;
      acc.appendChild(wrap);
    });
    acc.querySelectorAll('[data-acc-toggle]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const body = acc.querySelector(`[data-acc-body="${btn.dataset.accToggle}"]`);
        const ic = acc.querySelector(`[data-acc-icon="${btn.dataset.accToggle}"]`);
        body.classList.toggle('hidden');
        ic.style.transform = body.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
      });
    });
  }
}
function updateNutrients(){
  const liters = Number(document.getElementById('nutrientLiters').value)||0;
  document.getElementById('nutrientA').textContent = (liters*5).toFixed(0);
  document.getElementById('nutrientB').textContent = (liters*5).toFixed(0);
}
document.getElementById('nutrientLiters').addEventListener('input', updateNutrients);

/* ---- data export / import / reset ---- */
document.getElementById('btnExportData').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'hydrotrack-backup.json'; a.click();
  showToast('Backup exported','forest','download');
});
document.getElementById('btnImportData').addEventListener('change', (e)=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{ const data = JSON.parse(reader.result); state = { ...state, ...data }; Object.keys(KEYS).forEach(k=>persist(k)); showToast('Backup imported','forest','upload'); renderPage(currentPageName()); }
    catch(err){ showToast('Invalid backup file','clay','alert-triangle'); }
  };
  reader.readAsText(file);
});

// Clear All Data button (replaced Reset Data)
const btnClearAll = document.getElementById('btnClearAllData');
if (btnClearAll) {
  btnClearAll.addEventListener('click', async ()=>{
    if(!await showConfirm('This will delete ALL your data (tower, trays, expenses, harvests). This cannot be undone!', 'Clear All Data')) return;
    Object.values(KEYS).forEach(k=>localStorage.removeItem(k)); 
    localStorage.removeItem('ht_notified');
    localStorage.removeItem('ht_schema_version');
    store.init();
    state = { rows: store.get(KEYS.rows,[]), pockets: store.get(KEYS.pockets,[]), trays: store.get(KEYS.trays,[]), expenses: store.get(KEYS.expenses,[]), harvests: store.get(KEYS.harvests,[]), settings: store.get(KEYS.settings, DEFAULT_SETTINGS), completed: store.get(KEYS.completed,{}), alertLog: store.get(KEYS.alertLog,[]), meta: store.get(KEYS.meta,{firstPlantPrompted:false}) };
    showToast('All data cleared','clay','trash-2');
    renderPage(currentPageName());
  });
}

function currentPageName(){ const visible=[...document.querySelectorAll('.page')].find(p=>!p.classList.contains('hidden')); return visible? visible.id.replace('page-',''):'dashboard'; }

// Sync status indicators - no manual connection needed
['signInStubDesktop','signInStubMobile'].forEach(id=>{
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('click', ()=>{ 
      showPage('tools'); 
      // Scroll to backup card instead
      const backupCard = document.querySelector('[data-icon-label="database"]')?.closest('.bg-white');
      if (backupCard) backupCard.scrollIntoView({behavior:'smooth', block:'center'});
    });
  }
});

document.getElementById('btnOverlayGoogleSignIn')?.addEventListener('click', ()=>cloudSync.signInWithGoogle());
document.getElementById('btnOverlayOffline')?.addEventListener('click', ()=>cloudSync.continueOffline());

// (2026-07-13) Wire Reservoir modal button and form submit; prev: none
document.getElementById('btnOpenReservoirModal')?.addEventListener('click', openReservoirModal);
document.getElementById('reservoirForm')?.addEventListener('submit', (e)=>{
  e.preventDefault();
  const ph = Number(document.getElementById('resPhInput').value) || 6.0;
  const targetPh = Number(document.getElementById('resTargetPhInput').value) || 6.0;
  const ec = Number(document.getElementById('resEcInput').value) || 1.6;
  const targetEc = Number(document.getElementById('resTargetEcInput').value) || 1.8;
  const tempC = Number(document.getElementById('resTempInput').value) || 22;
  const waterPct = Math.min(100, Math.max(0, Number(document.getElementById('resWaterPctInput').value) || 85));
  const topOffLiters = Number(document.getElementById('resTopOffLitersInput').value) || 0;

  state.reservoir = {
    ph, targetPh, ec, targetEc, tempC, waterPct,
    capacityLiters: state.reservoir?.capacityLiters || 30,
    history: state.reservoir?.history || []
  };

  if(topOffLiters > 0){
    state.reservoir.history.push({ date: todayISO(), type: 'top-off', liters: topOffLiters });
  }
  state.reservoir.history.push({ date: todayISO(), type: 'reading', ph, ec, tempC, waterPct });

  persist('reservoir');
  closeModal('reservoirModal');
  renderDashboard();
  showToast('Reservoir data updated', 'forest', 'beaker');
});

['resPhInput', 'resTargetPhInput', 'resEcInput', 'resTargetEcInput'].forEach(id=>{
  document.getElementById(id)?.addEventListener('input', updateReservoirDosingSuggestion);
});

// (2026-07-13) Multi-Tower Staggered Batch Rotation calculation; prev: none
function updateRotationPlanner(){
  const towers = Math.max(1, Number(document.getElementById('rotationTowerCount')?.value)||1);
  const cycle = Math.max(1, Number(document.getElementById('rotationCropDays')?.value)||45);
  const interval = Math.round(cycle / towers);
  const el = document.getElementById('rotationIntervalText');
  if(el) el.textContent = `${interval} Days`;
}
['rotationTowerCount', 'rotationCropDays'].forEach(id=>{
  document.getElementById(id)?.addEventListener('input', updateRotationPlanner);
});

/* ================= FIRST RENDER ================= */
const savedNavPage = (function(){
  try { return localStorage.getItem('ht_active_page'); } catch(e){ return null; }
})();
const initialNavPage = savedNavPage && document.getElementById('page-' + savedNavPage) ? savedNavPage : 'dashboard';
showPage(initialNavPage, { instant: true });
updateNutrients();
updateRotationPlanner();
maybeTriggerFirstPlantFlow();
updateSyncStatus('offline');
if (typeof bootAuth === 'function') {
  bootAuth().catch(err => console.log('Auth boot skipped:', err));
}

// (2026-07-13) Log activity & milestone notifications; prev: toast only
function logActivityNotification(title, message, iconName){
  if (!state.alertLog) state.alertLog = [];
  state.alertLog.unshift({
    id: 'act_' + Date.now(),
    title,
    message,
    timestamp: Date.now(),
    iconName: iconName || 'bell'
  });
  persist('alertLog');
  if (typeof notificationManager !== 'undefined' && notificationManager.sendNotification) {
    notificationManager.sendNotification(title, message);
  }
}

// (2026-07-13) Custom reminders manager; prev: none
function getCustomReminders(){
  return store.get('custom_reminders', [
    { id: 'cr_1', title: 'Check Reservoir pH & EC', time: '08:30', active: true },
    { id: 'cr_2', title: 'Refill Water Tank', time: '17:00', active: true }
  ]);
}
function renderCustomReminders(){
  const container = document.getElementById('customReminderList');
  if(!container) return;
  const list = getCustomReminders();
  if(list.length === 0){
    container.innerHTML = '<div class="text-[12px] text-ink-soft text-center py-2">No custom reminders set.</div>';
    return;
  }
  container.innerHTML = list.map(r=>`
    <div class="flex items-center justify-between p-2 rounded-xl bg-cream/40 border border-line/60">
      <div>
        <div class="font-semibold text-[13px] text-ink">${r.title}</div>
        <div class="text-[11.5px] font-mono text-ink-soft">${r.time}</div>
      </div>
      <div class="flex items-center gap-2">
        <div class="switch ${r.active?'active':''}" data-custom-rem-toggle="${r.id}" role="switch" aria-checked="${r.active}" tabindex="0"></div>
        <button data-custom-rem-del="${r.id}" class="text-clay hover:text-clay-dark p-1">${icon('trash-2','w-3.5 h-3.5',14)}</button>
      </div>
    </div>`).join('');

  container.querySelectorAll('[data-custom-rem-toggle]').forEach(sw=>{
    sw.addEventListener('click', ()=>{
      const id = sw.dataset.customRemToggle;
      const rems = getCustomReminders();
      const r = rems.find(x=>x.id===id);
      if(r){ r.active = !r.active; store.set('custom_reminders', rems); renderCustomReminders(); }
    });
  });
  container.querySelectorAll('[data-custom-rem-del]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.customRemDel;
      const rems = getCustomReminders().filter(x=>x.id!==id);
      store.set('custom_reminders', rems); renderCustomReminders();
    });
  });
}
// (2026-07-13) Open modal for adding reminder; prev: browser prompt()
document.getElementById('btnAddCustomReminder')?.addEventListener('click', ()=>{
  const titleEl = document.getElementById('addReminderTitle');
  const timeEl = document.getElementById('addReminderTime');
  if(titleEl) titleEl.value = '';
  if(timeEl) timeEl.value = '09:00';
  document.getElementById('addReminderModal')?.classList.remove('hidden');
  setTimeout(()=>titleEl?.focus(), 100);
});
document.getElementById('addReminderModalClose')?.addEventListener('click', ()=>document.getElementById('addReminderModal')?.classList.add('hidden'));
document.getElementById('btnConfirmAddReminder')?.addEventListener('click', ()=>{
  const title = (document.getElementById('addReminderTitle')?.value || '').trim();
  const time = document.getElementById('addReminderTime')?.value || '09:00';
  if(!title) { document.getElementById('addReminderTitle')?.focus(); return; }
  const rems = getCustomReminders();
  rems.push({ id: 'cr_' + Date.now(), title, time, active: true });
  store.set('custom_reminders', rems);
  document.getElementById('addReminderModal')?.classList.add('hidden');
  renderCustomReminders();
});
renderCustomReminders();

// (2026-07-13) Pest diagnostic photo upload preview; prev: text only
document.getElementById('pestPhotoInput')?.addEventListener('change', (e)=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    document.getElementById('pestPhotoImg').src = reader.result;
    document.getElementById('pestPhotoPreview').classList.remove('hidden');
    showToast('Leaf photo attached for diagnostic check', 'forest', 'camera');
  };
  reader.readAsDataURL(file);
});
document.getElementById('btnRemovePestPhoto')?.addEventListener('click', ()=>{
  document.getElementById('pestPhotoPreview').classList.add('hidden');
  document.getElementById('pestPhotoInput').value = '';
});

// (2026-07-13) Export financial and harvest summary PDF report; prev: none
function exportFinancialPDFReport(){
  const spent = state.expenses.reduce((s,e)=>s+Number(e.amount||0),0);
  const grams = state.harvests.reduce((s,h)=>s+Number(h.grams||0),0);
  const savings = Math.round((grams/1000)*500);
  const roi = spent > 0 ? Math.round((savings/spent)*100) : 0;
  
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>HydroTrack Financial Report</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 30px; color: #1e293b; }
    h1 { color: #166534; margin-bottom: 4px; }
    .meta { color: #64748b; font-size: 13px; margin-bottom: 24px; }
    .cards { display: flex; gap: 16px; margin-bottom: 24px; }
    .card { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }
    .card-label { font-size: 12px; color: #64748b; font-weight: 500; }
    .card-val { font-size: 22px; font-weight: 700; color: #166534; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 24px; font-size: 13px; }
    th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
    th { background: #f1f5f9; color: #334155; }
    h2 { font-size: 16px; color: #166534; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
  </style></head><body>
  <h1>HydroTrack Yield & Financial Report</h1>
  <div class="meta">Generated on ${new Date().toLocaleDateString()} · Active Tower System</div>
  <div class="cards">
    <div class="card"><div class="card-label">Total Invested</div><div class="card-val">₱${spent.toLocaleString()}</div></div>
    <div class="card"><div class="card-label">Total Harvested</div><div class="card-val">${grams.toLocaleString()} g</div></div>
    <div class="card"><div class="card-label">Market Value Saved</div><div class="card-val">₱${savings.toLocaleString()}</div></div>
    <div class="card"><div class="card-label">ROI Recovered</div><div class="card-val">${roi}%</div></div>
  </div>
  <h2>Harvest Log Summary</h2>
  <table><thead><tr><th>Date</th><th>Variety</th><th>Yield (Grams)</th><th>Est. Value</th></tr></thead><tbody>
  ${state.harvests.length ? state.harvests.map(h=>`<tr><td>${h.date||'—'}</td><td>${h.variety}</td><td>${h.grams}g</td><td>₱${Math.round((h.grams/1000)*500)}</td></tr>`).join('') : '<tr><td colspan="4">No harvests logged yet.</td></tr>'}
  </tbody></table>
  <h2>Expense Log Summary</h2>
  <table><thead><tr><th>Date</th><th>Item</th><th>Category</th><th>Amount</th></tr></thead><tbody>
  ${state.expenses.length ? state.expenses.map(e=>`<tr><td>${e.date||'—'}</td><td>${e.name}</td><td>${e.category}</td><td>₱${Number(e.amount).toLocaleString()}</td></tr>`).join('') : '<tr><td colspan="4">No expenses logged yet.</td></tr>'}
  </tbody></table>
  <script>window.onload = function(){ window.print(); };</script>
  </body></html>`);
  win.document.close();
}
document.getElementById('btnExportFinancialPDF')?.addEventListener('click', exportFinancialPDFReport);

// (2026-07-13) Add universal back button modal close & double-back exit; prev: none
let lastBackPressTime = 0;

// (2026-07-13) Modal stack dismissal hierarchy for photo detail & zoom; prev: direct
function handleUniversalBack(){
  const openModals = Array.from(document.querySelectorAll('#fullscreenZoomModal, [role="dialog"]:not(.hidden):not(#authOverlay)'));
  if(openModals.length > 0){
    const topModal = openModals[openModals.length - 1];
    if(topModal.id === 'fullscreenZoomModal'){
      topModal.style.opacity = '0';
      setTimeout(()=>topModal.remove(), 150);
    } else if(topModal.id === 'photoDetailModal'){
      const closeBtn = topModal.querySelector('#photoDetailClose');
      if(closeBtn) closeBtn.click();
      else topModal.remove();
    } else if(topModal.id === 'confirmModal'){
      const cancelBtn = document.getElementById('confirmModalCancel');
      if(cancelBtn) cancelBtn.click();
      else topModal.classList.add('hidden');
    } else if(topModal.id){
      closeModal(topModal.id);
    } else {
      topModal.classList.add('hidden');
    }
    return true;
  }

  const activePageEl = document.querySelector('.page:not(.hidden)');
  const activePageId = activePageEl ? activePageEl.id.replace('page-', '') : 'dashboard';

  if(activePageId !== 'dashboard'){
    showPage('dashboard', { fromNav: true, fromPopState: true });
    lastBackPressTime = 0;
    return true;
  }

  const now = Date.now();
  if(now - lastBackPressTime < 2000){
    const appPlugin = window.Capacitor?.Plugins?.App || (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() ? window.Capacitor.Plugins.App : null);
    if(appPlugin?.exitApp){
      appPlugin.exitApp();
    } else if(navigator.app?.exitApp){
      navigator.app.exitApp();
    }
  } else {
    lastBackPressTime = now;
    showToast('Press back again to exit', 'clay', 'log-out');
  }
  return true;
}

function initBackButtonListener(){
  if(window.Capacitor?.Plugins?.App?.addListener){
    window.Capacitor.Plugins.App.addListener('backButton', ()=>{
      handleUniversalBack();
    });
  }
}

initBackButtonListener();
document.addEventListener('deviceready', initBackButtonListener);
document.addEventListener('DOMContentLoaded', initBackButtonListener);

try {
  window.history.replaceState({ page: 'dashboard' }, '');
} catch(e){}

window.addEventListener('popstate', ()=>{
  handleUniversalBack();
  try {
    window.history.pushState({ page: 'active' }, '');
  } catch(e){}
});
