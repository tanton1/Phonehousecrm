const fs = require('fs');
let code = fs.readFileSync('src/components/POSSalesView.tsx', 'utf-8');

// Change how downPaymentAmount works. Add state for it directly.
const statePattern = "  const [installmentContractCode, setInstallmentContractCode] = useState('');";
const newStates = statePattern + "\n  const [customDownPayment, setCustomDownPayment] = useState<number | null>(null);";
code = code.replace(statePattern, newStates);

const calcPattern = `  // Installment calculations
  const downPaymentAmount = Math.round((finalAmount * downPaymentPercent) / 100);
  const remainingLoan = finalAmount - downPaymentAmount;`;
const newCalc = `  // Installment calculations
  const defaultDownPayment = Math.round((finalAmount * downPaymentPercent) / 100);
  const downPaymentAmount = customDownPayment !== null ? customDownPayment : defaultDownPayment;
  const remainingLoan = finalAmount - downPaymentAmount;`;
code = code.replace(calcPattern, newCalc);

const inputPattern = `                  <input
                    type="number"
                    value={downPaymentAmount}
                    onChange={(e) => setDownPaymentPercent(Math.round((Number(e.target.value) / finalAmount) * 100))}
                    className="w-28 bg-zinc-50 border border-zinc-300 rounded px-2 py-1 text-right text-xs font-mono font-bold text-orange-600"
                  />`;
const newInput = `                  <input
                    type="number"
                    value={downPaymentAmount}
                    onChange={(e) => setCustomDownPayment(Number(e.target.value))}
                    className="w-28 bg-zinc-50 border border-zinc-300 rounded px-2 py-1 text-right text-xs font-mono font-bold text-orange-600"
                  />`;
code = code.replace(inputPattern, newInput);

const resetPattern = `    setPaymentMethod('Chuyển khoản QR');
    setActiveStep(1);
  };`;
const newReset = `    setPaymentMethod('Chuyển khoản QR');
    setActiveStep(1);
    setCustomDownPayment(null);
  };`;
code = code.replace(resetPattern, newReset);

fs.writeFileSync('src/components/POSSalesView.tsx', code, 'utf-8');
