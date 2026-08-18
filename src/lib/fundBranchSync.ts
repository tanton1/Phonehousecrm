import { StoreBranch, FundAccount } from '../types';

export function syncFundsWithBranches(branches: StoreBranch[], currentFunds: FundAccount[]): {
  updatedFunds: FundAccount[];
  hasChanges: boolean;
} {
  if (!branches || branches.length === 0) {
    return { updatedFunds: currentFunds, hasChanges: false };
  }

  let hasChanges = false;
  const updatedFunds = [...currentFunds];

  // 1. Gắn cờ Quỹ Công Ty / Dùng Chung cho các quỹ chưa có branchId
  updatedFunds.forEach((fund, idx) => {
    if (!fund.branchId || fund.branchId === 'TONG' || fund.id === 'FUND-BANK-TECHCOM' || fund.id === 'FUND-BANK-MB') {
      if (!fund.isCompanyFund) {
        updatedFunds[idx] = { ...fund, isCompanyFund: true };
        hasChanges = true;
      }
    }
  });

  // 2. Đảm bảo mỗi Chi nhánh active có đủ 1 Quỹ TM & 1 Quỹ Ngân hàng (VietQR)
  branches.forEach(branch => {
    if (branch.isActive === false) return;

    // A. Quỹ Tiền Mặt
    const cashFundIndex = updatedFunds.findIndex(
      f => f.branchId === branch.id && f.type === 'CASH'
    );
    const expectedCashName = `Quỹ TM - ${branch.name}`;

    if (cashFundIndex === -1) {
      updatedFunds.push({
        id: `FUND-CASH-${branch.id}`,
        branchId: branch.id,
        isCompanyFund: false,
        name: expectedCashName,
        type: 'CASH',
        currentBalance: 0,
        openingBalance: 0,
        totalIncome: 0,
        totalExpense: 0,
        isActive: true,
        color: 'emerald'
      });
      hasChanges = true;
    } else {
      const currentCash = updatedFunds[cashFundIndex];
      if (currentCash.name !== expectedCashName && !currentCash.name.includes(branch.code)) {
        updatedFunds[cashFundIndex] = {
          ...currentCash,
          name: expectedCashName
        };
        hasChanges = true;
      }
    }

    // B. Quỹ Ngân Hàng (VietQR)
    const bankFundIndex = updatedFunds.findIndex(
      f => f.branchId === branch.id && f.type === 'BANK'
    );

    const bankName = branch.bankAccount?.bankName || 'Techcombank';
    const accountNumber = branch.bankAccount?.accountNumber || '';
    const expectedBankName = accountNumber 
      ? `VietQR ${bankName} (${accountNumber}) - ${branch.name}`
      : `TK Ngân Hàng - ${branch.name}`;

    if (bankFundIndex === -1) {
      updatedFunds.push({
        id: `FUND-BANK-${branch.id}`,
        branchId: branch.id,
        isCompanyFund: false,
        name: expectedBankName,
        type: 'BANK',
        bankName,
        accountNumber,
        currentBalance: 0,
        openingBalance: 0,
        totalIncome: 0,
        totalExpense: 0,
        isActive: true,
        color: 'orange'
      });
      hasChanges = true;
    } else {
      const currentBank = updatedFunds[bankFundIndex];
      if (
        (accountNumber && currentBank.accountNumber !== accountNumber) ||
        (bankName && currentBank.bankName !== bankName)
      ) {
        updatedFunds[bankFundIndex] = {
          ...currentBank,
          bankName,
          accountNumber,
          name: expectedBankName
        };
        hasChanges = true;
      }
    }
  });

  return { updatedFunds, hasChanges };
}
