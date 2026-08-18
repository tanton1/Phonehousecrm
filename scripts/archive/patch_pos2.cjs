const fs = require('fs');
let code = fs.readFileSync('src/components/POSSalesView.tsx', 'utf-8');

const oldClose1 = `onClick={() => setCreatedInvoiceForPrint(null)}`;
const newClose1 = `onClick={() => { setCreatedInvoiceForPrint(null); resetForm(); }}`;

const oldClose2 = `setCreatedInvoiceForPrint(null);\n                  if (onNavigateToInvoices) onNavigateToInvoices();`;
const newClose2 = `setCreatedInvoiceForPrint(null);\n                  resetForm();\n                  if (onNavigateToInvoices) onNavigateToInvoices();`;

code = code.replace(oldClose1, newClose1);
code = code.replace(oldClose2, newClose2);

const handleAddDevicePattern = `  const handleAddDevice = (device: DeviceItem) => {`;
const resetFormFunc = `  const resetForm = () => {
    setSelectedDevices([]);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomerNotes('');
    setCashGiven(0);
    setPaymentMethod('Chuyển khoản QR');
    setActiveStep(1);
  };
  
  const handleAddDevice = (device: DeviceItem) => {`;

code = code.replace(handleAddDevicePattern, resetFormFunc);

fs.writeFileSync('src/components/POSSalesView.tsx', code, 'utf-8');
