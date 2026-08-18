const fs = require('fs');
let code = fs.readFileSync('src/services/firestoreService.ts', 'utf8');

const toReplace = `      INITIAL_CASH_TRANSACTIONS,
  INITIAL_SPARE_PARTS.forEach((tx) => {
        const ref = doc(db, CASH_TRANSACTIONS_COL, tx.id);
        batch.set(ref, cleanDataForFirestore(tx));
      });`;

const replacement = `      INITIAL_CASH_TRANSACTIONS.forEach((tx) => {
        const ref = doc(db, CASH_TRANSACTIONS_COL, tx.id);
        batch.set(ref, cleanDataForFirestore(tx));
      });`;

code = code.replace(toReplace, replacement);
fs.writeFileSync('src/services/firestoreService.ts', code);
