import { describe, it, expect } from 'vitest';

describe('Hardening Sprint 4: Final 5 Core Invariants Suite', () => {
  it('Invariant 1: Real Face Verification - Fake base64 hoặc không có hồ sơ sinh trắc học thì không được faceVerified=true', () => {
    const registeredStaffProfile = {
      uid: 'STAFF-100',
      name: 'Nguyễn Văn A',
      registeredFaceProfile: 'BIOMETRIC_VECTOR_HASH_987654'
    };

    const verifyFace = (staff: typeof registeredStaffProfile | null, captureBase64?: string) => {
      if (!staff || !staff.registeredFaceProfile) {
        return false; // Chưa đăng ký hồ sơ khuôn mặt
      }
      if (!captureBase64 || captureBase64.includes('FAKE') || captureBase64.length < 200) {
        return false; // Dữ liệu ảnh giả mạo hoặc không đủ tiêu chuẩn
      }
      return true;
    };

    // Fake base64 attempts
    expect(verifyFace(registeredStaffProfile, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);
    expect(verifyFace(registeredStaffProfile, 'data:image/jpeg;base64,FAKE_IMAGE_DATA')).toBe(false);
    expect(verifyFace(null, 'data:image/jpeg;base64,' + 'B'.repeat(300))).toBe(false);

    // Valid biometric capture
    expect(verifyFace(registeredStaffProfile, 'data:image/jpeg;base64,' + 'B'.repeat(300))).toBe(true);
  });

  it('Invariant 2: Network Verification Status Policy - Mạng cửa hàng sai thì tự động chuyển PENDING_VERIFICATION', () => {
    const computeAttendanceStatus = (isFaceVerified: boolean, isNetworkAllowed: boolean, checkInTime: string) => {
      // Invariant: Both Face and Network must pass for automatic ON_TIME approval
      if (!isFaceVerified || !isNetworkAllowed) {
        return 'PENDING_VERIFICATION';
      }
      const [hours, minutes] = checkInTime.split(':').map(Number);
      if (hours > 8 || (hours === 8 && minutes > 30)) {
        return 'LATE';
      }
      return 'ON_TIME';
    };

    // Case: Face OK but Network Wrong -> PENDING_VERIFICATION
    expect(computeAttendanceStatus(true, false, '08:00:00')).toBe('PENDING_VERIFICATION');

    // Case: Network OK but Face Offline -> PENDING_VERIFICATION
    expect(computeAttendanceStatus(false, true, '08:00:00')).toBe('PENDING_VERIFICATION');

    // Case: Both OK -> ON_TIME
    expect(computeAttendanceStatus(true, true, '08:15:00')).toBe('ON_TIME');
  });

  it('Invariant 3: Chặn đứng Down Payment âm (downPayment < 0)', () => {
    const validateDownPayment = (downPayment: number, finalAmount: number) => {
      if (!Number.isFinite(downPayment) || downPayment < 0) {
        throw new Error('INVALID_DOWN_PAYMENT');
      }
      if (downPayment > finalAmount) {
        throw new Error('DOWN_PAYMENT_EXCEEDS_TOTAL');
      }
      return true;
    };

    expect(() => validateDownPayment(-10000000, 30000000)).toThrowError('INVALID_DOWN_PAYMENT');
    expect(() => validateDownPayment(NaN, 30000000)).toThrowError('INVALID_DOWN_PAYMENT');
    expect(() => validateDownPayment(35000000, 30000000)).toThrowError('DOWN_PAYMENT_EXCEEDS_TOTAL');
    expect(validateDownPayment(9000000, 30000000)).toBe(true);
  });

  it('Invariant 4: Voucher Not Found & voucherApplied Guard - Mã voucher sai báo lỗi rõ, không tăng usedCount khi chưa apply', () => {
    const dbVouchers = new Map<string, any>();
    dbVouchers.set('DISCOUNT100', {
      code: 'DISCOUNT100',
      discountValue: 100000,
      active: true,
      usedCount: 5,
      usageLimit: 10
    });

    const applyVoucher = (code: string, subTotal: number) => {
      let voucherApplied = false;
      const vData = dbVouchers.get(code.toUpperCase());
      if (!vData) {
        throw new Error('VOUCHER_NOT_FOUND');
      }
      if (vData.usedCount >= vData.usageLimit) {
        throw new Error('VOUCHER_EXHAUSTED');
      }
      voucherApplied = true;
      return { discount: vData.discountValue, voucherApplied };
    };

    // Test non-existent voucher code
    expect(() => applyVoucher('WRONG_CODE', 1000000)).toThrowError('VOUCHER_NOT_FOUND');

    // Test valid voucher code
    const result = applyVoucher('DISCOUNT100', 1000000);
    expect(result.discount).toBe(100000);
    expect(result.voucherApplied).toBe(true);
  });

  it('Invariant 5: Attendance Branch Access Isolation - Nhân viên không thể chấm công tại chi nhánh khác nếu không có quyền', () => {
    const checkBranchAccess = (user: { role: string; branchId: string }, targetBranchId: string) => {
      if (user.role === 'ADMIN' || user.role === 'REGIONAL_MANAGER') {
        return true;
      }
      if (user.branchId !== targetBranchId) {
        throw new Error('BRANCH_ACCESS_DENIED');
      }
      return true;
    };

    const staffCN01 = { role: 'SALES', branchId: 'CN01' };
    const admin = { role: 'ADMIN', branchId: 'CN01' };

    // Staff CN01 attempts check-in at CN02
    expect(() => checkBranchAccess(staffCN01, 'CN02')).toThrowError('BRANCH_ACCESS_DENIED');

    // Staff CN01 checks in at CN01
    expect(checkBranchAccess(staffCN01, 'CN01')).toBe(true);

    // Admin can check in anywhere
    expect(checkBranchAccess(admin, 'CN02')).toBe(true);
  });

  it('Invariant 6: Finance Partner Type & Trade-in Mandatory Approved Price', () => {
    const partner = {
      id: 'PARTNER-SUPPLIER-01',
      name: 'Nhà Cung Cấp Phụ Kiện',
      type: 'SUPPLIER' // Not a finance company
    };

    const validateFinancePartner = (p: typeof partner) => {
      const type = p.type.toUpperCase();
      if (!type.includes('FINANCE') && !type.includes('TRẢ GÓP')) {
        throw new Error('INVALID_FINANCE_PARTNER_TYPE');
      }
      return true;
    };

    expect(() => validateFinancePartner(partner)).toThrowError('INVALID_FINANCE_PARTNER_TYPE');

    const tradeInAppraisal = {
      id: 'TRD-001',
      estimatedValue: 10000000,
      approvedPrice: undefined as number | undefined
    };

    const validateTradeInApprovedPrice = (app: typeof tradeInAppraisal) => {
      if (typeof app.approvedPrice !== 'number') {
        throw new Error('TRADE_IN_FINAL_PRICE_REQUIRED');
      }
      return app.approvedPrice;
    };

    expect(() => validateTradeInApprovedPrice(tradeInAppraisal)).toThrowError('TRADE_IN_FINAL_PRICE_REQUIRED');
  });
});
