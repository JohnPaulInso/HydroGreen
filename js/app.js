/* ============================================================
   HydroTrack / TowerCrop — application logic
   All persistence flows through `store.*` — swapping this block
   for Firestore + Auth later won't require touching render code.
   ============================================================ */

const KEYS = {
  rows:'ht_rows', pockets:'ht_pockets', trays:'ht_trays', expenses:'ht_expenses',
  harvests:'ht_harvests', settings:'ht_settings', completed:'ht_completed',
  alertLog:'ht_alertlog', meta:'ht_meta', towers:'ht_towers', activeTower:'ht_active_tower'
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
  meta: store.get(KEYS.meta, { firstPlantPrompted:false })
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
function showPage(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
  document.getElementById('page-'+name).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.page===name));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.page===name));
  renderPage(name);
  window.scrollTo({top:0,behavior:'instant'});
}
document.querySelectorAll('[data-page]').forEach(btn=>btn.addEventListener('click', ()=>showPage(btn.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(btn=>btn.addEventListener('click', ()=>showPage(btn.dataset.goto)));

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

/* ================= TASKS + UPCOMING TRANSITIONS ================= */
function computeTasks(){
  const tasks = [];
  if(state.settings.sunReminder) tasks.push({ id:'sun-morning', time:'7:00 AM', text:'Put seedling trays in direct morning sun', iconName:'sun' });
  if(state.settings.heatReminder) tasks.push({ id:'heat-midday', time:'11:00 AM', text:'Move trays to shade — scorching midday heat', iconName:'thermometer' });
  if(state.settings.nightReminder) tasks.push({ id:'dark-night', time:'6:00 PM', text:'Turn off porch lights — plants need full darkness', iconName:'moon' in ICONS ? 'moon':'bell' });

  state.trays.forEach(t=>{
    const day = dayOfCycle(t.startDate);
    if(day===3) tasks.push({ id:'tray-'+t.id+'-d3', time:'Milestone', text:`Sprouts appearing in "${t.variety}" tray — uncover & check the water puddle`, iconName:'sprout' });
    if(day===10) tasks.push({ id:'tray-'+t.id+'-d10', time:'Milestone', text:`Thinning time for "${t.variety}" — keep 1 sprout per cube`, iconName:'scissors' });
    if(day>=12) tasks.push({ id:'tray-'+t.id+'-ready', time:'Milestone', text:`"${t.variety}" tray is ready to transplant to the tower`, iconName:'move-up-right' });
  });

  state.pockets.forEach(p=>{
    if(!p.variety) return;
    const {stage, day} = getPocketState(p);
    const row = state.rows.find(r=>r.id===p.rowId);
    if(stage.key==='harvest' && day===36) tasks.push({ id:'pocket-'+p.id+'-harvest', time:'Milestone', text:`${row?rowLabel(row):''} · #${p.id} (${p.variety}) entered its harvest window`, iconName:'scissors' });
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
    if(!est.done) items.push({ label:p.variety, sub:`${row?rowLabel(row):'Row'} · Pocket #${p.id}`, next:est.label, daysUntil:est.daysUntil, date:est.date, iconName:'waypoints' });
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
function rowLabel(row){ const idx = state.rows.findIndex(r=>r.id===row.id); return `Row ${idx+1}`; }
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
// (2026-07-13) Fix pocket hit area with SVG fill-opacity; prev: fill="transparent"
function potCup(id, ax, ay, nx, ny, status, stageKey){
  const ring = `<circle class="pocket-select-ring" cx="${ax}" cy="${ay+9}" r="19" fill="none" stroke="#E8A33D" stroke-width="3.5" opacity="0"/>`;
  const iconR = 12;
  const hitCircle = `<circle cx="${ax}" cy="${ay+9}" r="24" fill="#000000" fill-opacity="0"/>`;
  return `<g class="tower-pocket" data-pocket-id="${id}" data-status="${status}" tabindex="0" role="button" aria-label="Pocket ${id}">${hitCircle}
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

/* ---- Multi-select via tap / long-press + drag (mouse & touch, via Pointer Events) ---- */
const selectionState = { active:false, ids:new Set() };
let lp = { timer:null, dragging:false, fired:false, startX:0, startY:0, activeId:null };
const LONG_PRESS_MS = 380, MOVE_CANCEL_PX = 12;

// (2026-07-13) Consolidate tap modal opening to click event; prev: duplicate pointerup
function initTowerInteraction(){
  const el = document.getElementById('towerDiagram');
  if(el.dataset.wired) return;
  el.dataset.wired = '1';
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
  state.pockets.forEach(p=>selectionState.ids.add(p.id));
  selectionState.active = true;
  updateSelectionVisuals(); renderSelectionBar();
});
document.getElementById('btnSelectionAssign')?.addEventListener('click', ()=>openBulkAssignModal());
document.getElementById('btnSelectionClear')?.addEventListener('click', async ()=>{
  if(!await showConfirm(`Clear ${selectionState.ids.size} selected pocket(s)?`, 'Clear Selection')) return;
  selectionState.ids.forEach(id=>{ const p=state.pockets.find(x=>x.id===id); if(p){ p.variety=null; p.datePlanted=null; p.override=null; } });
  persist('pockets'); exitSelectionMode(); renderTower();
  showToast('Selected pockets cleared','clay','trash-2');
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
  const titleEl = document.getElementById('visualizerTowerName');
  if(titleEl) titleEl.textContent = activeTower.name;

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

  document.getElementById('towerDiagram').innerHTML = buildTowerSVG(filterVariety || null, towerRows);
  document.getElementById('towerMeta').textContent = `${activeTower.name} · ${towerRows.length} Rows × ${towerRows[0]?.potCount||3} Columns · ${towerPockets.length} Pockets Total`;
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
document.getElementById('btnAddTower')?.addEventListener('click', ()=>{
  if(document.getElementById('newTowerName')) document.getElementById('newTowerName').value = '';
  if(document.getElementById('newTowerRowsCount')) document.getElementById('newTowerRowsCount').value = 8;
  if(document.getElementById('newTowerColsCount')) document.getElementById('newTowerColsCount').value = 3;
  document.getElementById('newTowerModal').classList.remove('hidden');
});
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
  document.getElementById('renameTowerModal').classList.remove('hidden');
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
  document.getElementById('addRowCount').value = 3;
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
      <button id="btnClearPocket" class="w-full text-[12.5px] font-medium text-clay bg-[#FCEBD8] rounded-lg py-2.5 flex items-center justify-center gap-1.5">${icon('trash-2','w-4 h-4',16)} Clear Pocket</button>`;

    document.getElementById('btnAdvanceStage').addEventListener('click', ()=>{
      p.override = Math.min(STAGES.length-1, idx+1);
      persist('pockets'); openPocketModal(id); renderTower();
      showToast(`Pocket #${id} advanced to ${STAGES[p.override].label}`,'forest','arrow-right-circle');
    });
    document.getElementById('btnHarvestPocket').addEventListener('click', ()=>{ closeModal('pocketModal'); openHarvestModal(p); });
    document.getElementById('btnClearPocket').addEventListener('click', ()=>{
      p.variety=null; p.datePlanted=null; p.override=null;
      persist('pockets'); closeModal('pocketModal'); renderTower();
      showToast(`Pocket #${id} cleared`,'clay','trash-2');
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
document.querySelectorAll('.modal-backdrop').forEach(m=>m.addEventListener('click', (e)=>{ if(e.target===m) m.classList.add('hidden'); }));

/* ================= NURSERY ================= */
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
    const card = document.createElement('div');
    card.className = 'bg-white rounded-2xl shadow-card border border-line p-4 flex flex-col';
    card.innerHTML = `
      <div class="flex items-center gap-3 mb-3">
        <div class="flex-shrink-0">${plantIcon(stage.key,48)}</div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-[14px] text-ink truncate">${t.variety}</div>
          <div class="text-[11.5px] text-ink-soft">${t.dimensions?`${t.dimensions} (${t.count} cells)`:`${t.count} seedlings`} · started ${fmtDate(t.startDate)}</div>
        </div>
      </div>
      <div class="text-[12.5px] font-medium text-forest mb-1">${stage.label} · Day ${day}</div>
      <div class="w-full h-1.5 bg-line rounded-full overflow-hidden mb-2">
        <div class="h-full bg-leaf rounded-full" style="width:${Math.min(100, Math.round(day/14*100))}%"></div>
      </div>
      <div class="text-[11px] text-ink-soft mb-3 flex items-center gap-1.5">${icon('timer','w-3.5 h-3.5 flex-shrink-0',14)} ${ready? 'Ready now' : `${est.label} in ${est.daysUntil}d (${fmtDate(est.date)})`}</div>
      <div class="flex gap-2 mt-auto">
        ${ready ? `<button data-tray-transplant="${t.id}" class="flex-1 text-[12.5px] font-semibold text-white bg-forest rounded-lg py-2 flex items-center justify-center gap-1.5">${icon('move-up-right','w-3.5 h-3.5',14)} Transplant</button>`
                : `<span class="flex-1 text-center text-[11.5px] text-ink-soft bg-cream rounded-lg py-2">Ready on ${fmtDate(addDays(t.startDate,12))}</span>`}
        <button data-tray-remove="${t.id}" class="text-[12.5px] font-medium text-clay bg-[#FCEBD8] rounded-lg py-2 px-3">${icon('trash-2','w-3.5 h-3.5',14)}</button>
      </div>`;
    list.appendChild(card);
  });
  list.querySelectorAll('[data-tray-transplant]').forEach(btn=>btn.addEventListener('click', ()=>openTransplantModal(btn.dataset.trayTransplant)));
  list.querySelectorAll('[data-tray-remove]').forEach(btn=>btn.addEventListener('click', ()=>{ state.trays=state.trays.filter(t=>t.id!==btn.dataset.trayRemove); persist('trays'); renderNursery(); showToast('Tray removed','clay','trash-2'); }));
}
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
function openTransplantModal(trayId){
  activeTrayId = trayId;
  const grid = document.getElementById('transplantPocketGrid');
  grid.innerHTML = '';
  const empties = state.pockets.filter(p=>!p.variety);
  empties.forEach(p=>{
    const row = state.rows.find(r=>r.id===p.rowId);
    const cell = document.createElement('button');
    cell.type='button'; cell.dataset.pid=p.id;
    cell.className = 'pocket-pick border-2 border-line rounded-xl py-2 flex flex-col items-center gap-1 text-[10px] font-mono';
    cell.innerHTML = `${plantIcon('empty',26)}${row?rowLabel(row):''}·#${p.id}`;
    cell.addEventListener('click', ()=>cell.classList.toggle('selected'));
    grid.appendChild(cell);
  });
  if(empties.length===0) grid.innerHTML = `<div class="col-span-4 text-center text-[12.5px] text-ink-soft py-4">No empty pockets available — add a new row from the Tower page.</div>`;
  document.getElementById('transplantModal').classList.remove('hidden');
}
document.getElementById('btnConfirmTransplant').addEventListener('click', ()=>{
  const grid = document.getElementById('transplantPocketGrid');
  const selected = [...grid.querySelectorAll('.pocket-pick.selected')].map(el=>Number(el.dataset.pid));
  if(selected.length===0){ showToast('Pick at least one pocket','clay','alert-triangle'); return; }
  const tray = state.trays.find(t=>t.id===activeTrayId);
  selected.forEach(pid=>{ const p=state.pockets.find(x=>x.id===pid); p.variety=tray.variety; p.datePlanted=tray.startDate; p.override=null; });
  tray.count = Math.max(0, tray.count-selected.length);
  if(tray.count<=0) state.trays = state.trays.filter(t=>t.id!==tray.id);
  persist('pockets'); persist('trays');
  closeModal('transplantModal'); renderNursery();
  showToast(`Transplanted ${selected.length} seedling(s) to the tower`,'forest','move-up-right');
});
const pickStyle = document.createElement('style');
pickStyle.textContent = `.pocket-pick.selected{ border-color:#2F9E5B; background:#DCF5E3; }`;
document.head.appendChild(pickStyle);

// (2026-07-13) Immediate weather widget fallback rendering; prev: null check
function renderReminders(){
  document.querySelectorAll('.switch').forEach(sw=>sw.classList.toggle('on', !!state.settings[sw.dataset.toggle]));
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
document.querySelectorAll('.switch').forEach(sw=>sw.addEventListener('click', async ()=>{
  const key = sw.dataset.toggle; state.settings[key]=!state.settings[key]; persist('settings'); sw.classList.toggle('on', state.settings[key]);
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
}));
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
  const el = document.getElementById('alertLog'); el.innerHTML = '';
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
  const now = new Date(); const slot = `${todayISO()}_${now.getHours()}`;
  const seen = store.get('ht_notified', {});
  const fire = (h, text)=>{ if(now.getHours()===h && now.getMinutes()<1 && !seen[slot]){ new Notification('HydroTrack', { body:text }); seen[slot]=true; store.set('ht_notified', seen); } };
  if(state.settings.sunReminder) fire(7,'Time to put your seedling tray into direct morning sun');
  if(state.settings.heatReminder) fire(11,'Scorching sun — move seedlings to partial shade');
  if(state.settings.nightReminder) fire(18,'Lights off — plants need complete darkness');
}, 30000);

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

// Firebase auto-connects - no manual UI needed
// Auto-reconnect on page load
if (typeof autoReconnectCloud === 'function') {
  autoReconnectCloud().catch(err => {
    console.log('Firebase auto-connect skipped:', err);
  });
}

/* ================= FIRST RENDER ================= */
renderDashboard();
updateNutrients();
maybeTriggerFirstPlantFlow();
updateSyncStatus('offline');
