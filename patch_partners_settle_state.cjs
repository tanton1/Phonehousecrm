const fs = require('fs');
let code = fs.readFileSync('src/components/PartnersView.tsx', 'utf-8');

code = code.replace(
  "const [settleFundId, setSettleFundId] = useState('');",
  "const [settleFundId, setSettleFundId] = useState('');\n  const [settleDirection, setSettleDirection] = useState<'RECEIPT' | 'PAYMENT'>('RECEIPT');"
);

fs.writeFileSync('src/components/PartnersView.tsx', code, 'utf-8');
