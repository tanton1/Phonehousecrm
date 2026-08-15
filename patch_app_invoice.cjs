const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');

const oldHandleCreateInvoice = `  const handleCreateInvoice = (invoice: SalesInvoice) => {
    setInvoices([invoice, ...invoices]);
    addInvoiceToFirestore(invoice);

    // Xử lý công nợ khách hàng nếu là Trả góp/MPOS
    if (invoice.installmentDisbursementStatus === 'PENDING' && invoice.installmentExpectedAmount) {
      const existingPartner = partners.find(p => p.phone === (invoice.customerPhone || invoice.phone));
      if (existingPartner) {
        handleUpdatePartner({
          ...existingPartner,
          outstandingDebt: (existingPartner.outstandingDebt || 0) + invoice.installmentExpectedAmount
        });
      } else if (invoice.customerPhone || invoice.phone) {
        handleAddPartner({
          id: \`PARTNER-\${Date.now()}\`,
          type: 'CUSTOMER',
          name: invoice.customerName,
          phone: invoice.customerPhone || invoice.phone || '',
          outstandingDebt: invoice.installmentExpectedAmount,
          createdAt: new Date().toISOString()
        });
      }
    }
  };`;

const newHandleCreateInvoice = `  const handleCreateInvoice = (invoice: SalesInvoice) => {
    setInvoices([invoice, ...invoices]);
    addInvoiceToFirestore(invoice);

    // Luôn lưu hoặc cập nhật thông tin khách hàng khi phát sinh hóa đơn mới
    const phoneToUse = invoice.customerPhone || invoice.phone || '';
    if (phoneToUse) {
      const existingPartner = partners.find(p => p.phone === phoneToUse);
      const debtIncrease = (invoice.installmentDisbursementStatus === 'PENDING' && invoice.installmentExpectedAmount) ? invoice.installmentExpectedAmount : 0;
      
      if (existingPartner) {
        handleUpdatePartner({
          ...existingPartner,
          type: existingPartner.type === 'SUPPLIER' ? 'BOTH' : existingPartner.type, // Nếu đang là NCC mà mua hàng thì thành BOTH
          outstandingDebt: (existingPartner.outstandingDebt || 0) + debtIncrease,
          totalSpent: (existingPartner.totalSpent || 0) + invoice.finalAmount
        });
      } else {
        handleAddPartner({
          id: \`PARTNER-\${Date.now()}\`,
          type: 'CUSTOMER',
          name: invoice.customerName,
          phone: phoneToUse,
          outstandingDebt: debtIncrease,
          totalSpent: invoice.finalAmount,
          createdAt: new Date().toISOString()
        });
      }
    }
  };`;

code = code.replace(oldHandleCreateInvoice, newHandleCreateInvoice);
fs.writeFileSync('src/App.tsx', code, 'utf-8');
