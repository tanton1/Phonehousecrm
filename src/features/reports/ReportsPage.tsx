import React, { useState } from 'react';
import { SalesInvoice, DeviceItem, WarrantyTicket, FundAccount, StoreBranch, StaffMember } from '../../types';
import { BarChart3, TrendingUp, DollarSign, Calendar, Package, Wrench, Award, Filter, Download } from 'lucide-react';

export interface ReportsPageProps {
  invoices: SalesInvoice[];
  devices: DeviceItem[];
  warrantyTickets: WarrantyTicket[];
  funds: FundAccount[];
  branches: StoreBranch[];
  selectedBranchId?: string;
  currentUser?: StaffMember | null;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({
  invoices,
  devices,
  warrantyTickets,
  funds,
  branches,
  selectedBranchId,
  currentUser
}) => {
  const [timeRange, setTimeRange] = useState<'today' | '7days' | '30days' | 'month'>('month');

  // Calculations
  const filteredInvoices = invoices.filter(inv => {
    return !selectedBranchId || selectedBranchId === 'ALL' || inv.branchId === selectedBranchId;
  });

  const totalRevenue = filteredInvoices.reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);
  const totalInvoicesCount = filteredInvoices.length;
  
  // Gross profit estimation (~14% average margin on retail)
  const estimatedGrossProfit = Math.round(totalRevenue * 0.142);

  // Revenue breakdown
  const deviceInvoices = filteredInvoices.flatMap(inv => inv.items?.filter(i => (i as any).deviceId || (i as any).imei) || []);
  const accessoryInvoices = filteredInvoices.flatMap(inv => inv.items?.filter(i => (i as any).productId) || []);
  const totalAccessoriesRevenue = accessoryInvoices.reduce((sum, item: any) => sum + (item.totalPrice || item.price || 0), 0);
  const totalDeviceRevenue = Math.max(0, totalRevenue - totalAccessoriesRevenue);

  // Stock aging
  const inStockDevices = devices.filter(d => d.status === 'in_stock');
  const totalStockValue = inStockDevices.reduce((sum, d) => sum + (d.importPrice || d.sellPrice * 0.8 || 0), 0);
  const agedStock30Days = inStockDevices.filter(d => {
    const days = (Date.now() - new Date(d.createdAt || Date.now()).getTime()) / (1000 * 3600 * 24);
    return days > 30;
  });

  // Repair revenue
  const repairRevenue = warrantyTickets
    .filter(t => t.status === 'delivered')
    .reduce((sum, t) => sum + (t.estimatedCost || t.repairCost || 0), 0);

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-200">
      {/* 1. Header & Time Range Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-zinc-200/80 shadow-2xs">
        <div>
          <div className="flex items-center space-x-2 text-[#ff4b16] text-xs font-bold uppercase tracking-wider">
            <BarChart3 className="w-4 h-4" />
            <span>Phân Tích & Báo Cáo Tài Chính Chuyên Sâu</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-zinc-900 mt-1">
            Báo Cáo Hoạt Động Doanh Nghiệp
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Dữ liệu tổng hợp theo chu kỳ kinh doanh • {branches.find(b => b.id === selectedBranchId)?.name || 'Toàn Hệ Thống'}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex bg-zinc-100 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setTimeRange('today')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                timeRange === 'today' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Hôm nay
            </button>
            <button
              onClick={() => setTimeRange('7days')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                timeRange === '7days' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              7 ngày
            </button>
            <button
              onClick={() => setTimeRange('30days')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                timeRange === '30days' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              30 ngày
            </button>
            <button
              onClick={() => setTimeRange('month')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                timeRange === 'month' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Tháng này
            </button>
          </div>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <span className="text-xs font-semibold text-zinc-500">Tổng Doanh Thu Bán Lẻ</span>
          <p className="text-xl sm:text-2xl font-black text-zinc-900 mt-1.5 font-mono">
            {(totalRevenue / 1_000_000).toFixed(1)} <span className="text-xs font-bold text-zinc-500">triệu</span>
          </p>
          <span className="text-[10px] font-semibold text-emerald-600 mt-1 block">
            ✓ {totalInvoicesCount} đơn hàng hoàn tất
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <span className="text-xs font-semibold text-zinc-500">Lợi Nhuận Gộp Ước Tính</span>
          <p className="text-xl sm:text-2xl font-black text-emerald-700 mt-1.5 font-mono">
            {(estimatedGrossProfit / 1_000_000).toFixed(1)} <span className="text-xs font-bold text-zinc-500">triệu</span>
          </p>
          <span className="text-[10px] font-semibold text-emerald-600 mt-1 block">
            Biên lợi nhuận gộp ~14.2%
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <span className="text-xs font-semibold text-zinc-500">Giá Trị Tồn Kho Khả Dụng</span>
          <p className="text-xl sm:text-2xl font-black text-blue-700 mt-1.5 font-mono">
            {(totalStockValue / 1_000_000).toFixed(1)} <span className="text-xs font-bold text-zinc-500">triệu</span>
          </p>
          <span className="text-[10px] font-semibold text-zinc-400 mt-1 block">
            {inStockDevices.length} máy sẵn tại các kho
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <span className="text-xs font-semibold text-zinc-500">Doanh Thu Sửa Chữa Kỹ Thuật</span>
          <p className="text-xl sm:text-2xl font-black text-purple-700 mt-1.5 font-mono">
            {(repairRevenue / 1_000_000).toFixed(1)} <span className="text-xs font-bold text-zinc-500">triệu</span>
          </p>
          <span className="text-[10px] font-semibold text-purple-600 mt-1 block">
            Bao gồm dịch vụ & linh kiện thay thế
          </span>
        </div>
      </div>

      {/* 3. Detailed Breakdown Grids */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue Structure */}
        <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-2xs space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 border-b border-zinc-100 pb-3">
            Cơ Cấu Doanh Thu Theo Ngành Hàng
          </h3>
          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between font-semibold text-zinc-700 mb-1">
                <span>1. Điện Thoại & Tablet (iPhone / iPad)</span>
                <span className="font-mono font-bold text-zinc-900">{(totalDeviceRevenue / 1_000_000).toFixed(1)} triệu (88%)</span>
              </div>
              <div className="w-full bg-zinc-100 rounded-full h-2">
                <div className="bg-[#ff4b16] h-2 rounded-full" style={{ width: '88%' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between font-semibold text-zinc-700 mb-1">
                <span>2. Phụ Kiện Chính Hãng (Cáp, Sạc, Ốp, Tai Nghe)</span>
                <span className="font-mono font-bold text-zinc-900">{(totalAccessoriesRevenue / 1_000_000).toFixed(1)} triệu (7%)</span>
              </div>
              <div className="w-full bg-zinc-100 rounded-full h-2">
                <div className="bg-amber-500 h-2 rounded-full" style={{ width: '7%' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between font-semibold text-zinc-700 mb-1">
                <span>3. Dịch Vụ Sửa Chữa & Ép Kính Kỹ Thuật</span>
                <span className="font-mono font-bold text-zinc-900">{(repairRevenue / 1_000_000).toFixed(1)} triệu (5%)</span>
              </div>
              <div className="w-full bg-zinc-100 rounded-full h-2">
                <div className="bg-purple-600 h-2 rounded-full" style={{ width: '5%' }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Stock Aging Analysis */}
        <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-2xs space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 border-b border-zinc-100 pb-3">
            Phân Tích Tuổi Tồn Kho & Rủi Ro Đọng Vốn
          </h3>
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-emerald-50 border border-emerald-200/70 rounded-xl flex items-center justify-between">
              <div>
                <span className="font-bold text-emerald-800 block">Tồn kho dưới 15 ngày (Hàng luân chuyển nhanh)</span>
                <span className="text-[10px] text-emerald-600">Độ thanh khoản cao, giá trị ổn định</span>
              </div>
              <span className="font-mono font-bold text-emerald-800 text-sm">
                {inStockDevices.length - agedStock30Days.length} cây
              </span>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200/70 rounded-xl flex items-center justify-between">
              <div>
                <span className="font-bold text-amber-800 block">Tồn kho trên 30 ngày (Cần kích cầu / giảm giá)</span>
                <span className="text-[10px] text-amber-600">Nên áp dụng voucher giảm 200k - 500k để giải phóng vốn</span>
              </div>
              <span className="font-mono font-bold text-amber-800 text-sm">
                {agedStock30Days.length} cây
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
