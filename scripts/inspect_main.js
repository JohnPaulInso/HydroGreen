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

async function inspectMainUser() {
  const mainUid = 'T5ctOlfKjsZsorbczUgT97uQXt82';
  const docSnap = await db.collection('hydrotrack_towers').doc(mainUid).get();
  if (!docSnap.exists) {
    console.log('Doc does not exist!');
    return;
  }
  const data = docSnap.data();
  console.log('Main user data in Firestore:');
  console.log('Email:', data.email);
  console.log('Expenses:', JSON.stringify(data.expenses, null, 2));
  console.log('Towers:', JSON.stringify(data.towers));
  console.log('Trays:', JSON.stringify(data.trays));
  console.log('Pockets (planted):', JSON.stringify((data.pockets||[]).filter(p=>p.variety)));
}

inspectMainUser().catch(console.error);
