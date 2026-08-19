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

async function findAndSync() {
  const towersSnap = await db.collection('hydrotrack_towers').get();
  console.log(`Searching across ${towersSnap.size} docs for custom expenses...`);

  let targetData = null;
  towersSnap.forEach(doc => {
    const data = doc.data();
    const exps = data.expenses || [];
    const hasCustom = exps.some(e => e.name && (e.name.includes('Spray Paint') || e.name.includes('Industrial Pail') || e.amount === 287 || e.amount === 150));
    if (hasCustom) {
      console.log(`Found matching doc: ${doc.id} with ${exps.length} expenses!`);
      targetData = data;
    }
  });

  if (!targetData) {
    // If not found in hydrotrack_towers, search all docs for any with expenses != 9 and sum around 2524
    towersSnap.forEach(doc => {
      const data = doc.data();
      const exps = data.expenses || [];
      const sum = exps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      if (sum > 0 && sum !== 4320) {
        console.log(`Found candidate doc ${doc.id} with sum ${sum} (${exps.length} items)`);
        targetData = data;
      }
    });
  }

  if (targetData) {
    console.log('Target expenses:', targetData.expenses);
    const usersResult = await auth.listUsers(10);
    for (const u of usersResult.users) {
      console.log(`Applying to user: ${u.uid} (${u.email})`);
      await db.collection('users').doc(u.uid).set({
        ...targetData,
        userId: u.uid,
        email: u.email || '',
        displayName: u.displayName || '',
        _updatedAt: Date.now()
      }, { merge: true });
    }
    console.log('✅ Successfully synced custom expenses and trays to users collection!');
  } else {
    console.log('No custom doc found in hydrotrack_towers.');
  }
}

findAndSync().catch(console.error);
