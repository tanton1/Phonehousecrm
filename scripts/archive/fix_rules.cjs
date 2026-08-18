const fs = require('fs');
let code = fs.readFileSync('firestore.rules', 'utf8');

// The rules became mangled, let's just replace all weird combinations
code = code.replace(/\(\!\(\'branchId\' in request\.resource\.data\) \|\| request\.\(\!\(\'branchId\' in resource\.data\) \|\| resource\.data\.branchId == null\)\)/g, "(!('branchId' in request.resource.data) || request.resource.data.branchId == null)");
code = code.replace(/\(\!\(\'branchId\' in data\) \|\| data\.branchId == null\)/g, "(!('branchId' in data) || data.branchId == null)");

fs.writeFileSync('firestore.rules', code);
