const fs = require('fs');
let code = fs.readFileSync('firestore.rules', 'utf8');

const oldFn = `    function isValidSalesInvoice(data) {
      return isValidId(data.id) &&
             ((!('branchId' in data) || data.branchId == null) || isValidString(data.branchId, 50)) &&
             isValidString(data.orderCode, 100) &&
             isValidString(data.customerName, 100) &&
             isValidString(data.customerPhone, 30) &&
             data.totalAmount is number &&
             data.finalAmount is number &&
             data.paymentMethod in ['cash', 'bank_transfer', 'mpos_card', 'installment_hd_saison'] &&
             data.status in ['completed', 'cancelled'];
    }`;

const newFn = `    function isValidSalesInvoice(data) {
      return isValidId(data.id) &&
             ((!('branchId' in data) || data.branchId == null) || isValidString(data.branchId, 50)) &&
             isValidString(data.customerName, 100) &&
             data.totalAmount is number &&
             data.finalAmount is number &&
             isValidString(data.paymentMethod, 100);
    }`;

code = code.replace(oldFn, newFn);
fs.writeFileSync('firestore.rules', code);
