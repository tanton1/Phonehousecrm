export interface PayrollHomeBranchResolution {
  branchId: string;
  assignedBranchIds: string[];
  isExplicit: boolean;
  blockingIssue: 'PAYROLL_HOME_BRANCH_REQUIRED' | 'PAYROLL_HOME_BRANCH_INVALID' | null;
}

function normalizedBranchIds(user: Record<string, any>): string[] {
  return [...new Set([
    String(user.branchId || '').trim(),
    ...(Array.isArray(user.assignedBranchIds)
      ? user.assignedBranchIds.map((value: unknown) => String(value || '').trim())
      : [])
  ].filter(Boolean))];
}

/**
 * Resolve the only branch allowed to own a staff payroll run.
 *
 * Single-branch legacy profiles safely fall back to their sole workplace. A
 * multi-branch profile must opt in explicitly; its primary operational branch
 * is returned only as a routing hint so the draft payroll can surface a
 * blocking migration issue instead of silently dropping the employee.
 */
export function resolvePayrollHomeBranch(user: Record<string, any>): PayrollHomeBranchResolution {
  const assignedBranchIds = normalizedBranchIds(user);
  const explicitBranchId = String(user.payrollBranchId || '').trim();
  const primaryBranchId = String(user.branchId || '').trim();

  if (explicitBranchId) {
    if (!assignedBranchIds.includes(explicitBranchId)) {
      return {
        branchId: primaryBranchId || assignedBranchIds[0] || '',
        assignedBranchIds,
        isExplicit: true,
        blockingIssue: 'PAYROLL_HOME_BRANCH_INVALID'
      };
    }
    return {
      branchId: explicitBranchId,
      assignedBranchIds,
      isExplicit: true,
      blockingIssue: null
    };
  }

  if (assignedBranchIds.length === 1) {
    return {
      branchId: assignedBranchIds[0],
      assignedBranchIds,
      isExplicit: false,
      blockingIssue: null
    };
  }

  return {
    branchId: primaryBranchId || assignedBranchIds[0] || '',
    assignedBranchIds,
    isExplicit: false,
    blockingIssue: assignedBranchIds.length > 1
      ? 'PAYROLL_HOME_BRANCH_REQUIRED'
      : 'PAYROLL_HOME_BRANCH_INVALID'
  };
}

export function assertValidPayrollHomeBranch(user: Record<string, any>): string {
  const resolution = resolvePayrollHomeBranch(user);
  if (resolution.blockingIssue || !resolution.branchId) {
    throw new Error(`${resolution.blockingIssue || 'PAYROLL_HOME_BRANCH_INVALID'}: Cần chọn một chi nhánh trả lương chính hợp lệ cho nhân viên.`);
  }
  return resolution.branchId;
}
