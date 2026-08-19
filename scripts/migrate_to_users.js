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

async function main() {
  console.log('Fetching users from Firebase Auth...');
  const usersResult = await auth.listUsers(100);
  console.log(`Found ${usersResult.users.length} auth user(s):`);
  usersResult.users.forEach(u => console.log(`- UID: ${u.uid}, Email: ${u.email}`));

  console.log('\nChecking hydrotrack_towers collection...');
  const towersSnap = await db.collection('hydrotrack_towers').get();
  console.log(`Found ${towersSnap.size} doc(s) in hydrotrack_towers.`);

  // Find doc with actual data
  let mostRecentDoc = null;
  let highestUpdated = 0;
  let populatedDocs = [];

  towersSnap.forEach(doc => {
    const data = doc.data();
    const trays = data.trays || [];
    const expenses = data.expenses || [];
    const pockets = (data.pockets || []).filter(p => p.variety);
    const updated = data._updatedAt || 0;
    if (trays.length > 0 || pockets.length > 0 || expenses.length > 0) {
      populatedDocs.push({ id: doc.id, trays: trays.length, plantedPockets: pockets.length, expenses: expenses.length, updated });
    }
    if (updated > highestUpdated) {
      highestUpdated = updated;
      mostRecentDoc = { id: doc.id, data };
    }
  });

  console.log('\nPopulated docs found:', populatedDocs);

  // If there are auth users, ensure they have docs in `users` collection
  for (const user of usersResult.users) {
    const userDocRef = db.collection('users').doc(user.uid);
    const userSnap = await userDocRef.get();
    
    // Find matching or latest data to migrate if user has no data yet
    let dataToSet = {};
    const directTowerDoc = await db.collection('hydrotrack_towers').doc(user.uid).get();
    if (directTowerDoc.exists) {
      dataToSet = directTowerDoc.data();
    } else if (mostRecentDoc) {
      console.log(`Migrating most recent populated doc (${mostRecentDoc.id}) to user ${user.uid}`);
      dataToSet = mostRecentDoc.data();
    }

    await userDocRef.set({
      userId: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      lastLogin: Date.now(),
      ...dataToSet,
      _updatedAt: Date.now()
    }, { merge: true });

    console.log(`✅ User doc created/updated at users/${user.uid}`);
  }
}

main().catch(console.error);
