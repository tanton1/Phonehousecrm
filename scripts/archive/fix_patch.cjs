const fs = require('fs');
let code = fs.readFileSync('src/components/PartnersView.tsx', 'utf-8');

const oldConfirmSettle = `    const fund = funds.find(f => f.id === settleFundId);
    if (fund) {
      const isReceipt = debtActionPartner.type === 'CUSTOMER';
      const cashTx: import('../types').CashTransaction = {`;

const newConfirmSettle = `    const fund = funds.find(f => f.id === settleFundId);
    if (fund) {
      const isReceipt = settleDirection === 'RECEIPT';
      const cashTx: import('../types').CashTransaction = {`;

code = code.replace(oldConfirmSettle, newConfirmSettle);
fs.writeFileSync('src/components/PartnersView.tsx', code, 'utf-8');
