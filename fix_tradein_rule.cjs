const fs = require('fs');
let code = fs.readFileSync('firestore.rules', 'utf8');

const oldFn = `    function isValidTradeInAppraisal(data) {
      return isValidId(data.id) &&
             ((!('branchId' in data) || data.branchId == null) || isValidString(data.branchId, 50)) &&
             isValidString(data.customerName, 100) &&
             isValidString(data.phone, 30) &&
             isValidString(data.oldModel, 100) &&
             data.finalTradeInOffer is number &&
             isValidString(data.targetModel, 100) &&
             data.status in ['pending_inspection', 'customer_accepted', 'completed_swapped', 'customer_rejected'];
    }`;

const newFn = `    function isValidTradeInAppraisal(data) {
      return isValidId(data.id) &&
             ((!('branchId' in data) || data.branchId == null) || isValidString(data.branchId, 50)) &&
             isValidString(data.customerName, 100) &&
             isValidString(data.phone, 30) &&
             isValidString(data.oldModel, 100) &&
             data.estimatedValue is number &&
             isValidString(data.targetNewModel, 100) &&
             data.status in ['pending', 'accepted', 'rejected', 'completed'];
    }`;

code = code.replace(oldFn, newFn);
fs.writeFileSync('firestore.rules', code);
