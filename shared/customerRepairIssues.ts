export type CustomerRepairIssue = {
  code: string;
  label: string;
  examples: string;
};

export const CUSTOMER_REPAIR_ISSUES: readonly CustomerRepairIssue[] = [
  { code: 'SCREEN_DISPLAY', label: 'Màn hình / cảm ứng', examples: 'Vỡ kính, sọc, chảy mực, ám màu, liệt cảm ứng' },
  { code: 'BATTERY_POWER', label: 'Pin / nguồn', examples: 'Tụt pin, pin phồng, sập nguồn, không lên nguồn' },
  { code: 'CHARGING_PORT', label: 'Sạc / cổng kết nối', examples: 'Không nhận sạc, sạc chậm, chập chờn' },
  { code: 'CAMERA', label: 'Camera / đèn flash', examples: 'Mờ, rung, đen camera, không lấy nét' },
  { code: 'AUDIO', label: 'Loa / mic / âm thanh', examples: 'Mất tiếng, rè, gọi không nghe' },
  { code: 'BUTTON', label: 'Phím bấm / rung', examples: 'Nút nguồn, âm lượng, gạt rung không hoạt động' },
  { code: 'FACE_ID_TOUCH_ID', label: 'Face ID / Touch ID', examples: 'Không nhận diện hoặc lỗi cảm biến sinh trắc' },
  { code: 'NETWORK_SIM', label: 'SIM / sóng / kết nối', examples: 'Mất sóng, không nhận SIM, Wi-Fi hoặc Bluetooth yếu' },
  { code: 'SOFTWARE', label: 'Phần mềm / dữ liệu', examples: 'Treo logo, lỗi iOS, đầy bộ nhớ, cần chuyển dữ liệu' },
  { code: 'HOUSING', label: 'Vỏ / khung / kính lưng', examples: 'Móp, cong, trầy xước hoặc vỡ kính lưng' },
  { code: 'WATER_DAMAGE', label: 'Vào nước / ẩm', examples: 'Rơi nước, hấp hơi camera hoặc có dấu hiệu ẩm' },
  { code: 'OVERHEATING', label: 'Nóng máy / hiệu năng', examples: 'Nóng bất thường, chậm, giật hoặc lag' },
  { code: 'ACCESSORY', label: 'Phụ kiện đi kèm', examples: 'Cáp, củ sạc, tai nghe hoặc phụ kiện kết nối' },
  { code: 'GENERAL_CHECK', label: 'Kiểm tra tổng quát', examples: 'Chưa xác định lỗi, cần kỹ thuật kiểm tra toàn bộ' },
  { code: 'OTHER', label: 'Lỗi khác', examples: 'Mô tả chi tiết tình trạng ở bước tiếp theo' }
] as const;

const issueByCode = new Map(CUSTOMER_REPAIR_ISSUES.map(issue => [issue.code, issue]));

export function customerRepairIssueByCode(value: unknown): CustomerRepairIssue | null {
  return issueByCode.get(String(value || '').trim().toUpperCase()) || null;
}

