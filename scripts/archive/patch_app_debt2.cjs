const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');

code = code.replace(
  "type: 'DEBT_INCREASE',",
  "type: 'DEBT_INCREASE' as const,"
);
code = code.replace(
  "type: 'DEBT_INCREASE',",
  "type: 'DEBT_INCREASE' as const,"
);

fs.writeFileSync('src/App.tsx', code, 'utf-8');
