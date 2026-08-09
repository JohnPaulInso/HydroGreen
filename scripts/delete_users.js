const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// (2026-07-13) Auto-detect service account key file (was strict filename)
const rootDir = path.join(__dirname, '..');
const keyFile = fs.readdirSync(rootDir).find(f => f.endsWith('.json') && f.includes('firebase-adminsdk')) || 'serviceAccountKey.json';
const keyPath = path.join(rootDir, keyFile);
const app = fs.existsSync(keyPath) 
  ? initializeApp({ credential: cert(require(keyPath)) })
  : initializeApp({ projectId: 'hydrotrack-2317' });

const auth = getAuth(app);

async function deleteAllUsers(nextPageToken) {
  const listUsersResult = await auth.listUsers(1000, nextPageToken);
  const uids = listUsersResult.users.map(user => user.uid);
  if (uids.length > 0) {
    const deleteResult = await auth.deleteUsers(uids);
    console.log(`Deleted ${deleteResult.successCount} users`);
  }
  if (listUsersResult.pageToken) {
    await deleteAllUsers(listUsersResult.pageToken);
  } else {
    console.log('Finished deleting all users.');
  }
}

deleteAllUsers().catch(console.error);
