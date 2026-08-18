import { 
  SalesInvoice, 
  DeviceItem, 
  FundAccount, 
  WarrantyTicket, 
  AttendanceRecord, 
  StaffMember 
} from '../types';

export interface ExecutiveQueryResult {
  intent: 'SALES_SUMMARY' | 'INVENTORY_STOCK' | 'FUNDS_BALANCE' | 'WARRANTY_STATUS' | 'ATTENDANCE_REPORT' | 'GENERAL_HELP';
  title: string;
  summaryHtml: string;
  rawData?: any;
}

/**
 * Trợ lý Giám Đốc Thông Minh - Phân tích câu hỏi tự nhiên & trích xuất số liệu ERP
 */
export function processExecutiveQuery(
  prompt: string,
  context: {
    invoices?: SalesInvoice[];
    devices?: DeviceItem[];
    funds?: FundAccount[];
    warrantyTickets?: WarrantyTicket[];
    attendanceRecords?: AttendanceRecord[];
    staffMembers?: StaffMember[];
  }
): ExecutiveQueryResult {
  const clean = prompt.trim().toLowerCase();
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. DOANH THU & BÁN HÀNG
  if (
    clean.includes('doanh thu') || 
    clean.includes('doanh số') || 
    clean.includes('bán được') || 
    clean.includes('hôm nay bán') || 
    clean.includes('tiền bán') ||
    clean.includes('hóa đơn')
  ) {
    const invoices = context.invoices || [];
    const validInvoices = invoices.filter(inv => inv.status !== 'cancelled');
    const todayInvoices = validInvoices.filter(inv => (inv.history?.[0]?.time || '').startsWith(todayStr) || (inv.id.includes(todayStr.replace(/-/g, ''))));
    
    const targetList = todayInvoices.length > 0 ? todayInvoices : validInvoices.slice(0, 10);
    const totalRev = targetList.reduce((sum, inv) => sum + (inv.finalAmount || inv.totalAmount || 0), 0);
    const totalDevicesSold = targetList.reduce((sum, inv) => sum + (inv.devices?.length || inv.items?.length || 1), 0);

    const cashAmount = targetList.filter(i => i.paymentMethod === 'Tiền mặt').reduce((s, i) => s + (i.finalAmount || 0), 0);
    const qrAmount = targetList.filter(i => i.paymentMethod === 'Chuyển khoản QR').reduce((s, i) => s + (i.finalAmount || 0), 0);
    const installmentAmount = targetList.filter(i => i.paymentMethod?.includes('Trả góp')).reduce((s, i) => s + (i.finalAmount || 0), 0);

    return {
      intent: 'SALES_SUMMARY',
      title: '📊 BÁO CÁO DOANH THU HỆ THỐNG',
      summaryHtml: `
<b>📊 BÁO CÁO DOANH SỐ BÁN HÀNG</b>
📅 <i>Ngày báo cáo: ${new Date().toLocaleDateString('vi-VN')}</i>

💰 <b>Tổng doanh thu:</b> <code>${totalRev.toLocaleString('vi-VN')} đ</code>
📱 <b>Số lượng máy đã bán:</b> <b>${totalDevicesSold} cây</b>
🧾 <b>Số lượng hóa đơn:</b> <b>${targetList.length} đơn</b>

<b>💳 Cơ cấu thanh toán:</b>
• 💵 Tiền mặt: <code>${cashAmount.toLocaleString('vi-VN')} đ</code>
• 📲 VietQR / Chuyển khoản: <code>${qrAmount.toLocaleString('vi-VN')} đ</code>
• 📑 Trả góp 0% / Cty tài chính: <code>${installmentAmount.toLocaleString('vi-VN')} đ</code>

✨ <i>Hệ thống cập nhật thời gian thực từ các điểm bán lẻ PhoneHouse.</i>
`.trim(),
      rawData: { totalRev, totalDevicesSold, invoiceCount: targetList.length }
    };
  }

  // 2. TỒN KHO & TRA CỨU IMEI
  if (
    clean.includes('kho') || 
    clean.includes('tồn') || 
    clean.includes('còn bao nhiêu') || 
    clean.includes('còn máy') || 
    clean.includes('imei') ||
    clean.includes('16 pro max') ||
    clean.includes('15 pro max') ||
    clean.includes('iphone')
  ) {
    const devices = context.devices || [];
    const inStockDevices = devices.filter(d => d.status === 'in_stock');
    
    // Check if query targets a specific model
    let targetDevices = inStockDevices;
    let filterKeyword = 'Tất cả máy';

    if (clean.includes('16 pro max')) {
      targetDevices = inStockDevices.filter(d => d.model.toLowerCase().includes('16 pro max'));
      filterKeyword = 'iPhone 16 Pro Max';
    } else if (clean.includes('16 pro')) {
      targetDevices = inStockDevices.filter(d => d.model.toLowerCase().includes('16 pro') && !d.model.toLowerCase().includes('max'));
      filterKeyword = 'iPhone 16 Pro';
    } else if (clean.includes('15 pro max')) {
      targetDevices = inStockDevices.filter(d => d.model.toLowerCase().includes('15 pro max'));
      filterKeyword = 'iPhone 15 Pro Max';
    } else if (clean.includes('15 pro')) {
      targetDevices = inStockDevices.filter(d => d.model.toLowerCase().includes('15 pro') && !d.model.toLowerCase().includes('max'));
      filterKeyword = 'iPhone 15 Pro';
    } else if (clean.includes('14 pro max')) {
      targetDevices = inStockDevices.filter(d => d.model.toLowerCase().includes('14 pro max'));
      filterKeyword = 'iPhone 14 Pro Max';
    } else if (clean.includes('13 pro max')) {
      targetDevices = inStockDevices.filter(d => d.model.toLowerCase().includes('13 pro max'));
      filterKeyword = 'iPhone 13 Pro Max';
    }

    const totalVal = targetDevices.reduce((sum, d) => sum + (d.sellPrice || 0), 0);

    const deviceListSnippet = targetDevices.slice(0, 5).map((d, i) => 
      `${i + 1}. <b>${d.model}</b> ${d.storage} (${d.color}) - <code>${(d.sellPrice || 0).toLocaleString('vi-VN')} đ</code> [${d.warehouse || 'Kho Tổng'}]`
    ).join('\n');

    return {
      intent: 'INVENTORY_STOCK',
      title: `📦 TỒN KHO: ${filterKeyword}`,
      summaryHtml: `
<b>📦 BÁO CÁO TỒN KHO THIẾT BỊ</b>
🔍 <b>Phân loại:</b> <code>${filterKeyword}</code>

📱 <b>Số lượng sẵn hàng:</b> <b>${targetDevices.length} cây máy</b>
💵 <b>Tổng giá trị niêm yết:</b> <code>${totalVal.toLocaleString('vi-VN')} đ</code>

<b>📋 Danh sách máy tiêu biểu:</b>
${deviceListSnippet || '<i>Hiện không còn máy sẵn trong kho cho tiêu chí này.</i>'}
${targetDevices.length > 5 ? `\n<i>... và còn ${targetDevices.length - 5} cây máy khác trong kho.</i>` : ''}
`.trim(),
      rawData: { count: targetDevices.length, totalVal }
    };
  }

  // 3. SỐ DƯ QUỸ & DÒNG TIỀN
  if (
    clean.includes('quỹ') || 
    clean.includes('két') || 
    clean.includes('tiền mặt') || 
    clean.includes('tài khoản') || 
    clean.includes('ngân hàng') || 
    clean.includes('số dư')
  ) {
    const funds = context.funds || [];
    const totalBal = funds.reduce((sum, f) => sum + (f.currentBalance || 0), 0);

    const fundsList = funds.map(f => 
      `• <b>${f.name}:</b> <code>${(f.currentBalance || 0).toLocaleString('vi-VN')} đ</code> (${f.type === 'CASH' ? '💵 Tiền mặt' : '🏦 Ngân hàng'})`
    ).join('\n');

    return {
      intent: 'FUNDS_BALANCE',
      title: '💼 BÁO CÁO SỐ DƯ CÁC QUỸ',
      summaryHtml: `
<b>💼 BÁO CÁO SỐ DƯ TÀI CHÍNH CÁC QUỸ</b>
💰 <b>TỔNG SỐ DƯ KHẢ DỤNG:</b> <code>${totalBal.toLocaleString('vi-VN')} đ</code>

<b>Chi tiết từng tài khoản / Két tiền:</b>
${fundsList || '<i>Chưa có dữ liệu quỹ.</i>'}
`.trim(),
      rawData: { totalBalance: totalBal }
    };
  }

  // 4. TIẾN ĐỘ BẢO HÀNH & KỸ THUẬT
  if (
    clean.includes('bảo hành') || 
    clean.includes('sửa chữa') || 
    clean.includes('kỹ thuật') || 
    clean.includes('ktv') || 
    clean.includes('thay màn') || 
    clean.includes('thay pin')
  ) {
    const tickets = context.warrantyTickets || [];
    const activeTickets = tickets.filter(t => t.status !== 'delivered');
    const repairing = tickets.filter(t => t.status === 'repairing').length;
    const inspecting = tickets.filter(t => t.status === 'inspecting').length;
    const waitingParts = tickets.filter(t => t.status === 'waiting_parts').length;
    const ready = tickets.filter(t => t.status === 'ready').length;

    return {
      intent: 'WARRANTY_STATUS',
      title: '🔧 BÁO CÁO PHÒNG KỸ THUẬT & BẢO HÀNH',
      summaryHtml: `
<b>🔧 BÁO CÁO TIẾN ĐỘ SỬA CHỮA & BẢO HÀNH</b>
📋 <b>Tổng phiếu đang xử lý:</b> <b>${activeTickets.length} máy</b>

<b>⚙️ Trạng thái chi tiết:</b>
• 🔍 Đang kiểm định QC: <b>${inspecting} máy</b>
• ⏳ Chờ linh kiện: <b>${waitingParts} máy</b>
• 🛠️ Đang tháo máy sửa chữa: <b>${repairing} máy</b>
• ✅ Đã sửa xong chờ giao khách: <b>${ready} máy</b>
`.trim(),
      rawData: { activeCount: activeTickets.length, ready, repairing }
    };
  }

  // 5. CHẤM CÔNG & NHÂN SỰ
  if (
    clean.includes('chấm công') || 
    clean.includes('nhân viên') || 
    clean.includes('đi làm') || 
    clean.includes('đi muộn') || 
    clean.includes('ai có mặt')
  ) {
    const records = context.attendanceRecords || [];
    const staff = context.staffMembers || [];
    const todayRecords = records.filter(r => r.date === todayStr || r.id?.includes(todayStr));

    const onTimeCount = todayRecords.filter(r => r.status === 'ON_TIME').length;
    const lateCount = todayRecords.filter(r => r.status === 'LATE').length;

    return {
      intent: 'ATTENDANCE_REPORT',
      title: '👥 BÁO CÁO CHẤM CÔNG NHÂN SỰ HÔM NAY',
      summaryHtml: `
<b>👥 BÁO CÁO CHẤM CÔNG NHÂN SỰ HÔM NAY</b>
📅 <i>Ngày: ${new Date().toLocaleDateString('vi-VN')}</i>

👨‍💼 <b>Tổng số nhân sự hệ thống:</b> <b>${staff.length} người</b>
📍 <b>Đã điểm danh hôm nay:</b> <b>${todayRecords.length} lượt</b>
• ✅ Đúng giờ: <b>${onTimeCount} người</b>
• ⚠️ Đi muộn: <b>${lateCount} người</b>
`.trim(),
      rawData: { totalStaff: staff.length, checkedIn: todayRecords.length, lateCount }
    };
  }

  // 6. TRỢ GIÚP MẶC ĐỊNH
  return {
    intent: 'GENERAL_HELP',
    title: '🤖 TRỢ LÝ GIÁM ĐỐC PHONEHOUSE AI',
    summaryHtml: `
<b>🤖 TRỢ LÝ GIÁM ĐỐC PHONEHOUSE AI</b>

Tôi có thể hỗ trợ Ban Giám Đốc tra cứu nhanh các thông tin:
1. 💰 <b>Doanh thu:</b> <i>"Doanh số hôm nay", "Doanh thu chi nhánh Cầu Giấy"</i>
2. 📦 <b>Tồn kho:</b> <i>"Còn bao nhiêu cây 16 Pro Max", "Tồn kho máy 15 Pro"</i>
3. 💼 <b>Sổ quỹ:</b> <i>"Số dư các quỹ tiền mặt", "Số dư ngân hàng"</i>
4. 🔧 <b>Bảo hành:</b> <i>"Tiến độ sửa chữa hôm nay", "Bao nhiêu máy đang sửa"</i>
5. 👥 <b>Nhân sự:</b> <i>"Hôm nay ai đi làm muộn", "Báo cáo chấm công"</i>

🎙️ <i>Bạn có thể bấm giữ micro để gửi <b>tin nhắn thoại</b> bất kỳ lúc nào!</i>
`.trim()
  };
}
