const fs = require('fs');
let code = fs.readFileSync('src/services/firestoreService.ts', 'utf8');

const toReplace = `      INITIAL_CASH_TRANSACTIONS.forEach((tx) => {
        const ref = doc(db, CASH_TRANSACTIONS_COL, tx.id);
        batch.set(ref, cleanDataForFirestore(tx));
      });`;

const replacement = `      INITIAL_CASH_TRANSACTIONS.forEach((tx) => {
        const ref = doc(db, CASH_TRANSACTIONS_COL, tx.id);
        batch.set(ref, cleanDataForFirestore(tx));
      });

      INITIAL_SPARE_PARTS.forEach((part) => {
        const ref = doc(db, SPARE_PARTS_COL, part.id);
        batch.set(ref, cleanDataForFirestore(part));
      });`;

code = code.replace(toReplace, replacement);

const elseToReplace = `      // Check if funds need seeding
      const fundsSnap = await getDocs(collection(db, FUNDS_COL));
      if (fundsSnap.empty) {
        const fundBatch = writeBatch(db);
        INITIAL_FUNDS.forEach((f) => {
          const ref = doc(db, FUNDS_COL, f.id);
          fundBatch.set(ref, cleanDataForFirestore(f));
        });
        await fundBatch.commit();
      }`;

const elseReplacement = `      // Check if funds need seeding
      const fundsSnap = await getDocs(collection(db, FUNDS_COL));
      if (fundsSnap.empty) {
        const fundBatch = writeBatch(db);
        INITIAL_FUNDS.forEach((f) => {
          const ref = doc(db, FUNDS_COL, f.id);
          fundBatch.set(ref, cleanDataForFirestore(f));
        });
        await fundBatch.commit();
      }

      // Check if spare parts need seeding
      const partsSnap = await getDocs(collection(db, SPARE_PARTS_COL));
      if (partsSnap.empty) {
        const partsBatch = writeBatch(db);
        INITIAL_SPARE_PARTS.forEach((p) => {
          const ref = doc(db, SPARE_PARTS_COL, p.id);
          partsBatch.set(ref, cleanDataForFirestore(p));
        });
        await partsBatch.commit();
      }`;

code = code.replace(elseToReplace, elseReplacement);

const importToReplace = `  INITIAL_FUNDS,
  INITIAL_CASH_TRANSACTIONS,
  INITIAL_STORE_SETTINGS`;

const importReplacement = `  INITIAL_FUNDS,
  INITIAL_CASH_TRANSACTIONS,
  INITIAL_STORE_SETTINGS,
  INITIAL_SPARE_PARTS`;

code = code.replace(importToReplace, importReplacement);

fs.writeFileSync('src/services/firestoreService.ts', code);
