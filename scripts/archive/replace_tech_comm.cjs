const fs = require('fs');

let content = fs.readFileSync('src/utils/commissionEngine.ts', 'utf8');

// Insert import if needed
if (!content.includes('TECH_COMMISSION_MATRIX')) {
  content = content.replace(/import \{([\s\S]*?)PayrollLedgerItem\n\} from '\.\.\/types';/, "import {$1PayrollLedgerItem\n} from '../types';\nimport { TECH_COMMISSION_MATRIX, getDeviceGroupForModel } from '../data/techCommissionMatrix';");
}

const newTechFunc = `export function calculateWarrantyTicketCommissions(
  ticket: WarrantyTicket,
  staffList: StaffMember[],
  policies: SalaryPolicy[] = []
): CommissionTransaction[] {
  const transactions: CommissionTransaction[] = [];
  
  // Tìm KTV phụ trách
  const staff = findStaffByIdentifier(ticket.assigneeId || ticket.technician, staffList) 
    || staffList.find(s => s.role === 'TECHNICIAN') 
    || staffList[0];

  const nowStr = ticket.completedDate || ticket.deliveredDate || ticket.receivedDate || new Date().toISOString().replace('T', ' ').slice(0, 19);
  const isCompleted = ticket.status === 'ready' || ticket.status === 'delivered';
  const txStatus: CommissionTransaction['status'] = isCompleted ? 'CONFIRMED' : 'PENDING';

  // 1. Kiểm định KCS nhập kho (INBOUND_QC)
  if (ticket.taskType === 'INBOUND_QC' || ticket.ticketNumber?.startsWith('KCS') || ticket.issueType === 'Khác' && ticket.faultDescription?.includes('KCS')) {
    const kcsCommission = ticket.commissionAmount || 35000;
    transactions.push({
      id: \`COMM-QC-\${ticket.id}\`,
      employeeId: staff.id,
      employeeName: staff.name,
      role: staff.role,
      walletCategory: 'TECH_WALLET',
      orderId: ticket.id,
      orderCode: ticket.ticketNumber || \`KCS-\${ticket.id.slice(-6)}\`,
      productName: \`KCS Kiểm Định: \${ticket.model}\`,
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
      notes: \`Kiểm tra KCS nhập kho đạt tiêu chuẩn QC Phone House\`,
      sourceType: 'WARRANTY_TICKET',
      sourceId: ticket.id
    });
    return transactions;
  }

  // 2. Tính toán sửa chữa dịch vụ theo Ma Trận (Nếu có check techTasks)
  if (ticket.techTasks && ticket.techTasks.length > 0) {
    const groupId = getDeviceGroupForModel(ticket.model);
    
    ticket.techTasks.forEach((taskId, idx) => {
      const taskDef = TECH_COMMISSION_MATRIX.tasks.find(t => t.id === taskId);
      if (taskDef) {
        // rates are keyed by groupId
        const amount = (taskDef.rates as any)[groupId] || 0;
        if (amount > 0) {
          transactions.push({
            id: \`COMM-TECH-\${ticket.id}-\${taskId}\`,
            employeeId: staff.id,
            employeeName: staff.name,
            role: staff.role,
            walletCategory: 'TECH_WALLET',
            orderId: ticket.id,
            orderCode: ticket.ticketNumber || \`BH-\${ticket.id.slice(-6)}\`,
            orderItemId: \`TASK-\${idx + 1}\`,
            productName: \`Sửa chữa: \${taskDef.name} (\${ticket.model})\`,
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
            notes: \`Chi phí nhân công: \${taskDef.name} (\${ticket.model})\`,
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
      id: \`COMM-WR-\${ticket.id}\`,
      employeeId: staff.id,
      employeeName: staff.name,
      role: staff.role,
      walletCategory: 'TECH_WALLET',
      orderId: ticket.id,
      orderCode: ticket.ticketNumber || \`BH-\${ticket.id.slice(-6)}\`,
      productName: \`Bảo Hành Tiêu Chuẩn: \${ticket.model} (\${ticket.issueType})\`,
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
      notes: \`Công bảo hành máy cho khách hàng tiêu chuẩn Phone House\`,
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
    id: \`COMM-REP-\${ticket.id}\`,
    employeeId: staff.id,
    employeeName: staff.name,
    role: staff.role,
    walletCategory: 'TECH_WALLET',
    orderId: ticket.id,
    orderCode: ticket.ticketNumber || \`SC-\${ticket.id.slice(-6)}\`,
    productName: \`Sửa Dịch Vụ: \${ticket.model} (\${ticket.issueType})\`,
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
    notes: \`Hoa hồng sửa chữa theo định mức cũ (Chưa map Matrix)\`,
    sourceType: 'WARRANTY_TICKET',
    sourceId: ticket.id
  });

  return transactions;
}
`;

content = content.replace(/export function calculateWarrantyTicketCommissions\([\s\S]*?return transactions;\n\}/, newTechFunc);

fs.writeFileSync('src/utils/commissionEngine.ts', content);
