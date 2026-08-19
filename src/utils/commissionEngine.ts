import {
  SalesInvoice,
  WarrantyTicket,
  StaffMember,
  CommissionTransaction,
  SalaryPolicy,
  StaffDualWalletSummary,
  PayrollLedgerItem
} from '../types';
import { getLiveTechCommissionMatrix, getDeviceGroupForModel } from '../data/techCommissionMatrix';
import { INITIAL_STAFF_MEMBERS } from '../data/attendanceData';

/**
 * Helper tìm thông tin nhân viên theo tên hoặc ID hoặc alias
 */
export function findStaffByIdentifier(
  identifier: string | undefined,
  staffList: StaffMember[]
): StaffMember | undefined {
  if (!identifier) return undefined;
  const cleanId = identifier.trim().toLowerCase();

  return staffList.find(s => {
    if (s.id.toLowerCase() === cleanId) return true;
    if (s.code && s.code.toLowerCase() === cleanId) return true;
    if (s.email && s.email.toLowerCase() === cleanId) return true;
    if (s.name.toLowerCase() === cleanId) return true;
    if (s.name.toLowerCase().includes(cleanId) || cleanId.includes(s.name.toLowerCase())) return true;
    return false;
  });
}

/**
 * TÍNH TOÁN HOA HỒNG KỸ THUẬT TỪ PHIẾU BẢO HÀNH / SỬA CHỮA / KCS
 */
export function calculateWarrantyTicketCommissions(
  ticket: WarrantyTicket,
  staffList: StaffMember[],
  policies: SalaryPolicy[] = []
): CommissionTransaction[] {
  const transactions: CommissionTransaction[] = [];
  
  // Tìm KTV phụ trách
  const staff = findStaffByIdentifier(ticket.assigneeId || ticket.technician, staffList) 
    || staffList.find(s => s.role === 'TECHNICIAN') 
    || staffList[0]
    || INITIAL_STAFF_MEMBERS[0];

  const nowStr = ticket.completedDate || ticket.deliveredDate || ticket.receivedDate || new Date().toISOString().replace('T', ' ').slice(0, 19);
  const isCompleted = ticket.status === 'ready' || ticket.status === 'delivered';
  const txStatus: CommissionTransaction['status'] = isCompleted ? 'CONFIRMED' : 'PENDING';

  // 1. Kiểm định KCS nhập kho (INBOUND_QC)
  if (ticket.taskType === 'INBOUND_QC' || ticket.ticketNumber?.startsWith('KCS') || ticket.issueType === 'Khác' && ticket.faultDescription?.includes('KCS')) {
    const kcsCommission = ticket.commissionAmount || 35000;
    transactions.push({
      id: `COMM-QC-${ticket.id}`,
      employeeId: staff.id,
      employeeName: staff.name,
      role: staff.role,
      walletCategory: 'TECH_WALLET',
      orderId: ticket.id,
      orderCode: ticket.ticketNumber || `KCS-${ticket.id.slice(-6)}`,
      productName: `KCS Kiểm Định: ${ticket.model}`,
      imei: ticket.imei,
      branchId: ticket.branchId || staff.branchId || 'BRANCH_1',
      type: 'TECH_KCS',
      baseAmount: ticket.estimatedCost || 35000,
      profitAmount: 35000,
      commissionRate: 100,
      commissionAmount: kcsCommission,
      status: txStatus,
      policyId: 'POL_TECH_2026',
      policyVersion: 'v2.0',
      occurredAt: nowStr,
      approvedAt: isCompleted ? nowStr : undefined,
      notes: `Kiểm tra KCS nhập kho đạt tiêu chuẩn QC Phone House`,
      sourceType: 'WARRANTY_TICKET',
      sourceId: ticket.id
    });
    return transactions;
  }

  // 2. Tính toán sửa chữa dịch vụ theo Ma Trận (Nếu có check techTasks)
  if (ticket.techTasks && ticket.techTasks.length > 0) {
    const groupId = getDeviceGroupForModel(ticket.model);
    const matrix = getLiveTechCommissionMatrix();
    
    ticket.techTasks.forEach((taskId, idx) => {
      const taskDef = matrix.tasks.find(t => t.id === taskId);
      if (taskDef) {
        // rates are keyed by groupId
        const amount = (taskDef.rates as any)[groupId] || 0;
        if (amount > 0) {
          transactions.push({
            id: `COMM-TECH-${ticket.id}-${taskId}`,
            employeeId: staff.id,
            employeeName: staff.name,
            role: staff.role,
            walletCategory: 'TECH_WALLET',
            orderId: ticket.id,
            orderCode: ticket.ticketNumber || `BH-${ticket.id.slice(-6)}`,
            orderItemId: `TASK-${idx + 1}`,
            productName: `Sửa chữa: ${taskDef.name} (${ticket.model})`,
            imei: ticket.imei,
            branchId: ticket.branchId || staff.branchId || 'BRANCH_1',
            type: 'TECH_REPAIR',
            baseAmount: amount, // Flat commission
            profitAmount: amount * 3, // Dummy
            commissionRate: 0,
            commissionAmount: amount,
            status: txStatus,
            policyId: 'POL_TECH_MATRIX_2026',
            policyVersion: 'v3.0',
            occurredAt: nowStr,
            approvedAt: isCompleted ? nowStr : undefined,
            notes: `Chi phí nhân công: ${taskDef.name} (${ticket.model})`,
            sourceType: 'WARRANTY_TICKET',
            sourceId: ticket.id
          });
        }
      }
    });
    
    return transactions;
  }

  // 3. Fallback cho các Phiếu Bảo Hành Miễn Phí (WARRANTY_FREE) cũ (nếu không check techTasks)
  if (ticket.isWarrantyFree || ticket.repairCategory === 'WARRANTY_FREE' || ticket.taskType === 'WARRANTY') {
    const warrantyBonus = ticket.commissionAmount || 50000;
    transactions.push({
      id: `COMM-WR-${ticket.id}`,
      employeeId: staff.id,
      employeeName: staff.name,
      role: staff.role,
      walletCategory: 'TECH_WALLET',
      orderId: ticket.id,
      orderCode: ticket.ticketNumber || `BH-${ticket.id.slice(-6)}`,
      productName: `Bảo Hành Tiêu Chuẩn: ${ticket.model} (${ticket.issueType})`,
      imei: ticket.imei,
      branchId: ticket.branchId || staff.branchId || 'BRANCH_1',
      type: 'TECH_WARRANTY',
      baseAmount: 0,
      profitAmount: 0,
      commissionRate: 100,
      commissionAmount: warrantyBonus,
      status: txStatus,
      policyId: 'POL_TECH_2026',
      policyVersion: 'v2.0',
      occurredAt: nowStr,
      approvedAt: isCompleted ? nowStr : undefined,
      notes: `Công bảo hành máy cho khách hàng tiêu chuẩn Phone House`,
      sourceType: 'WARRANTY_TICKET',
      sourceId: ticket.id
    });
    return transactions;
  }

  // 4. Fallback Sửa chữa dịch vụ cũ
  let repairCommission = ticket.commissionAmount;
  if (!repairCommission || repairCommission <= 0) {
    const issue = ticket.issueType || '';
    if (issue.includes('Pin')) {
      repairCommission = 80000;
    } else if (issue.includes('Màn Hình') || issue.includes('Ép Kính')) {
      repairCommission = 150000;
    } else if (issue.includes('Mainboard') || issue.includes('Face ID')) {
      repairCommission = 200000;
    } else {
      repairCommission = 100000; // Default
    }
  }

  transactions.push({
    id: `COMM-REP-${ticket.id}`,
    employeeId: staff.id,
    employeeName: staff.name,
    role: staff.role,
    walletCategory: 'TECH_WALLET',
    orderId: ticket.id,
    orderCode: ticket.ticketNumber || `SC-${ticket.id.slice(-6)}`,
    productName: `Sửa Dịch Vụ: ${ticket.model} (${ticket.issueType})`,
    imei: ticket.imei,
    branchId: ticket.branchId || staff.branchId || 'BRANCH_1',
    type: 'TECH_REPAIR',
    baseAmount: ticket.finalCost || ticket.estimatedCost || 0,
    profitAmount: (ticket.finalCost || ticket.estimatedCost || 0) * 0.4,
    commissionRate: 0,
    commissionAmount: repairCommission,
    status: txStatus,
    policyId: 'POL_TECH_2026',
    policyVersion: 'v2.0',
    occurredAt: nowStr,
    approvedAt: isCompleted ? nowStr : undefined,
    notes: `Hoa hồng sửa chữa theo định mức cũ (Chưa map Matrix)`,
    sourceType: 'WARRANTY_TICKET',
    sourceId: ticket.id
  });

  return transactions;
}


/**
 * TÍNH TOÁN DOANH SỐ & HOA HỒNG BÁN HÀNG TỪ HÓA ĐƠN POS / CRM
 */
export function calculateInvoiceCommissions(
  invoice: SalesInvoice,
  staffList: StaffMember[],
  policies: SalaryPolicy[] = []
): CommissionTransaction[] {
  const transactions: CommissionTransaction[] = [];
  
  // Tìm nhân viên bán hàng / chốt đơn
  const sellerIdentifier = invoice.sellerName || invoice.salesStaff || invoice.cashier || invoice.creatorName;
  const staff = findStaffByIdentifier(sellerIdentifier, staffList) 
    || staffList.find(s => s.role === 'SALES') 
    || staffList[0]
    || INITIAL_STAFF_MEMBERS[0];

  const nowStr = invoice.createdAt || invoice.createdDate || new Date().toISOString().replace('T', ' ').slice(0, 19);
  const isCancelled = invoice.status === 'cancelled';
  const txStatus: CommissionTransaction['status'] = isCancelled ? 'REVERSED' : 'CONFIRMED';
  const orderCode = invoice.invoiceCode || `HD-${invoice.id.slice(-6)}`;

  const items = invoice.detailedItems || [];
  
  if (items.length > 0) {
    items.forEach((item, idx) => {
      let comm = 0;
      let notes = '';
      const name = (item.name || '').toLowerCase();
      let type: CommissionTransaction['type'] = 'OTHER_BONUS';

      if (item.type === 'phone' || item.type === 'device') {
        type = 'DEVICE_SALE';
        if (name.includes('xả') || name.includes('giảm') || name.includes('clearance')) {
          comm = 30000; notes = `Máy giảm/xả: ${item.name}`;
        } else if (name.includes('mới') || name.includes('new') || name.includes('seal') || name.includes('fullbox')) {
          comm = 50000; notes = `Máy nguyên seal/mới: ${item.name}`;
        } else {
          comm = 100000; notes = `Máy 99%/lướt: ${item.name}`;
        }
      } else if (item.type === 'accessory') {
        type = 'ACCESSORY_SALE';
        if (name.includes('tai nghe') || name.includes('airpods') || name.includes('sạc dự phòng') || name.includes('loa') || name.includes('watch') || name.includes('bộ sạc')) {
          comm = 50000; notes = `Phụ kiện cao cấp: ${item.name}`;
        } else if (name.includes('cường lực') || name.includes('ppf') || name.includes('magsafe') || name.includes('cluc') || name.includes('clcnt') || name.includes('dán')) {
          comm = 20000; notes = `Dịch vụ dán/Bảo vệ: ${item.name}`;
        } else {
          comm = 10000; notes = `Phụ kiện cơ bản: ${item.name}`;
        }
      } else if (item.type === 'tradein' || (item.unitPrice !== undefined && item.unitPrice < 0)) {
        type = 'OTHER_BONUS';
        comm = 50000; notes = `Thưởng thu máy cũ: ${item.name}`;
      } else if (item.type === 'repair' || item.type === 'service') {
        type = 'OTHER_BONUS';
        if ((item.totalPrice || item.unitPrice || 0) >= 300000) {
          comm = 30000; notes = `Nhận sửa chữa >= 300k: ${item.name}`;
        }
      }

      if (comm > 0) {
        transactions.push({
          id: `COMM-INV-${invoice.id}-${idx}`,
          employeeId: staff.id,
          employeeName: staff.name,
          role: staff.role,
          walletCategory: 'SALES_WALLET',
          orderId: invoice.id,
          orderCode: orderCode,
          orderItemId: `ITEM-${idx + 1}`,
          productName: item.name,
          imei: item.imei,
          branchId: invoice.branchId || invoice.branch || staff.branchId || 'BRANCH_1',
          type: type,
          baseAmount: item.totalPrice || item.unitPrice || 0,
          profitAmount: comm * 2, // Arbitrary markup for estimation
          commissionRate: 0, // Flat rate
          commissionAmount: comm,
          status: txStatus,
          policyId: 'POL_SALES_FLAT_2026',
          policyVersion: 'v3.0',
          occurredAt: nowStr,
          approvedAt: nowStr,
          notes: notes,
          sourceType: 'INVOICE',
          sourceId: invoice.id
        });
      }
    });
  } else {
    // Legacy support for invoices without detailed items
    const deviceList = invoice.devices || [];
    if (deviceList.length > 0) {
      deviceList.forEach((dev, idx) => {
        transactions.push({
          id: `COMM-DEV-${invoice.id}-${idx}`,
          employeeId: staff.id,
          employeeName: staff.name,
          role: staff.role,
          walletCategory: 'SALES_WALLET',
          orderId: invoice.id,
          orderCode: orderCode,
          orderItemId: `DEV-${idx + 1}`,
          productName: `${dev.model} ${dev.storage || ''} ${dev.color || ''}`.trim(),
          imei: dev.imei,
          branchId: invoice.branchId || invoice.branch || staff.branchId || 'BRANCH_1',
          type: 'DEVICE_SALE',
          baseAmount: dev.price || invoice.finalAmount,
          profitAmount: 200000,
          commissionRate: 0,
          commissionAmount: 100000, // Default 100k for legacy devices
          status: txStatus,
          policyId: 'POL_SALES_FLAT_2026',
          policyVersion: 'v3.0',
          occurredAt: nowStr,
          approvedAt: nowStr,
          notes: `Máy bốc/99% (Legacy): ${dev.model}`,
          sourceType: 'INVOICE',
          sourceId: invoice.id
        });
      });
    }
  }

  return transactions;
}


/**
 * ĐỒNG BỘ TOÀN DIỆN TẤT CẢ GIAO DỊCH HOA HỒNG TỪ CÁC HÓA ĐƠN & PHIẾU BẢO HÀNH
 */
export function syncCommissionsFromAllSources(
  invoices: SalesInvoice[],
  warrantyTickets: WarrantyTicket[],
  staffList: StaffMember[],
  policies: SalaryPolicy[] = [],
  existingCommissions: CommissionTransaction[] = []
): CommissionTransaction[] {
  const commissionMap = new Map<string, CommissionTransaction>();

  // 1. Giữ lại các giao dịch thủ công hoặc tồn tại trước
  existingCommissions.forEach(comm => {
    commissionMap.set(comm.id, comm);
  });

  // 2. Quét toàn bộ hóa đơn bán hàng
  invoices.forEach(inv => {
    const invComms = calculateInvoiceCommissions(inv, staffList, policies);
    invComms.forEach(c => {
      commissionMap.set(c.id, c);
    });
  });

  // 3. Quét toàn bộ phiếu sửa chữa & KCS
  warrantyTickets.forEach(t => {
    const ticketComms = calculateWarrantyTicketCommissions(t, staffList, policies);
    ticketComms.forEach(c => {
      commissionMap.set(c.id, c);
    });
  });

  // Trả về mảng sắp xếp theo thời gian mới nhất
  return Array.from(commissionMap.values()).sort((a, b) => {
    return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
  });
}

/**
 * TÍNH TOÁN BÁO CÁO PHÂN TÁCH 2 VÍ CHO TỪNG NHÂN SỰ
 */
export function calculateStaffDualWallet(
  staffId: string,
  allCommissions: CommissionTransaction[] = [],
  staffList: StaffMember[] = []
): StaffDualWalletSummary {
  const staff = staffList.find(s => s.id === staffId) || staffList[0];
  const effectiveStaffId = staff?.id || staffId || 'STAFF_001';
  const effectiveStaffName = staff?.name || 'Chuyên viên';
  const staffNameLower = effectiveStaffName.toLowerCase();

  // Lọc các giao dịch thuộc về nhân sự này
  const staffTransactions = (allCommissions || []).filter(c => {
    if (!c) return false;
    if (c.employeeId === effectiveStaffId) return true;
    const empLower = (c.employeeName || '').toLowerCase();
    return empLower && staffNameLower && (empLower.includes(staffNameLower) || staffNameLower.includes(empLower));
  });

  // 1. Phân tách Giao dịch Ví Kỹ Thuật (Tech Wallet)
  const techTxs = staffTransactions.filter(c => 
    c.walletCategory === 'TECH_WALLET' || 
    c.type === 'TECH_REPAIR' || 
    c.type === 'TECH_KCS' || 
    c.type === 'TECH_WARRANTY'
  );

  let kcsCount = 0;
  let kcsAmount = 0;
  let repairCount = 0;
  let repairAmount = 0;
  let warrantyCount = 0;
  let warrantyAmount = 0;
  let tradeInCount = 0;
  let tradeInAmount = 0;

  techTxs.forEach(tx => {
    if (tx.status === 'REVERSED') return;
    if (tx.type === 'TECH_KCS') {
      kcsCount++;
      kcsAmount += tx.commissionAmount;
    } else if (tx.type === 'TECH_REPAIR') {
      repairCount++;
      repairAmount += tx.commissionAmount;
    } else if (tx.type === 'TECH_WARRANTY') {
      warrantyCount++;
      warrantyAmount += tx.commissionAmount;
    } else if (tx.type === 'TRADEIN_BONUS') {
      tradeInCount++;
      tradeInAmount += tx.commissionAmount;
    }
  });

  const totalTechCommission = kcsAmount + repairAmount + warrantyAmount + tradeInAmount;

  // 2. Phân tách Giao dịch Ví Doanh Thu & Bán Hàng (Sales Wallet)
  const salesTxs = staffTransactions.filter(c => 
    c.walletCategory === 'SALES_WALLET' || 
    c.type === 'DEVICE_SALE' || 
    c.type === 'ACCESSORY_SALE' || 
    c.type === 'CARE_PACKAGE' || 
    c.type === 'ONLINE_LEAD_SPLIT' || 
    c.type === 'STORE_CLOSER_SPLIT'
  );

  let totalSalesRevenue = 0;
  let deviceOrderCount = 0;
  let deviceCommission = 0;
  let accessoryOrderCount = 0;
  let accessoryCommission = 0;
  let carePackageCount = 0;
  let carePackageCommission = 0;
  let onlineSplitCommission = 0;

  salesTxs.forEach(tx => {
    if (tx.status === 'REVERSED') return;
    totalSalesRevenue += (tx.baseAmount || 0);

    if (tx.type === 'DEVICE_SALE') {
      deviceOrderCount++;
      deviceCommission += tx.commissionAmount;
    } else if (tx.type === 'ACCESSORY_SALE') {
      accessoryOrderCount++;
      accessoryCommission += tx.commissionAmount;
    } else if (tx.type === 'CARE_PACKAGE') {
      carePackageCount++;
      carePackageCommission += tx.commissionAmount;
    } else if (tx.type === 'ONLINE_LEAD_SPLIT' || tx.type === 'STORE_CLOSER_SPLIT') {
      onlineSplitCommission += tx.commissionAmount;
    }
  });

  const totalSalesCommission = deviceCommission + accessoryCommission + carePackageCommission + onlineSplitCommission;

  return {
    staffId: staff.id,
    staffName: staff.name,
    role: staff.role,
    techWallet: {
      totalCommission: totalTechCommission,
      kcsCount,
      kcsAmount,
      repairCount,
      repairAmount,
      warrantyCount,
      warrantyAmount,
      tradeInCount,
      tradeInAmount,
      completedTicketCount: kcsCount + repairCount + warrantyCount,
      pendingCount: techTxs.filter(t => t.status === 'PENDING').length,
      transactions: techTxs
    },
    salesWallet: {
      totalCommission: totalSalesCommission,
      totalRevenue: totalSalesRevenue,
      completedOrderCount: deviceOrderCount + accessoryOrderCount + carePackageCount,
      deviceOrderCount,
      deviceCommission,
      deviceAmount: deviceCommission,
      accessoryOrderCount,
      accessoryCommission,
      accessoryAmount: accessoryCommission,
      carePackageCount,
      carePackageCommission,
      carePackageAmount: carePackageCommission,
      onlineSplitCommission,
      transactions: salesTxs
    },
    totalGrossCommission: totalTechCommission + totalSalesCommission,
    totalTransactionsCount: staffTransactions.length
  };
}

/**
 * TỰ ĐỘNG SINH CÁC DÒNG SỔ LƯƠNG TỪ CÁC GIAO DỊCH HOA HỒNG
 */
export function generatePayrollLedgersFromCommissions(
  staffId: string,
  commissions: CommissionTransaction[],
  periodMonth: string = '2026-08'
): PayrollLedgerItem[] {
  const walletSummary = calculateStaffDualWallet(staffId, commissions, []);
  const ledgers: PayrollLedgerItem[] = [];

  if (walletSummary.salesWallet.deviceCommission > 0) {
    ledgers.push({
      id: `LEDGER-DEV-${staffId}`,
      employeeId: staffId,
      type: 'COMMISSION_DEVICE',
      title: `Hoa hồng bán máy (${walletSummary.salesWallet.deviceOrderCount} thiết bị)`,
      amount: walletSummary.salesWallet.deviceCommission,
      isAddition: true,
      occurredAt: `${periodMonth}-15`,
      description: `Tự động trích từ ${walletSummary.salesWallet.deviceOrderCount} đơn hàng POS hoàn thành`
    });
  }

  if (walletSummary.salesWallet.accessoryCommission > 0) {
    ledgers.push({
      id: `LEDGER-ACC-${staffId}`,
      employeeId: staffId,
      type: 'COMMISSION_ACCESSORY',
      title: `Hoa hồng phụ kiện & gói VIP (${walletSummary.salesWallet.accessoryOrderCount} món)`,
      amount: walletSummary.salesWallet.accessoryCommission + walletSummary.salesWallet.carePackageCommission,
      isAddition: true,
      occurredAt: `${periodMonth}-15`,
      description: `Hoa hồng 5% phụ kiện và 10% gói bảo hành VIP`
    });
  }

  if (walletSummary.techWallet.totalCommission > 0) {
    ledgers.push({
      id: `LEDGER-TECH-${staffId}`,
      employeeId: staffId,
      type: 'COMMISSION_TECH',
      title: `Hoa hồng kỹ thuật (${walletSummary.techWallet.completedTicketCount} task KCS & sửa chữa)`,
      amount: walletSummary.techWallet.totalCommission,
      isAddition: true,
      occurredAt: `${periodMonth}-15`,
      description: `Ghi nhận từ ${walletSummary.techWallet.kcsCount} máy KCS + ${walletSummary.techWallet.repairCount} ca sửa chữa đạt chuẩn QC`
    });
  }

  return ledgers;
}
