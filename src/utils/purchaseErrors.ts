export function purchaseErrorMessage(error: unknown): string {
  const message = String((error as any)?.message || error || '').trim();
  if (message.includes('PURCHASE_SUPPLIER_LEGACY_BRANCH_REQUIRES_MANAGER')) {
    return 'Nhà cung cấp này là dữ liệu cũ chưa gắn chi nhánh. Vui lòng nhờ Quản lý hoặc Admin xác nhận chi nhánh trước khi nhập hàng.';
  }
  if (message.includes('PURCHASE_SUPPLIER_LEGACY_HISTORY_REVIEW_REQUIRED')) {
    return 'Nhà cung cấp cũ có lịch sử chưa xác định được chi nhánh. Hệ thống chưa ghi phiếu để tránh sai công nợ; Admin cần kiểm tra và gắn đúng chi nhánh.';
  }
  if (message.includes('PURCHASE_SUPPLIER_BRANCH_REQUIRED')) {
    return 'Nhà cung cấp chưa được gắn chi nhánh. Hãy chọn hoặc tạo nhà cung cấp thuộc đúng chi nhánh nhập hàng.';
  }
  if (message.includes('PURCHASE_SUPPLIER_BRANCH_MISMATCH')) {
    return 'Nhà cung cấp thuộc chi nhánh khác. Hãy chọn tài khoản nhà cung cấp của đúng chi nhánh nhập hàng.';
  }
  if (message.includes('PURCHASE_SUPPLIER_ACCOUNT_BRANCH_MISMATCH')) {
    return 'Tài khoản công nợ nhà cung cấp không thuộc chi nhánh đang nhập hàng.';
  }
  return message || 'Không thể tạo phiếu nhập. Không có dữ liệu nào được ghi.';
}
