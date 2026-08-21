import {
  SalesInvoice,
  SalesInvoiceItem,
  WarrantyTicket,
  StaffMember,
  CommissionTransaction,
  SalaryPolicy,
  StaffDualWalletSummary,
  PayrollLedgerItem
} from '../types';
import { getLiveTechCommissionMatrix, getDeviceGroupForModel } from '../data/techCommissionMatrix';
import { INITIAL_STAFF_MEMBERS } from '../data/attendanceData';
import { getCachedOperationalConfigs } from '../services/configurationApiClient';

export function calculateSalesCommissionFromTagSnapshots(
  item: SalesInvoiceItem,
  onlineFactor = 1
): { amount: number; percentRate: number } {
  const baseAmount = Math.max(0, item.totalPrice || item.unitPrice || 0);
  const quantity = Math.max(1, Number(item.quantity || 1));
  const tags = item.commissionTags || [];
  const rawAmount = tags.reduce((sum, tag) => sum + (
    tag.calculationType === 'PERCENT' ? baseAmount * tag.value / 100 : tag.value * quantity
  ), 0);
  const percentRate = tags.filter(tag => tag.calculationType === 'PERCENT').reduce((sum, tag) => sum + tag.value, 0);
  return { amount: Math.round(rawAmount * onlineFactor), percentRate: percentRate * onlineFactor };
}

/**
 * Helper tìm thông tin nhân viên theo tên hoặc ID hoặc alias
 */
export function findStaffByIdentifier(
  identifier: string | undefined,
  staffList: StaffMember[] = []
): StaffMember | undefined {
  if (!identifier) return undefined;
  const cleanId = identifier.trim().toLowerCase();

  return (staffList || []).find(s => {
    if (!s?.id || !s?.name) return false;
    const id = s.id.toLowerCase();
    const code = (s.code || '').toLowerCase();
    const email = (s.email || '').toLowerCase();
    const name = s.name.toLowerCase();
    return (
      id === cleanId ||
      code === cleanId ||
      email === cleanId ||
      name === cleanId ||
      name.includes(cleanId) ||
      cleanId.includes(name)
    );
  });
}

/**
 * TÍNH TOÁN HOA HỒNG KỸ THUẬT TỪ PHIẾU BẢO HÀNH / SỬA CHỮA / KCS
 */
export function calculateWarrantyTicketCommissions(
  ticket: WarrantyTicket,
  staffList: StaffMember[] = [],
  policies: SalaryPolicy[] = []
): CommissionTransaction[] {
  const transactions: CommissionTransaction[] = [];
  if (!ticket) return transactions;
  
  // Tìm KTV phụ trách
  const staff = findStaffByIdentifier(ticket.assigneeId || ticket.technician, staffList) 
    || (staffList || []).find(s => s && (s.role === 'TECHNICIAN' || (s.role as string) === 'TECH'));

  if (!staff?.id || !staff?.name) {
    return transactions;
  }

  const nowStr = ticket.completedDate || ticket.deliveredDate || ticket.receivedDate || new Date().toISOString().replace('T', ' ').slice(0, 19);
  const isCompleted = ticket.status === 'ready' || ticket.status === 'delivered';
  const txStatus: CommissionTransaction['status'] = isCompleted ? 'CONFIRMED' : 'PENDING';

  // 1. Kiểm định KCS nhập kho (INBOUND_QC)
  if (ticket.taskType === 'INBOUND_QC' || ticket.ticketNumber?.startsWith('KCS') || (ticket.issueType === 'Khác' && ticket.faultDescription?.includes('KCS'))) {
    const kcsCommission = ticket.commissionAmount || 0;
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
    const warrantyBonus = ticket.commissionAmount || 0;
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

  // Không suy đoán hoa hồng từ loại lỗi. Task phải mang snapshot đơn giá đã cấu hình.
  const repairCommission = ticket.commissionAmount || 0;
  if (repairCommission <= 0) return transactions;

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
  staffList: StaffMember[] = [],
  policies: SalaryPolicy[] = []
): CommissionTransaction[] {
  const transactions: CommissionTransaction[] = [];
  if (!invoice) return transactions;
  
  // Tìm nhân viên bán hàng / chốt đơn
  const sellerIdentifier = invoice.sellerName || invoice.salesStaff || invoice.cashier || invoice.creatorName;
  const staff = findStaffByIdentifier(sellerIdentifier, staffList) 
    || (staffList || []).find(s => s && s.role === 'SALES');

  if (!staff?.id || !staff?.name) {
    return transactions;
  }

  const nowStr = invoice.createdAt || invoice.createdDate || new Date().toISOString().replace('T', ' ').slice(0, 19);
  const isCancelled = invoice.status === 'cancelled';
  const txStatus: CommissionTransaction['status'] = isCancelled ? 'REVERSED' : 'CONFIRMED';
  const orderCode = invoice.invoiceCode || `HD-${invoice.id.slice(-6)}`;
  const salesConfig = getCachedOperationalConfigs().sales;
  if (!salesConfig?.isActive) return transactions;
  const onlineFactor = String(invoice.salesChannel || '').toLowerCase().includes('online')
    ? salesConfig.onlineSaleSplitPercent / 100
    : 1;

  const items = invoice.detailedItems || [];
  
  if (items.length > 0) {
    items.forEach((item, idx) => {
      let comm = 0;
      let notes = '';
      let type: CommissionTransaction['type'] = 'OTHER_BONUS';
      const baseAmount = Math.max(0, item.totalPrice || item.unitPrice || 0);
      let rate = 0;
      let policyId = salesConfig.id;
      let policyVersion = salesConfig.version;

      if (item.type === 'phone' || item.type === 'device') {
        type = 'DEVICE_SALE';
        rate = salesConfig.deviceProfitPercent;
        notes = `Hoa hồng máy theo cấu hình ${salesConfig.name}`;
      } else if (item.type === 'accessory') {
        type = 'ACCESSORY_SALE';
        rate = salesConfig.accessoryProfitPercent;
        notes = `Hoa hồng phụ kiện theo cấu hình ${salesConfig.name}`;
      }
      const tagSnapshots = item.commissionTags || [];
      if (tagSnapshots.length > 0) {
        const tagCommission = calculateSalesCommissionFromTagSnapshots(item, onlineFactor);
        rate = tagCommission.percentRate;
        comm = tagCommission.amount;
        policyId = tagSnapshots[0].policyId;
        policyVersion = tagSnapshots[0].policyVersion;
        notes = `Tag hoa hồng: ${tagSnapshots.map(tag => tag.name).join(', ')}`;
      } else if (!Array.isArray(item.commissionTags)) {
        // Chỉ dùng tỷ lệ nền cho hóa đơn cũ chưa có snapshot tag.
        comm = Math.round(baseAmount * (rate / 100) * onlineFactor);
      } else {
        // Hóa đơn mới có snapshot rỗng nghĩa là loại hàng này không được cấu hình hoa hồng.
        comm = 0;
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
          baseAmount,
          profitAmount: baseAmount,
          commissionRate: tagSnapshots.length > 0 ? rate : rate * onlineFactor,
          commissionAmount: comm,
          status: txStatus,
          policyId,
          policyVersion,
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
          profitAmount: dev.price || invoice.finalAmount,
          commissionRate: salesConfig.deviceProfitPercent * onlineFactor,
          commissionAmount: Math.round((dev.price || invoice.finalAmount) * (salesConfig.deviceProfitPercent / 100) * onlineFactor),
          status: txStatus,
          policyId: salesConfig.id,
          policyVersion: salesConfig.version,
          occurredAt: nowStr,
          approvedAt: nowStr,
          notes: `Hoa hồng máy theo cấu hình ${salesConfig.name}`,
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
  invoices: SalesInvoice[] = [],
  warrantyTickets: WarrantyTicket[] = [],
  staffList: StaffMember[] = [],
  policies: SalaryPolicy[] = [],
  existingCommissions: CommissionTransaction[] = []
): CommissionTransaction[] {
  const validStaff = (staffList || []).filter(s => s && s.id && s.name);
  if (validStaff.length === 0) {
    return existingCommissions || [];
  }

  const commissionMap = new Map<string, CommissionTransaction>();

  // 1. Giữ lại các giao dịch thủ công hoặc tồn tại trước
  (existingCommissions || []).filter(Boolean).forEach(comm => {
    if (comm && comm.id) {
      commissionMap.set(comm.id, comm);
    }
  });

  // 2. Quét toàn bộ hóa đơn bán hàng
  (invoices || []).filter(Boolean).forEach(inv => {
    const invComms = calculateInvoiceCommissions(inv, validStaff, policies);
    invComms.forEach(c => {
      if (c && c.id) commissionMap.set(c.id, c);
    });
  });

  // 3. Quét toàn bộ phiếu sửa chữa & KCS
  (warrantyTickets || []).filter(Boolean).forEach(t => {
    const ticketComms = calculateWarrantyTicketCommissions(t, validStaff, policies);
    ticketComms.forEach(c => {
      if (c && c.id) commissionMap.set(c.id, c);
    });
  });

  // Trả về mảng sắp xếp theo thời gian mới nhất
  return Array.from(commissionMap.values()).sort((a, b) => {
    return new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime();
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
  const staff = (staffList || []).find(s => s && s.id === staffId);
  const effectiveStaffId = staff?.id || staffId || '';
  const effectiveStaffName = (staff as any)?.displayName || staff?.name || 'Chuyên viên';
  const staffNameLower = effectiveStaffName.toLowerCase();

  // Lọc các giao dịch thuộc về nhân sự này
  const staffTransactions = (allCommissions || []).filter(c => {
    if (!c) return false;
    if (c.employeeId === effectiveStaffId) return true;
    const empLower = (c.employeeName || '').toLowerCase();
    return Boolean(empLower && staffNameLower && (empLower.includes(staffNameLower) || staffNameLower.includes(empLower)));
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
    staffId: effectiveStaffId,
    staffName: effectiveStaffName,
    role: (staff?.role || 'SALES') as any,
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
