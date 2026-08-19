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

async function inspectUsers() {
  const usersSnap = await db.collection('users').get();
  console.log(`Found ${usersSnap.size} user docs in Firestore:`);
  usersSnap.forEach(doc => {
    const data = doc.data();
    console.log(`Doc ID: ${doc.id}`);
    console.log(`Email: ${data.email}, Name: ${data.displayName}`);
    console.log(`Towers: ${data.towers ? data.towers.length : 'none'}`);
    console.log(`Trays: ${data.trays ? data.trays.length : 'none'}`);
    console.log(`Expenses: ${data.expenses ? data.expenses.length : 'none'}`);
    console.log(`Planted Pockets: ${data.pockets ? data.pockets.filter(p=>p.variety).length : 'none'}`);
    console.log(`_updatedAt: ${data._updatedAt}`);
    console.log('---');
  });

  const authList = await auth.listUsers(10);
  console.log('Auth Users:');
  authList.users.forEach(u => console.log(`UID: ${u.uid}, Email: ${u.email}`));
}

inspectUsers().catch(console.error);
