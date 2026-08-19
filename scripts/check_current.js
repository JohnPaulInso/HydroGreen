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

async function checkCurrentData() {
  const towersSnap = await db.collection('hydrotrack_towers').get();
  console.log('=== hydrotrack_towers ===');
  towersSnap.forEach(d => {
    const data = d.data();
    console.log(`ID: ${d.id}, email: ${data.email}, expenses: ${data.expenses?.length}, towers: ${data.towers?.length}`);
  });

  const usersSnap = await db.collection('users').get();
  console.log('=== users ===');
  usersSnap.forEach(d => {
    const data = d.data();
    console.log(`ID: ${d.id}, email: ${data.email}, expenses: ${data.expenses?.length}, towers: ${data.towers?.length}`);
  });
}

checkCurrentData().catch(console.error);
