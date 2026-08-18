const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');

const anchor = `      if (existingPartner) {
        handleUpdatePartner({
          ...existingPartner,
          type: existingPartner.type === 'SUPPLIER' ? 'BOTH' : existingPartner.type, // Nếu đang là NCC mà mua hàng thì thành BOTH
          outstandingDebt: (existingPartner.outstandingDebt || 0) + debtIncrease,
          totalSpent: (existingPartner.totalSpent || 0) + invoice.finalAmount`;
          
const replacement = `      if (existingPartner) {
        const newTx = debtIncrease > 0 ? {
          id: \`TX-\${Date.now().toString().slice(-6)}\`,
          date: new Date().toISOString().split('T')[0],
          type: 'DEBT_INCREASE',
          amount: debtIncrease,
          note: \`Mua trả góp đơn \${invoice.invoiceCode}\`,
          referenceId: invoice.id
        } : null;
        handleUpdatePartner({
          ...existingPartner,
          type: existingPartner.type === 'SUPPLIER' ? 'BOTH' : existingPartner.type, // Nếu đang là NCC mà mua hàng thì thành BOTH
          outstandingDebt: (existingPartner.outstandingDebt || 0) + debtIncrease,
          totalSpent: (existingPartner.totalSpent || 0) + invoice.finalAmount,
          debtTransactions: newTx ? [newTx, ...(existingPartner.debtTransactions || [])] : existingPartner.debtTransactions`;
          
code = code.replace(anchor, replacement);

const anchor2 = `      } else {
        handleAddPartner({
          id: \`PARTNER-\${Date.now()}\`,
          type: 'CUSTOMER',
          name: invoice.customerName,
          phone: phoneToUse,
          outstandingDebt: debtIncrease,
          totalSpent: invoice.finalAmount,
          createdAt: new Date().toISOString()`;

const replacement2 = `      } else {
        const newTx = debtIncrease > 0 ? {
          id: \`TX-\${Date.now().toString().slice(-6)}\`,
          date: new Date().toISOString().split('T')[0],
          type: 'DEBT_INCREASE',
          amount: debtIncrease,
          note: \`Mua trả góp đơn \${invoice.invoiceCode}\`,
          referenceId: invoice.id
        } : null;
        handleAddPartner({
          id: \`PARTNER-\${Date.now()}\`,
          type: 'CUSTOMER',
          name: invoice.customerName,
          phone: phoneToUse,
          outstandingDebt: debtIncrease,
          totalSpent: invoice.finalAmount,
          debtTransactions: newTx ? [newTx] : [],
          createdAt: new Date().toISOString()`;

code = code.replace(anchor2, replacement2);
fs.writeFileSync('src/App.tsx', code, 'utf-8');
