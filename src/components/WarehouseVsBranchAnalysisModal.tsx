import React, { useState } from 'react';
import {
  Warehouse,
  Store,
  ArrowRight,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Boxes,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Building2,
  Truck,
  CreditCard,
  Coins,
  X,
  Layers,
  Zap,
  BarChart3,
  FileSpreadsheet
} from 'lucide-react';
import { StoreBranch, WarehouseInfo } from '../types';

interface WarehouseVsBranchAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouses?: WarehouseInfo[];
  branches?: StoreBranch[];
}

export const WarehouseVsBranchAnalysisModal: React.FC<WarehouseVsBranchAnalysisModalProps> = ({
  isOpen,
  onClose,
  warehouses = [],
  branches = []
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'goods_flow' | 'cash_flow' | 'matrix' | 'recommendations'>('overview');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full h-[95vh] sm:h-[90vh] max-w-5xl rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-orange-200">

        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#ff4b16] via-[#ff5d36] to-orange-600 px-4 sm:px-6 py-4 flex justify-between items-center text-white shrink-0 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-xs border border-white/30">
              <ArrowLeftRight className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                Phân Tích Cơ Chế: Kho Tổng vs Chi Nhánh
                <span className="text-[10px] bg-white/25 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Chuyên Sâu
                </span>
              </h2>
              <p className="text-xs text-orange-100 font-medium">
                Khác biệt cốt lõi trong luân chuyển hàng hoá (Logistics) và dòng tiền (Cash Flow) chuỗi bán lẻ iPhone
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-orange-100 p-2 hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-zinc-50 border-b border-zinc-200 px-4 sm:px-6 py-2.5 flex items-center space-x-2 overflow-x-auto scrollbar-none shrink-0">
          {[
            { id: 'overview', label: 'Tổng Quan & Sơ Đồ', icon: Layers },
            { id: 'goods_flow', label: 'Luân Chuyển Hàng Hoá', icon: Truck },
            { id: 'cash_flow', label: 'Dòng Tiền & Điều Hòa Quỹ', icon: DollarSign },
            { id: 'matrix', label: 'Bảng Ma Trận So Sánh (10 Tiêu Chí)', icon: FileSpreadsheet },
            { id: 'recommendations', label: 'Quy Trình Chuẩn PhoneHouse', icon: ShieldCheck },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-[#ff4b16] text-white shadow-xs'
                    : 'bg-white text-zinc-600 hover:bg-zinc-200/80 border border-zinc-200/80'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar bg-zinc-50/50">

          {/* TAB 1: TỔNG QUAN & SƠ ĐỒ LIÊN KẾT */}
          {activeTab === 'overview' && (
            <div className="space-y-6">

              {/* Executive Summary Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-orange-100 shadow-xs">
                <h3 className="text-sm sm:text-base font-extrabold text-zinc-900 mb-2 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#ff4b16]" />
                  Tóm Tắt Khác Biệt Cốt Lõi (Core Essence)
                </h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  Trong chuỗi bán lẻ iPhone đa điểm như <strong>PhoneHouse</strong>, <strong>Kho Tổng (Central Warehouse)</strong> là trung tâm tiếp nhận, kiểm định KCS và điều phối nguồn hàng (<strong>Đầu vào chi tiền</strong>), còn <strong>Chi Nhánh / Showroom (Store Branches)</strong> là các điểm tiếp xúc khách hàng, trưng bày và tạo ra doanh thu trực tiếp (<strong>Đầu ra thu tiền</strong>). Việc tách bạch rõ ràng giúp kiểm soát chặt chẽ từng số IMEI, tránh thất thoát và tối ưu hóa vòng quay tiền mặt.
                </p>
              </div>

              {/* Visual Flow Diagram */}
              <div className="bg-white rounded-3xl p-5 border border-zinc-200/80 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
                    Sơ Đồ Kiến Trúc Luồng Hàng & Dòng Tiền Chuỗi PhoneHouse
                  </span>
                  <div className="flex items-center space-x-3 text-[11px]">
                    <span className="flex items-center space-x-1 font-bold text-orange-600">
                      <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
                      <span>Luồng Hàng Hoá (IMEI)</span>
                    </span>
                    <span className="flex items-center space-x-1 font-bold text-orange-600">
                      <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
                      <span>Luồng Tiền Mặt & Chuyển Khoản</span>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative items-center">

                  {/* Step 1: Nhà Cung Cấp */}
                  <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 text-white rounded-2xl p-4 border border-zinc-700 shadow-md space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded-full border border-orange-500/30">Nguồn Cung</span>
                      <Building2 className="w-4 h-4 text-orange-400" />
                    </div>
                    <div className="font-extrabold text-sm text-white">Nhà Cung Cấp (NCC)</div>
                    <p className="text-[11px] text-zinc-300">FPT Synnex, Digiworld, Đầu mối xách tay LL/A, Khách thu cũ đổi mới.</p>
                    <div className="pt-2 border-t border-zinc-700 text-[10px] text-orange-300 font-mono flex items-center justify-between">
                      <span>Cung cấp số lượng lớn</span>
                      <span>Nhận thanh toán sỉ</span>
                    </div>
                  </div>

                  {/* Step 2: Kho Tổng */}
                  <div className="bg-gradient-to-br from-orange-50 to-orange-50 rounded-2xl p-4 border-2 border-orange-300 shadow-md space-y-2 relative">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-[#ff4b16] text-white rounded-full">Hub Trung Tâm</span>
                      <Warehouse className="w-4 h-4 text-[#ff4b16]" />
                    </div>
                    <div className="font-black text-sm text-zinc-900">Kho Phân Phối Tổng</div>
                    <p className="text-[11px] text-zinc-600">Kiểm tra QC 28 bước, dán tem mã vạch IMEI K80, lưu kho số lượng lớn, chi tiền thanh toán NCC.</p>
                    <div className="pt-2 border-t border-orange-200 text-[10px] font-bold text-[#ff4b16] flex items-center justify-between">
                      <span>⚡ Chi tiền từ Quỹ Tổng</span>
                      <span>📦 Xuất điều chuyển</span>
                    </div>
                  </div>

                  {/* Step 3: Các Chi Nhánh */}
                  <div className="bg-gradient-to-br from-orange-50 to-orange-50 rounded-2xl p-4 border border-orange-300 shadow-md space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-orange-600 text-white rounded-full">Điểm Bán POS</span>
                      <Store className="w-4 h-4 text-orange-600" />
                    </div>
                    <div className="font-black text-sm text-zinc-900">Chi Nhánh Showroom</div>
                    <p className="text-[11px] text-zinc-600">Trưng bày máy, tiếp khách lẻ, quẹt thẻ POS / QR / Tiền mặt, kết ca nộp tiền về Quỹ Tổng.</p>
                    <div className="pt-2 border-t border-orange-200 text-[10px] font-bold text-orange-700 flex items-center justify-between">
                      <span>💰 Thu tiền khách 100%</span>
                      <span>🔄 Nộp tiền cuối ngày</span>
                    </div>
                  </div>

                </div>

                {/* Legend & Mechanics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="bg-orange-50/60 rounded-xl p-3 border border-orange-200 text-xs space-y-1">
                    <div className="font-bold text-orange-900 flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-orange-600" />
                      <span>Luồng Hàng Hoá (Vật Lý)</span>
                    </div>
                    <p className="text-zinc-600 text-[11px]">
                      NCC ➔ <strong>Kho Tổng</strong> (Nhập lô, gán mã IMEI) ➔ <strong>Chi Nhánh</strong> (Xuất phiếu điều chuyển, nhận quầy) ➔ <strong>Khách Mua</strong> (Xuất hóa đơn bán lẻ, trừ tồn).
                    </p>
                  </div>

                  <div className="bg-orange-50/60 rounded-xl p-3 border border-orange-200 text-xs space-y-1">
                    <div className="font-bold text-orange-900 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-orange-600" />
                      <span>Luồng Dòng Tiền (Tài Chính)</span>
                    </div>
                    <p className="text-zinc-600 text-[11px]">
                      <strong>Khách Trả Tiền</strong> tại Chi Nhánh ➔ Chi Nhánh <strong>nộp tiền về Quỹ Tổng</strong> ➔ Quỹ Tổng <strong>chi trả cho Nhà Cung Cấp</strong> (Gối đầu/Tất toán công nợ).
                    </p>
                  </div>
                </div>

              </div>

              {/* Quick 2 Column Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Kho Card */}
                <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-xs space-y-3">
                  <div className="flex items-center space-x-2 text-orange-600 font-extrabold text-sm border-b border-zinc-100 pb-2">
                    <Warehouse className="w-4 h-4 text-[#ff4b16]" />
                    <span>Đặc Trưng Kho Lưu Hàng Hoá (Warehouse)</span>
                  </div>
                  <ul className="text-xs text-zinc-600 space-y-2">
                    <li className="flex items-start space-x-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
                      <span><strong>Không tiếp khách bán lẻ:</strong> Địa điểm bảo mật, an ninh cao, trang bị camera giám sát 24/7 để chống thất thoát.</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
                      <span><strong>Quản lý tồn kho khối lượng lớn:</strong> Chứa hàng nghìn máy iPhone đủ dòng (11 đến 16 Pro Max), linh phụ kiện.</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
                      <span><strong>Kiểm định kỹ thuật chuyên sâu (KCS/QC):</strong> Kiểm tra pin, màn hình, iCloud, áp suất, camera trước khi cho phép xuất về showroom.</span>
                    </li>
                  </ul>
                </div>

                {/* Chi nhánh Card */}
                <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-xs space-y-3">
                  <div className="flex items-center space-x-2 text-orange-600 font-extrabold text-sm border-b border-zinc-100 pb-2">
                    <Store className="w-4 h-4 text-orange-600" />
                    <span>Đặc Trưng Chi Nhánh / Showroom (Branch)</span>
                  </div>
                  <ul className="text-xs text-zinc-600 space-y-2">
                    <li className="flex items-start space-x-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
                      <span><strong>Vị trí đắc địa mặt phố:</strong> Showroom sang trọng, bàn trải nghiệm, tư vấn viên chăm sóc khách hàng.</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
                      <span><strong>Định mức tồn kho an toàn (Buffer Stock):</strong> Chỉ giữ từ 15 - 50 máy hot nhất để tối ưu diện tích và giảm rủi ro mất mát.</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
                      <span><strong>Đầu mối thu tiền mặt & POS:</strong> Tiếp nhận doanh thu trực tiếp từ khách hàng cuối, xử lý hồ sơ trả góp ngân hàng.</span>
                    </li>
                  </ul>
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: LUÂN CHUYỂN HÀNG HÓA */}
          {activeTab === 'goods_flow' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-5 border border-zinc-200 shadow-xs space-y-4">
                <h3 className="text-sm sm:text-base font-extrabold text-zinc-900 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-orange-600" />
                  Quy Trình 4 Cấp Độ Luân Chuyển Hàng Hóa (Stock Transfer Protocols)
                </h3>

                <div className="space-y-3">
                  {/* Luồng 1 */}
                  <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-zinc-900 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[11px]">1</span>
                        Nhập Hàng Sỉ Tập Trung (Inbound Procurement)
                      </span>
                      <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">NCC ➔ Kho Tổng</span>
                    </div>
                    <p className="text-xs text-zinc-600">
                      Toàn bộ đơn hàng sỉ (ví dụ: lô 50 cây iPhone 16 Pro Max từ FPT hoặc lô 30 cây 99% xách tay) được tập kết thẳng về <strong>Kho Tổng</strong>. Tại đây, thủ kho quét toàn bộ số IMEI, nhập thông số kỹ thuật (Pin, Màn, iCloud) và in tem mã vạch K80 dán lên máy.
                    </p>
                  </div>

                  {/* Luồng 2 */}
                  <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-zinc-900 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[11px]">2</span>
                        Cấp Hàng Định Kỳ Cho Showroom (Store Replenishment)
                      </span>
                      <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">Kho Tổng ➔ Chi Nhánh</span>
                    </div>
                    <p className="text-xs text-zinc-600">
                      Mỗi sáng hoặc khi tồn kho tại showroom chạm mức tối thiểu, hệ thống tạo <strong>Phiếu Chuyển Kho (Transfer Slip)</strong>. Nhân viên giao vận chuyển máy đến chi nhánh; Cửa hàng trưởng chi nhánh quét mã IMEI xác nhận trên hệ thống để chuyển quyền sở hữu tồn kho.
                    </p>
                  </div>

                  {/* Luồng 3 */}
                  <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-zinc-900 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[11px]">3</span>
                        Điều Chuyển Ngang Ứng Cứu (Inter-Branch Balancing)
                      </span>
                      <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">Chi Nhánh A ⇄ Chi Nhánh B</span>
                    </div>
                    <p className="text-xs text-zinc-600">
                      Khi khách hàng tại <em>PhoneHouse Cầu Giấy</em> muốn lấy ngay 1 cây iPhone 16 Pro 256GB Desert mà chi nhánh đang hết, hệ thống kiểm tra thấy <em>PhoneHouse Đống Đa</em> còn tồn 2 cây. Lệnh điều chuyển ngang được kích hoạt để ship máy qua cho khách trong 30 phút mà không cần đợi nhập từ Kho Tổng.
                    </p>
                  </div>

                  {/* Luồng 4 */}
                  <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-zinc-900 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-[11px]">4</span>
                        Thu Hồi Bảo Hành & Thu Cũ (Reverse Logistics / RMA)
                      </span>
                      <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-bold">Chi Nhánh ➔ Kho / Trung Tâm Kỹ Thuật</span>
                    </div>
                    <p className="text-xs text-zinc-600">
                      Máy khách mang đến bảo hành hoặc máy tiếp nhận từ chương trình Thu Cũ Đổi Mới tại showroom được lập phiếu điều chuyển ngược về Kho Trung Tâm để kỹ thuật viên thẩm định chuyên sâu hoặc gửi sang Hãng đổi máy mới.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DÒNG TIỀN & ĐIỀU HÒA QUỸ */}
          {activeTab === 'cash_flow' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-5 border border-zinc-200 shadow-xs space-y-4">
                <h3 className="text-sm sm:text-base font-extrabold text-zinc-900 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-orange-600" />
                  Cơ Chế Dòng Tiền & Quy Tắc Quản Trị Quỹ (Cash Flow Logistics)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Dòng Tiền Ra */}
                  <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center space-x-2 text-rose-700 font-extrabold text-xs">
                      <TrendingDown className="w-4 h-4" />
                      <span>DÒNG TIỀN RA (Outflow - Tập trung tại Kho/Tổng)</span>
                    </div>
                    <ul className="text-xs text-zinc-700 space-y-1.5">
                      <li>• <strong>Thanh toán tiền hàng cho NCC:</strong> Chi từ 80% - 90% ngân sách qua tài khoản ngân hàng doanh nghiệp (Quỹ Techcombank/MBBank).</li>
                      <li>• <strong>Chi phí kho vận & KCS:</strong> Tem nhãn, hộp phụ kiện, cước chuyển phát nhanh nội thành.</li>
                      <li>• <strong>Chính sách công nợ gối đầu:</strong> Theo dõi hạn nợ với NCC để giữ uy tín và hưởng chiết khấu sản lượng.</li>
                    </ul>
                  </div>

                  {/* Dòng Tiền Vào */}
                  <div className="bg-orange-50/70 border border-orange-200 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center space-x-2 text-orange-700 font-extrabold text-xs">
                      <TrendingUp className="w-4 h-4" />
                      <span>DÒNG TIỀN VÀO (Inflow - Tập trung tại Chi Nhánh)</span>
                    </div>
                    <ul className="text-xs text-zinc-700 space-y-1.5">
                      <li>• <strong>Thu tiền bán lẻ trực tiếp:</strong> Tiền mặt tại quầy, chuyển khoản VietQR tĩnh/động, quẹt thẻ POS mPOS/VNPAY.</li>
                      <li>• <strong>Thu tiền cọc đơn đặt trước:</strong> Nhận cọc giữ máy khi model hot mới ra mắt.</li>
                      <li>• <strong>Giải ngân trả góp:</strong> Nhận tiền chuyển từ các đơn vị tài chính (HD Saison, Home Credit, thẻ tín dụng).</li>
                    </ul>
                  </div>

                </div>

                {/* Cash Sweep Protocol */}
                <div className="bg-orange-50/80 border border-orange-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center space-x-2 text-orange-800 font-extrabold text-xs">
                    <Coins className="w-4 h-4 text-orange-600" />
                    <span>Quy Tắc Điều Hòa Quỹ & Chốt Ca Cuối Ngày (Cash Sweeping Mechanism)</span>
                  </div>
                  <p className="text-xs text-zinc-700 leading-relaxed">
                    Để hạn chế tối đa rủi ro mất cắp tiền mặt tại showroom và đảm bảo luôn có sẵn thanh khoản nhập hàng mới, chuỗi PhoneHouse áp dụng cơ chế <strong>"Quỹ Tiền Mặt Định Mức (Petty Cash Float)"</strong>:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div className="bg-white p-3 rounded-xl border border-orange-200">
                      <div className="font-bold text-zinc-900">1. Giữ Quỹ Lẻ Cố Định</div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">Mỗi quầy thu ngân chỉ giữ <strong>2.000.000 đ - 5.000.000 đ</strong> để trả lại tiền thừa và chi tiêu vặt.</div>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-orange-200">
                      <div className="font-bold text-zinc-900">2. Kết Ca 21h30 Hàng Ngày</div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">Toàn bộ tiền mặt vượt hạn mức được nộp vào máy CDM / chuyển khoản về <strong>Quỹ Tổng Công Ty</strong>.</div>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-orange-200">
                      <div className="font-bold text-zinc-900">3. Vòng Quay Vốn Nhanh</div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">Tiền về Quỹ Tổng lập tức được dùng để thanh toán lô máy mới, đạt vòng quay vốn từ <strong>7 - 12 ngày/lô</strong>.</div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 4: MA TRẬN 10 TIÊU CHÍ */}
          {activeTab === 'matrix' && (
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-xs overflow-hidden">
              <div className="p-4 bg-zinc-50 border-b border-zinc-200 flex justify-between items-center">
                <span className="font-extrabold text-xs text-zinc-900">Ma Trận So Sánh Chi Tiết 10 Tiêu Chí Quản Trị</span>
                <span className="text-[11px] text-zinc-500 font-medium">Cập nhật theo chuẩn ERP bán lẻ</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-100/80 text-zinc-700 font-black border-b border-zinc-200">
                    <tr>
                      <th className="p-3 w-1/4">Tiêu Chí Quản Lý</th>
                      <th className="p-3 w-[37.5%] bg-orange-50/50 text-[#ff4b16]">🏢 Kho Lưu Hàng Hoá (Warehouse)</th>
                      <th className="p-3 w-[37.5%] bg-orange-50/50 text-orange-700">🏪 Chi Nhánh Showroom (Branch)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 text-zinc-700 font-medium">
                    <tr>
                      <td className="p-3 font-bold text-zinc-900">1. Mục đích cốt lõi</td>
                      <td className="p-3 bg-orange-50/20">Lưu trữ tập trung, kiểm định KCS, đóng gói, điều phối logistic.</td>
                      <td className="p-3 bg-orange-50/20">Trưng bày máy mẫu, tư vấn bán hàng, chốt đơn POS, dịch vụ sau bán.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-zinc-900">2. Nguồn hàng tiếp nhận</td>
                      <td className="p-3 bg-orange-50/20">Nhà cung cấp sỉ (FPT, DGW, Apple Authorized), Đại lý lớn.</td>
                      <td className="p-3 bg-orange-50/20">Nhận điều chuyển từ Kho Tổng hoặc máy Thu Cũ từ khách lẻ.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-zinc-900">3. Quy mô tồn kho (Stock Depth)</td>
                      <td className="p-3 bg-orange-50/20">Lớn (Vài trăm đến hàng nghìn máy, đa dạng toàn bộ dải model).</td>
                      <td className="p-3 bg-orange-50/20">Nhỏ gọn (15 - 50 máy hot, đáp ứng nhu cầu bán trong 2-3 ngày).</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-zinc-900">4. Quản lý định danh IMEI</td>
                      <td className="p-3 bg-orange-50/20">Nhập danh sách IMEI hàng loạt, in dán tem mã vạch K80 lên hộp.</td>
                      <td className="p-3 bg-orange-50/20">Quét barcode súng scan khi bán và gán trực tiếp vào Hóa đơn khách.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-zinc-900">5. Dòng tiền Vào (Doanh thu)</td>
                      <td className="p-3 bg-orange-50/20">Gần như 0 (Không bán lẻ thu tiền trực tiếp).</td>
                      <td className="p-3 bg-orange-50/20"><strong>100% doanh thu chuỗi</strong> (Tiền mặt, quẹt thẻ POS, trả góp).</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-zinc-900">6. Dòng tiền Ra (Chi phí)</td>
                      <td className="p-3 bg-orange-50/20"><strong>Chi tiền vốn lớn nhất</strong> (Thanh toán đơn hàng sỉ NCC).</td>
                      <td className="p-3 bg-orange-50/20">Chi phí vận hành điểm bán nhỏ (điện nước, trà nước khách, ship hỏa tốc).</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-zinc-900">7. Hạch toán Quỹ tiền</td>
                      <td className="p-3 bg-orange-50/20">Liên kết trực tiếp với Quỹ Tài Khoản Ngân Hàng Công Ty (Techcombank/MB).</td>
                      <td className="p-3 bg-orange-50/20">Quỹ Tiền Mặt Chi Nhánh (Két sắt cửa hàng) + Thiết bị POS quẹt thẻ.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-zinc-900">8. Rủi ro chính</td>
                      <td className="p-3 bg-orange-50/20">Rủi ro đọng vốn, trượt giá dòng máy cũ, cháy nổ, bảo quản độ ẩm pin.</td>
                      <td className="p-3 bg-orange-50/20">Rủi ro thiếu hàng tức thời, sai sót tiền mặt thu ngân, trộm cắp quầy.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-zinc-900">9. Nhân sự phụ trách</td>
                      <td className="p-3 bg-orange-50/20">Thủ kho, Kỹ thuật viên KCS phần cứng, Nhân viên đóng gói vận đơn.</td>
                      <td className="p-3 bg-orange-50/20">Cửa hàng trưởng, Chuyên viên bán hàng (Sales), Thu ngân, Bảo vệ.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-zinc-900">10. Chỉ số đo lường (KPI)</td>
                      <td className="p-3 bg-orange-50/20">Độ chính xác tồn kho 100%, Tốc độ xuất kho &lt; 15p, Tỷ lệ lỗi KCS &lt; 0.5%.</td>
                      <td className="p-3 bg-orange-50/20">Doanh số/ngày, Tỷ lệ chốt đơn (Conversion Rate), Đánh giá hài lòng (CSAT).</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: KHUYẾN NGHỊ VẬN HÀNH */}
          {activeTab === 'recommendations' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-5 border border-zinc-200 shadow-xs space-y-4">
                <h3 className="text-sm sm:text-base font-extrabold text-zinc-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#ff4b16]" />
                  Bộ Quy Tắc Vận Hành Chuẩn Chuỗi Cửa Hàng PhoneHouse
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-orange-50/40 rounded-xl p-3.5 border border-orange-200 space-y-1.5">
                    <div className="font-bold text-orange-950 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#ff4b16]" />
                      <span>1. Nhập hàng luôn gắn với IMEI định danh</span>
                    </div>
                    <p className="text-zinc-600 text-[11px] leading-relaxed">
                      Tuyệt đối không nhập máy iPhone theo số lượng chung. Mọi máy đều phải có đúng 15 số IMEI để hệ thống quản lý lịch sử giá nhập, xuất xứ, thời gian lưu kho và theo dõi bảo hành trọn đời.
                    </p>
                  </div>

                  <div className="bg-orange-50/40 rounded-xl p-3.5 border border-orange-200 space-y-1.5">
                    <div className="font-bold text-orange-950 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                      <span>2. Chuyển kho phải có 2 bên xác nhận</span>
                    </div>
                    <p className="text-zinc-600 text-[11px] leading-relaxed">
                      Khi kho xuất hàng, trạng thái phiếu là <em>IN_TRANSIT (Đang vận chuyển)</em>. Chỉ khi Cửa hàng trưởng chi nhánh đích kiểm đếm đúng số IMEI và bấm <em>COMPLETED (Đã nhận)</em> thì máy mới chính thức ghi nhận vào tồn kho chi nhánh.
                    </p>
                  </div>

                  <div className="bg-orange-50/40 rounded-xl p-3.5 border border-orange-200 space-y-1.5">
                    <div className="font-bold text-orange-950 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                      <span>3. Kiểm kê đối soát hàng ngày (Daily Audit)</span>
                    </div>
                    <p className="text-zinc-600 text-[11px] leading-relaxed">
                      Cuối mỗi ngày trước khi đóng cửa, nhân viên chi nhánh dùng súng barcode bắn lại toàn bộ máy có mặt trong tủ trưng bày, so khớp với số lượng trên phần mềm để phát hiện lệch số ngay trong ngày.
                    </p>
                  </div>

                  <div className="bg-rose-50/40 rounded-xl p-3.5 border border-rose-200 space-y-1.5">
                    <div className="font-bold text-rose-950 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      <span>4. Minh bạch công nợ & luồng thanh toán</span>
                    </div>
                    <p className="text-zinc-600 text-[11px] leading-relaxed">
                      Mỗi lần nhập lô hàng từ NCC, chọn rõ phương thức: Trừ tiền quỹ trực tiếp hoặc Ghi nhận nợ NCC. Điều này giúp báo cáo tài chính Sổ Quỹ & Công Nợ luôn tự động cân đối chuẩn xác.
                    </p>
                  </div>
                </div>

                <div className="pt-2 text-center">
                  <button
                    onClick={onClose}
                    className="px-6 py-2.5 bg-[#ff4b16] hover:bg-[#e03d14] text-white rounded-xl font-bold text-xs shadow-xs cursor-pointer"
                  >
                    Đã Hiểu & Đóng Phân Tích
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="bg-white px-4 sm:px-6 py-3 border-t border-zinc-200 flex justify-between items-center shrink-0">
          <div className="text-[11px] text-zinc-500 font-medium hidden sm:block">
            Hệ thống quản trị chuỗi PhoneHouse • Phiên bản 2.5
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl font-bold text-xs cursor-pointer ml-auto"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
};
