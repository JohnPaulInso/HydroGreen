const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const rootDir = path.join(__dirname, '..');
const keyFile = fs.readdirSync(rootDir).find(f => f.endsWith('.json') && f.includes('firebase-adminsdk')) || 'serviceAccountKey.json';
const keyPath = path.join(rootDir, keyFile);

const app = fs.existsSync(keyPath)
  ? initializeApp({ credential: cert(require(keyPath)) })
  : initializeApp({ projectId: 'hydrotrack-2317' });

const db = getFirestore(app);

const DEFAULT_SETTINGS = {
  heatReminder: false,
  heatTime: '11:00',
  sunReminder: false,
  sunTime: '07:00',
  nightReminder: false,
  nightTime: '18:00',
  rainAlert: true,
  heatAlert: true,
  tempAlert: true,
  extremeHeatTemp: 35,
  heatTemp: 32,
  coldTemp: 18,
  rainProbabilityThreshold: 50,
  pushEnabled: false,
  theme: 'light',
  customReminders: [
    { id: 'cr_1', title: 'Check Reservoir pH & EC', time: '08:30', active: true },
    { id: 'cr_2', title: 'Refill Water Tank', time: '17:00', active: true }
  ]
};

function getBlankAccount(uid, email, name) {
  const rows = Array.from({ length: 8 }, (_, i) => ({ id: 'r' + (i + 1), towerId: 't1', potCount: 3 }));
  const pockets = [];
  let n = 1;
  rows.forEach(row => {
    for (let i = 0; i < 3; i++) {
      pockets.push({ id: String(n++), rowId: row.id, variety: null, datePlanted: null, override: null });
    }
  });
  return {
    userId: uid,
    email: email,
    displayName: name,
    towers: [{ id: 't1', name: 'Main Tower' }],
    activeTowerId: 't1',
    rows: rows,
    pockets: pockets,
    trays: [],
    expenses: [],
    harvests: [],
    settings: DEFAULT_SETTINGS,
    completed: {},
    alertLog: [],
    meta: { firstPlantPrompted: false },
    reservoir: { ph: 6.0, targetPh: 6.0, ec: 1.6, targetEc: 1.8, tempC: 22, waterPct: 85, capacityLiters: 30, history: [] },
    _updatedAt: Date.now()
  };
}

async function cleanNewUser() {
  const newUid = 'grwH9N1f2xWFZtC66gcUns3TYTE2';
  const newEmail = 'johnpaulinso123@gmail.com';
  const cleanData = getBlankAccount(newUid, newEmail, 'John Paul Inso');

  console.log(`Resetting ${newEmail} (${newUid}) to brand new clean account...`);
  await db.collection('hydrotrack_towers').doc(newUid).set(cleanData);
  await db.collection('users').doc(newUid).set(cleanData);
  console.log('✅ New account reset to clean default successfully.');
}

cleanNewUser().catch(console.error);
