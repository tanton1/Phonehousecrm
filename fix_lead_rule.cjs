const fs = require('fs');
let code = fs.readFileSync('firestore.rules', 'utf8');

const oldFn = `    function isValidLead(data) {
      return isValidId(data.id) &&
             ((!('branchId' in data) || data.branchId == null) || isValidString(data.branchId, 50)) &&
             isValidString(data.name, 100) &&
             isValidString(data.phone, 30) &&
             isValidString(data.source, 50) &&
             data.status in ['new', 'consulting', 'trade_in_evaluating', 'deposit_paid', 'won_sold', 'lost'] &&
             isValidString(data.interestedModel, 100);
    }`;

const newFn = `    function isValidLead(data) {
      return isValidId(data.id) &&
             ((!('branchId' in data) || data.branchId == null) || isValidString(data.branchId, 50)) &&
             isValidString(data.name, 100) &&
             isValidString(data.phone, 30) &&
             isValidString(data.source, 50) &&
             data.status in ['new', 'contacted', 'negotiating', 'deposit', 'won', 'lost'] &&
             isValidString(data.interestedModel, 100);
    }`;

code = code.replace(oldFn, newFn);
fs.writeFileSync('firestore.rules', code);
