const fs = require('fs');
let code = fs.readFileSync('firestore.rules', 'utf8');

const oldFn = `    function isValidFundAccount(data) {
      return isValidId(data.id) &&
             isValidString(data.name, 150) &&
             data.type in ['CASH', 'BANK', 'OTHER'] &&
             data.currentBalance is number;
    }`;

const newFn = `    function isValidFundAccount(data) {
      return isValidId(data.id) &&
             isValidString(data.name, 150) &&
             data.type in ['CASH', 'BANK', 'POS_CARD', 'INSTALLMENT_CREDIT', 'OTHER'] &&
             data.currentBalance is number;
    }`;

code = code.replace(oldFn, newFn);
fs.writeFileSync('firestore.rules', code);
