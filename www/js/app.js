/* ============================================================
   HydroTrack / TowerCrop — application logic
   All persistence flows through `store.*` — swapping this block
   for Firestore + Auth later won't require touching render code.
   ============================================================ */

// (2026-07-13) Add reservoir key to KEYS for pH/EC/Water tracking; prev: none
const KEYS = {
  rows:'ht_rows', pockets:'ht_pockets', trays:'ht_trays', expenses:'ht_expenses',
  harvests:'ht_harvests', settings:'ht_settings', completed:'ht_completed',
  alertLog:'ht_alertlog', meta:'ht_meta', towers:'ht_towers', activeTower:'ht_active_tower', reservoir:'ht_reservoir'
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
// (2026-07-13) Global 5-second high-contrast undo snackbar helper; prev: 3-second dark toast
let activeUndoTimer = null;
let activeUndoInterval = null;
function triggerUndoSnackbar(message, restoreFn){
  if(activeUndoTimer){ clearTimeout(activeUndoTimer); activeUndoTimer = null; }
  if(activeUndoInterval){ clearInterval(activeUndoInterval); activeUndoInterval = null; }
  const existing = document.getElementById('undoSnackbar');
  if(existing) existing.remove();

  const snackbar = document.createElement('div');
  snackbar.id = 'undoSnackbar';
  snackbar.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] bg-[#14261C] text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center justify-between gap-4 text-[14px] font-semibold border-2 border-mint/40 max-w-[90vw] min-w-[280px] animate-bounce-in';
  
  let seconds = 5;
  snackbar.innerHTML = `
    <span class="text-white drop-shadow-xs truncate">${message}</span>
    <button id="btnUndoAction" type="button" class="bg-forest hover:bg-forest/90 text-white text-[13px] font-bold px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md border border-white/20 flex-shrink-0">
      <span>Undo</span>
      <span id="undoCountdown" class="bg-white/25 text-white px-2 py-0.5 rounded-md text-[11px] font-mono font-bold">5s</span>
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
function showPage(name, opts){
  document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
  const pageEl = document.getElementById('page-'+name);
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
  // Move focus to the new page's heading for screen-reader/keyboard users,
  // but skip it on the very first automatic load so focus doesn't jump on landing.
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

/* ================= TOASTS ================= */
const MAX_TOASTS = 3;
function showToast(msg, tone='forest', iconName='info'){
  const wrap = document.getElementById('toastContainer');
  announce(msg.replace(/<[^>]+>/g,''));
  // Remove oldest toast if we've hit the limit
  const existingToasts = wrap.querySelectorAll('.toast');
  if(existingToasts.length >= MAX_TOASTS){
    existingToasts[0].remove();
  }
  const el = document.createElement('div');
  const bg = { forest:'bg-forest', clay:'bg-clay', gold:'bg-gold' }[tone] || 'bg-forest';
  el.className = `toast ${bg} text-white text-[13px] font-medium px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 max-w-sm pointer-events-auto`;
  el.innerHTML = `${icon(iconName,'w-4 h-4 flex-shrink-0',16)}<span>${msg}</span>`;
  wrap.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateX(16px)'; el.style.transition='.25s'; setTimeout(()=>el.remove(),260); }, 3800);
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

function renderGrowthGallery(containerId){
  const gallery = document.getElementById(containerId);
  if(!gallery) return;
  gallery.innerHTML = '';
  STAGES.forEach(meta=>{
    const key = meta.key;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'flex flex-col items-center text-center bg-cream hover:bg-mint rounded-xl p-2 transition-colors';
    card.innerHTML = `${plantIcon(key, 40)}<span class="text-[10px] font-semibold text-ink-soft mt-1 leading-tight">${meta.label.split(' ')[0]}</span>`;
    card.addEventListener('click', ()=>showToast(`<strong>${meta.label}</strong> (Day ${meta.range[0]}${meta.range[1]>900?'+':'–'+meta.range[1]}) — ${STAGE_DESCRIPTIONS[key]}`, 'forest', 'info'));
    gallery.appendChild(card);
  });
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
// (2026-07-13) Fix pocket hit area with SVG fill-opacity; prev: fill="transparent"
function potCup(id, ax, ay, nx, ny, status, stageKey){
  const ring = `<circle class="pocket-select-ring" cx="${ax}" cy="${ay+9}" r="19" fill="none" stroke="#E8A33D" stroke-width="3.5" opacity="0"/>`;
  const iconR = 12;
  const hitCircle = `<circle cx="${ax}" cy="${ay+9}" r="24" fill="#000000" fill-opacity="0"/>`;
  return `<g class="tower-pocket" data-pocket-id="${id}" data-status="${status}" tabindex="0" role="button" aria-label="${pocketAriaLabel(id)}">${hitCircle}
    <line x1="${nx}" y1="${ny}" x2="${ax}" y2="${ay+8}" stroke="#C7D1CA" stroke-width="5" stroke-linecap="round"/>
    <path d="M${ax-15} ${ay+8} Q${ax-16} ${ay+24} ${ax} ${ay+26} Q${ax+16} ${ay+24} ${ax+15} ${ay+8} Z" fill="url(#pipeGrad)" stroke="#C2CCC5" stroke-width="1.5"/>
    <circle cx="${ax}" cy="${ay+9}" r="${iconR+2}" fill="#FFFFFF" stroke="#E3E9E3" stroke-width="1"/>
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
  return `<g class="tower-pocket" data-pocket-id="${id}" data-status="${status}" tabindex="0" role="button" aria-label="${pocketAriaLabel(id)}">${hitCircle}
    <ellipse cx="${x}" cy="${channelTopY+3}" rx="${r+2}" ry="${(r+2)*0.55}" fill="#00000014"/>
    <circle cx="${x}" cy="${channelTopY}" r="${r}" fill="#FFFFFF" stroke="#C2CCC5" stroke-width="1.5"/>
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
      <button data-row-select="${row.id}" class="w-full flex items-center justify-between text-left group">
        <div class="flex items-center gap-3">
          <span class="w-10 h-10 rounded-2xl bg-mint text-forest flex items-center justify-center flex-shrink-0">${icon('layers','w-5 h-5',20)}</span>
          <div>
            <div class="font-semibold text-[15px] text-ink">${rowLabel(row)} <span class="text-ink-soft font-normal text-[13px]">· ${pockets.length} pockets</span></div>
            <div class="text-[12.5px] text-ink-soft mt-0.5">${rowSummary(row)}</div>
          </div>
        </div>
      </button>
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
  list.querySelectorAll('[data-pocket-chip]').forEach(btn=>btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    if(selectionState.active) toggleSelect(Number(btn.dataset.pocketChip), !selectionState.ids.has(Number(btn.dataset.pocketChip)));
    else openPocketModal(Number(btn.dataset.pocketChip));
  }));
  updateSelectionVisuals();
  renderSelectionBar();
}
document.getElementById('towerSearch')?.addEventListener('input', ()=>renderTower());
// (2026-07-13) Position pocket number above plus icon; prev: overlapping center
function pocketChipHTML(p){
  const {status, day, stage} = getPocketState(p);
  const stageKey = stage ? stage.key : 'empty';
  return `<button data-pocket-chip="${p.id}" class="pocket-chip status-${status} flex flex-col items-center justify-between p-2 flex-shrink-0 shadow-sm">
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
      <div class="grid grid-cols-2 gap-2.5 mb-3">
        <button id="btnAdvanceStage" class="text-[13px] font-semibold text-forest bg-mint rounded-lg py-2.5 flex items-center justify-center gap-1.5" ${idx>=STAGES.length-1?'disabled':''}>${icon('arrow-right-circle','w-4 h-4',16)} Advance Stage</button>
        <button id="btnHarvestPocket" class="text-[13px] font-semibold text-white bg-gold rounded-lg py-2.5 flex items-center justify-center gap-1.5">${icon('scissors','w-4 h-4',16)} Harvest</button>
      </div>
      <div class="grid grid-cols-2 gap-2.5 mb-3">
        <button id="btnReturnToTray" class="text-[12.5px] font-semibold text-forest bg-mint/60 hover:bg-mint rounded-lg py-2.5 flex items-center justify-center gap-1.5 transition-colors">${icon('move-left','w-4 h-4',16)} Return to Tray</button>
        <button id="btnClearPocket" class="text-[12.5px] font-medium text-clay bg-[#FCEBD8] rounded-lg py-2.5 flex items-center justify-center gap-1.5">${icon('trash-2','w-4 h-4',16)} Clear Pocket</button>
      </div>`;

    document.getElementById('btnAdvanceStage').addEventListener('click', ()=>{
      p.override = Math.min(STAGES.length-1, idx+1);
      persist('pockets'); openPocketModal(id); renderTower();
      showToast(`Pocket #${id} advanced to ${STAGES[p.override].label}`,'forest','arrow-right-circle');
    });
    document.getElementById('btnHarvestPocket').addEventListener('click', ()=>{ closeModal('pocketModal'); openHarvestModal(p); });
    // (2026-07-13) Bi-directional tower-to-tray reversion logic; prev: none
    document.getElementById('btnReturnToTray')?.addEventListener('click', ()=>{
      const snapshotPockets = JSON.parse(JSON.stringify(state.pockets));
      const snapshotTrays = JSON.parse(JSON.stringify(state.trays));
      
      let targetTray = state.trays.find(t=>t.variety===p.variety);
      if(!targetTray && state.trays.length>0) targetTray = state.trays[0];
      if(!targetTray){
        targetTray = {
          id: 'tr_' + Date.now(),
          variety: p.variety || 'Seedlings',
          startDate: p.datePlanted || new Date().toISOString().split('T')[0],
          gridRows: 3,
          gridCols: 4,
          count: 0
        };
        state.trays.push(targetTray);
      }

      const cells = getTrayCells(targetTray);
      const emptyCell = cells.find(c=>!c.filled);
      if(!emptyCell){
        showToast('No empty cells available in tray!', 'clay', 'alert-triangle');
        return;
      }

      emptyCell.filled = true;
      targetTray.count = cells.filter(c=>c.filled).length;

      const plantName = p.variety || 'Plant';
      p.variety = null; p.datePlanted = null; p.override = null;

      persist('pockets'); persist('trays');
      closeModal('pocketModal');
      renderTower(); renderNursery();

      triggerUndoSnackbar(`Returned ${plantName} to tray cell [${emptyCell.id}]`, ()=>{
        state.pockets = snapshotPockets;
        state.trays = snapshotTrays;
        persist('pockets'); persist('trays');
        renderTower(); renderNursery();
      });
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
function closeModal(id){ document.getElementById(id).classList.add('hidden'); }
// (2026-07-13) Add newTowerModalClose and renameTowerModalClose handlers
document.getElementById('newTowerModalClose')?.addEventListener('click', ()=>closeModal('newTowerModal'));
document.getElementById('renameTowerModalClose')?.addEventListener('click', ()=>closeModal('renameTowerModal'));
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
// (2026-07-13) Index-based grid state helper for 3x4 seedling tray grid cells; prev: count integer only
function getTrayCells(tray){
  const rows = tray.gridRows || 3;
  const cols = tray.gridCols || 4;
  const total = rows * cols;
  if(!tray.cells || tray.cells.length !== total){
    const filledCount = tray.count !== undefined ? tray.count : total;
    tray.cells = Array.from({ length: total }, (_, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      return { id: `${r}-${c}`, index: i, filled: i < filledCount };
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
            return `<div class="relative overflow-hidden bg-[#E3EAE3]" style="flex:${seg.d};border-radius:${radius};">
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
      <div class="flex gap-2 mt-auto">
        ${selectedHere.size>0
          ? `<button data-tray-move="${t.id}" class="flex-1 text-[12.5px] font-semibold text-white bg-forest hover:bg-forest/90 rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition-colors shadow-xs">${icon('move-up-right','w-3.5 h-3.5',14)} Move ${selectedHere.size} to Tower</button>
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

      cell.className = `aspect-square rounded-md flex items-center justify-center cursor-pointer touch-none nursery-cell-cube transition-all ${isFilled ? (isSelected ? 'selected' : '') : 'opacity-40 border border-dashed border-line/60 bg-black/10 hover:opacity-80 hover:border-forest/60 hover:bg-mint/20'}`;
      cell.setAttribute('aria-label', `Cell ${i+1} [${cellData.id}], ${t.variety}${isFilled ? (isSelected ? ', selected' : '') : ', empty (tap to plant)'}`);
      cell.setAttribute('aria-pressed', String(isSelected));
      cell.innerHTML = isFilled ? plantIcon(stage.key, 22) : `<span class="text-[9px] font-mono text-ink-soft/60">${cellData.id}</span>`;
      
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
  // (2026-07-13) Wire edit tray button; prev: none
  list.querySelectorAll('[data-tray-edit]').forEach(btn=>btn.addEventListener('click', ()=>openEditTrayModal(btn.dataset.trayEdit)));
}

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
document.getElementById('btnEnableNotifs').addEventListener('click', requestBrowserNotifs);
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
  document.getElementById('harvestForm').onsubmit = harvestFormDefaultHandler;
  document.getElementById('harvestModal').classList.remove('hidden');
});
function harvestFormDefaultHandler(e){
  e.preventDefault();
  state.harvests.push({ id: uid(), variety: document.getElementById('harvestVariety').value || 'Unspecified', grams: Number(document.getElementById('harvestGrams').value)||0, date: todayISO() });
  persist('harvests'); closeModal('harvestModal'); renderExpenses();
  showToast('Harvest logged','gold','scissors');
}
document.getElementById('harvestForm').addEventListener('submit', harvestFormDefaultHandler);
function openHarvestModal(pocket){
  document.getElementById('harvestForm').reset();
  document.getElementById('harvestVariety').value = pocket.variety;
  document.getElementById('harvestModal').classList.remove('hidden');
  document.getElementById('harvestForm').onsubmit = (e)=>{
    e.preventDefault();
    state.harvests.push({ id: uid(), variety: document.getElementById('harvestVariety').value || pocket.variety, grams: Number(document.getElementById('harvestGrams').value)||0, date: todayISO(), pocketId: pocket.id });
    pocket.variety=null; pocket.datePlanted=null; pocket.override=null;
    persist('harvests'); persist('pockets');
    closeModal('harvestModal'); renderTower();
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
renderDashboard();
updateNutrients();
updateRotationPlanner();
maybeTriggerFirstPlantFlow();
updateSyncStatus('offline');
if (typeof bootAuth === 'function') {
  bootAuth().catch(err => console.log('Auth boot skipped:', err));
}
