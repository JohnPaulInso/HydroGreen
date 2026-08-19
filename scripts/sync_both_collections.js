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

async function syncBothCollections() {
  const usersSnap = await db.collection('users').get();
  console.log(`Syncing ${usersSnap.size} user docs to hydrotrack_towers...`);
  
  for (const doc of usersSnap.docs) {
    const data = doc.data();
    console.log(`Writing hydrotrack_towers/${doc.id}...`);
    await db.collection('hydrotrack_towers').doc(doc.id).set(data, { merge: true });
  }
  console.log('✅ Both users and hydrotrack_towers collections are now perfectly synchronized!');
}

syncBothCollections().catch(console.error);
