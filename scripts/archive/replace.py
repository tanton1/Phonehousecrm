import sys

def main():
    with open('src/components/POSSalesView.tsx', 'r') as f:
        content = f.read()

    target = """  const handleCheckout = () => {
    if (selectedDevices.length === 0) {
      alert('Vui lòng chọn ít nhất 1 cây máy để thanh toán!');
      return;
    }
    if (!customerName || !customerPhone) {
      alert('Vui lòng nhập thông tin khách hàng trước khi thanh toán!');
      setShowCustomerModal(true);
      return;
    }

    // THÊM: Tạo CashTransaction để dòng tiền vào Sổ Quỹ
    let receiptAmount = 0;
    let fundTypeToUse: import('../types').PaymentFundType = 'CASH';
    
    if (paymentMethod === 'Trả góp 0% / CCCD') {
      receiptAmount = downPaymentAmount; // Thu tiền trả trước ngay lập tức
      fundTypeToUse = 'CASH'; // Tạm thời mặc định tiền mặt cho khoản trả trước
    } else {
      receiptAmount = finalAmount;
      if (paymentMethod === 'Chuyển khoản QR') fundTypeToUse = 'BANK';
      if (paymentMethod === 'Tiền mặt') fundTypeToUse = 'CASH';
      if (paymentMethod === 'Quẹt thẻ POS') fundTypeToUse = 'POS_CARD';
    }

    if (receiptAmount > 0) {
      const fund = funds.find(f => f.type === fundTypeToUse) || funds[0];
      if (fund) {
        const cashTx: import('../types').CashTransaction = {
          id: `TX-${Date.now()}`,
          code: `PT-${Math.floor(1000 + Math.random() * 9000)}`,
          type: 'RECEIPT',
          category: 'SALES_REVENUE',
          categoryName: 'Thu tiền bán hàng',
          amount: receiptAmount,
          fundType: fund.type,
          fundName: fund.name,
          date: new Date().toLocaleString('sv-SE').replace(' ', 'T'), // YYYY-MM-DDTHH:mm
          partnerName: customerName,
          partnerPhone: customerPhone,
          creator: 'Nhật Tân (Admin)',
          notes: `Thu tiền khách mua hàng (Đơn ${customerPhone})`,
          status: 'COMPLETED'
        };
        onAddTransaction(cashTx);
      }
    }

    const newInvoice: SalesInvoice = {"""
    
    replacement = """  const handleCheckout = () => {
    if (selectedDevices.length === 0) {
      alert('Vui lòng chọn ít nhất 1 cây máy để thanh toán!');
      return;
    }
    if (!customerName || !customerPhone) {
      alert('Vui lòng nhập thông tin khách hàng trước khi thanh toán!');
      setShowCustomerModal(true);
      return;
    }
    if (tradeInDiscount > 0 && !tradeInImei.trim()) {
      alert('Vui lòng nhập IMEI máy thu cũ để nhập kho!');
      setShowDiscountModal(true);
      return;
    }

    let receiptAmount = 0;
    let fundTypeToUse: import('../types').PaymentFundType = 'CASH';
    
    if (paymentMethod === 'Trả góp 0% / CCCD') {
      receiptAmount = downPaymentAmount; // Thu tiền trả trước ngay lập tức
      fundTypeToUse = 'CASH'; // Tạm thời mặc định tiền mặt cho khoản trả trước
    } else {
      receiptAmount = finalAmount;
      if (paymentMethod === 'Chuyển khoản QR') fundTypeToUse = 'BANK';
      if (paymentMethod === 'Tiền mặt') fundTypeToUse = 'CASH';
      if (paymentMethod === 'Quẹt thẻ POS') fundTypeToUse = 'POS_CARD';
    }

    let cashTx: import('../types').CashTransaction | null = null;
    if (receiptAmount > 0) {
      const fund = funds.find(f => f.type === fundTypeToUse) || funds[0];
      if (fund) {
        cashTx = {
          id: `TX-${Date.now()}`,
          code: `PT-${Math.floor(1000 + Math.random() * 9000)}`,
          type: 'RECEIPT',
          category: 'SALES_REVENUE',
          categoryName: 'Thu tiền bán hàng',
          amount: receiptAmount,
          fundType: fund.type,
          fundName: fund.name,
          date: new Date().toLocaleString('sv-SE').replace(' ', 'T'), // YYYY-MM-DDTHH:mm
          partnerName: customerName,
          partnerPhone: customerPhone,
          creator: 'Nhật Tân (Admin)',
          notes: `Thu tiền khách mua hàng (Đơn ${customerPhone})`,
          status: 'COMPLETED'
        };
      }
    }

    const newInvoice: SalesInvoice = {"""
    
    content = content.replace(target, replacement)
    
    target2 = """    // Update status of all devices to sold in Firestore
    selectedDevices.forEach(d => {
      onUpdateDeviceStatus(d.imei, 'sold', customerName, customerPhone);
    });

    // AUTO-INGEST TRADE-IN DEVICE TO INVENTORY
    if (tradeInDiscount > 0 && onAddDevice) {
      const generatedImei = '35' + Math.floor(1000000000000 + Math.random() * 9000000000000).toString();
      const tradeInDevice: DeviceItem = {
        id: `DEV-TRD-${Date.now().toString().slice(-5)}`,
        imei: generatedImei,"""
        
    replacement2 = """    // AUTO-INGEST TRADE-IN DEVICE TO INVENTORY
    let tradeInDevice: DeviceItem | null = null;
    if (tradeInDiscount > 0 && onAddDevice) {
      tradeInDevice = {
        id: `DEV-TRD-${Date.now().toString().slice(-5)}`,
        imei: tradeInImei,"""
        
    content = content.replace(target2, replacement2)
    
    target3 = """      };
      onAddDevice(tradeInDevice);
    }

    onCreateInvoice(newInvoice);
    setCreatedInvoiceForPrint(newInvoice);
  };"""
  
    replacement3 = """      };
    }

    const customerPartner = partners.find(p => p.phone === customerPhone) || null;
    const financeCompanyPartner = installmentCompany 
      ? (partners.find(p => p.name.includes(installmentCompany) || p.phone === installmentCompany) || null)
      : null;

    processCheckoutTransaction({
      invoice: newInvoice,
      devicesToSell: selectedDevices,
      accessoriesToSell: accessories.filter(a => a.selected && a.productRef).map(a => ({ product: a.productRef!, quantity: 1 })),
      cashTx,
      tradeInDevice,
      customerPartner,
      financeCompanyPartner
    }).then(() => {
      setCreatedInvoiceForPrint(newInvoice);
      // local states fallback for UI update feeling
      onCreateInvoice(newInvoice);
      if (cashTx) onAddTransaction(cashTx);
      if (tradeInDevice && onAddDevice) onAddDevice(tradeInDevice);
    }).catch(err => {
      alert('Lỗi thanh toán: ' + (err.message || 'Lỗi không xác định'));
    });
  };"""
  
    content = content.replace(target3, replacement3)
    
    with open('src/components/POSSalesView.tsx', 'w') as f:
        f.write(content)

if __name__ == '__main__':
    main()
