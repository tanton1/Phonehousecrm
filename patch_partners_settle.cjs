const fs = require('fs');
let code = fs.readFileSync('src/components/PartnersView.tsx', 'utf-8');

const oldSettleModalState = `  const [settleAmount, setSettleAmount] = useState(0);
  const [settleFundId, setSettleFundId] = useState('');
  const [settleNote, setSettleNote] = useState('');`;

const newSettleModalState = `  const [settleAmount, setSettleAmount] = useState(0);
  const [settleFundId, setSettleFundId] = useState('');
  const [settleNote, setSettleNote] = useState('');
  const [settleDirection, setSettleDirection] = useState<'RECEIPT' | 'PAYMENT'>('RECEIPT');`;

code = code.replace(oldSettleModalState, newSettleModalState);

const oldHandleOpenSettle = `  const handleOpenDebtSettle = (partner: Partner) => {
    setDebtActionPartner(partner);
    setSettleAmount(partner.outstandingDebt || 0);
    setSettleNote(\`Thanh toán đối soát công nợ ngày \${new Date().toLocaleDateString('vi-VN')}\`);
    setSettleFundId(funds.find(f => f.type === 'BANK')?.id || funds[0]?.id || '');
    setIsDebtModalOpen(true);
  };`;

const newHandleOpenSettle = `  const handleOpenDebtSettle = (partner: Partner) => {
    setDebtActionPartner(partner);
    setSettleAmount(partner.outstandingDebt || 0);
    setSettleNote(\`Thanh toán đối soát công nợ ngày \${new Date().toLocaleDateString('vi-VN')}\`);
    setSettleFundId(funds.find(f => f.type === 'BANK')?.id || funds[0]?.id || '');
    setSettleDirection(partner.type === 'SUPPLIER' ? 'PAYMENT' : 'RECEIPT');
    setIsDebtModalOpen(true);
  };`;

code = code.replace(oldHandleOpenSettle, newHandleOpenSettle);

const oldConfirmSettle = `    // Ghi nhận vào sổ quỹ
    const fund = funds.find(f => f.id === settleFundId);
    if (fund) {
      const isReceipt = debtActionPartner.type === 'CUSTOMER';
      const tx: import('../types').CashTransaction = {
        id: \`TX-\${Date.now()}\`,
        code: \`\${isReceipt ? 'PT' : 'PC'}-\${Math.floor(1000 + Math.random() * 9000)}\`,
        type: isReceipt ? 'RECEIPT' : 'PAYMENT',`;

const newConfirmSettle = `    // Ghi nhận vào sổ quỹ
    const fund = funds.find(f => f.id === settleFundId);
    if (fund) {
      const isReceipt = settleDirection === 'RECEIPT';
      const tx: import('../types').CashTransaction = {
        id: \`TX-\${Date.now()}\`,
        code: \`\${isReceipt ? 'PT' : 'PC'}-\${Math.floor(1000 + Math.random() * 9000)}\`,
        type: isReceipt ? 'RECEIPT' : 'PAYMENT',`;

code = code.replace(oldConfirmSettle, newConfirmSettle);

// Now update the UI to show the radio buttons if type === 'BOTH'
const oldFormFields = `              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Số tiền thanh toán
                </label>`;

const newFormFields = `              {debtActionPartner.type === 'BOTH' && (
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    Loại giao dịch (Khách là NCC & Người mua)
                  </label>
                  <div className="flex space-x-4">
                    <label className="flex items-center space-x-2 text-sm cursor-pointer">
                      <input type="radio" checked={settleDirection === 'RECEIPT'} onChange={() => setSettleDirection('RECEIPT')} className="text-rose-600 focus:ring-rose-500" />
                      <span>Thu tiền (Khách trả nợ)</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm cursor-pointer">
                      <input type="radio" checked={settleDirection === 'PAYMENT'} onChange={() => setSettleDirection('PAYMENT')} className="text-rose-600 focus:ring-rose-500" />
                      <span>Chi tiền (Trả nợ NCC)</span>
                    </label>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Số tiền thanh toán
                </label>`;

code = code.replace(oldFormFields, newFormFields);

fs.writeFileSync('src/components/PartnersView.tsx', code, 'utf-8');
