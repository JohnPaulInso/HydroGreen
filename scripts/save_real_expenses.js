const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const rootDir = path.join(__dirname, '..');
const keyFile = fs.readdirSync(rootDir).find(f => f.endsWith('.json') && f.includes('firebase-adminsdk')) || 'serviceAccountKey.json';
const keyPath = path.join(rootDir, keyFile);

const app = fs.existsSync(keyPath)
  ? initializeApp({ credential: cert(require(keyPath)) })
  : initializeApp({ projectId: 'hydrotrack-2317' });

const db = getFirestore(app);
const auth = getAuth(app);

const userExpenses = [
  { id: 'exp-1', name: 'Spray Paint & Extra Sandpaper', amount: 150, category: 'Equipment', date: '2026-08-19' },
  { id: 'exp-2', name: 'Industrial Pail', amount: 287, category: 'Equipment', date: '2026-08-19' },
  { id: 'exp-3', name: 'Lollo Rossa Lettuce Seeds', amount: 69, category: 'Consumables', date: '2026-08-19' },
  { id: 'exp-4', name: 'Submersible Water Pump', amount: 309, category: 'Equipment', date: '2026-08-19' },
  { id: 'exp-5', name: 'Black Seeded Simpson Lettuce Seeds', amount: 138, category: 'Consumables', date: '2026-08-19' },
  { id: 'exp-6', name: 'Nutrient Solution', amount: 250, category: 'Consumables', date: '2026-08-19' },
  { id: 'exp-7', name: 'Rockwool & Net Pots', amount: 320, category: 'Consumables', date: '2026-08-19' },
  { id: 'exp-8', name: 'PVC Pipes & Fittings', amount: 1001, category: 'Equipment', date: '2026-08-19' }
];

async function setExactUserExpenses() {
  const usersResult = await auth.listUsers(10);
  for (const u of usersResult.users) {
    console.log(`Setting real expenses on users/${u.uid}...`);
    await db.collection('users').doc(u.uid).set({
      expenses: userExpenses,
      _updatedAt: Date.now()
    }, { merge: true });
  }
  console.log('✅ Real expenses written to Firestore users collection successfully!');
}

setExactUserExpenses().catch(console.error);
