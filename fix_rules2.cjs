const fs = require('fs');
let rules = fs.readFileSync('firestore.rules', 'utf8');

rules = rules.replace(
  "    function isGlobalAccess() {\n      let role = getUserData().role;\n      return role == 'ADMIN' || role == 'MANAGER';\n    }",
  "    function isGlobalAccess() {\n      let userData = getUserData();\n      return userData != null && (userData.role == 'ADMIN' || userData.role == 'MANAGER');\n    }"
);
rules = rules.replace(
  "    function hasBranchAccess(branchId) {\n      return isGlobalAccess() || getUserData().branchId == branchId;\n    }",
  "    function hasBranchAccess(branchId) {\n      let userData = getUserData();\n      return isGlobalAccess() || (userData != null && userData.branchId == branchId);\n    }"
);

fs.writeFileSync('firestore.rules', rules);
