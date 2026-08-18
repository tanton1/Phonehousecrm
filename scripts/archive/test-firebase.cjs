const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  try {
    const col = collection(db, 'devices');
    const snap = await getDocs(col);
    console.log('Docs count:', snap.size);
  } catch (e) {
    console.error('Error:', e.message);
  }
}
run();
