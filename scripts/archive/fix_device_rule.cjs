const fs = require('fs');
let code = fs.readFileSync('firestore.rules', 'utf8');

const oldFn = `    function isValidDevice(data) {
      return isValidId(data.id) &&
             ((!('branchId' in data) || data.branchId == null) || isValidString(data.branchId, 50)) &&
             isValidString(data.model, 100) &&
             data.imei is string && data.imei.matches('^[0-9]{15}$') &&
             isValidString(data.storage, 30) &&
             isValidString(data.color, 50) &&
             data.costPrice is number &&
             data.sellPrice is number &&
             data.status in ['in_stock', 'sold', 'reserved', 'trade_in_pending', 'under_repair'];
    }`;

const newFn = `    function isValidDevice(data) {
      return isValidId(data.id) &&
             ((!('branchId' in data) || data.branchId == null) || isValidString(data.branchId, 50)) &&
             isValidString(data.model, 100) &&
             isValidString(data.imei, 30) &&
             isValidString(data.storage, 30) &&
             isValidString(data.color, 50) &&
             data.buyPrice is number &&
             data.sellPrice is number &&
             data.status in ['in_stock', 'reserved', 'sold', 'warranty', 'repairing'];
    }`;

code = code.replace(oldFn, newFn);
fs.writeFileSync('firestore.rules', code);
