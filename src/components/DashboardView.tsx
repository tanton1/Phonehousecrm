import React from 'react';
import { 
  DeviceItem, 
  Lead, 
  TradeInAppraisal, 
  WarrantyTicket, 
  SalesInvoice 
} from '../types';
import { 
  Smartphone, 
  TrendingUp, 
  Users, 
  Wrench, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowUpRight, 
  BatteryMedium, 
  ShieldAlert,
  Sparkles,
  DollarSign,
  ShoppingCart,
  Plus,
  BookOpen,
  Zap,
  ArrowRight
} from 'lucide-react';

interface DashboardViewProps {
  devices: DeviceItem[];
  leads: Lead[];
  tradeIns: TradeInAppraisal[];
  warrantyTickets: WarrantyTicket[];
  invoices: SalesInvoice[];
  onNavigate: (tab: string) => void;
  onOpenPOS: () => void;
  onOpenTradeIn: () => void;
  onOpenNewDevice: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  devices,
  leads,
  tradeIns,
  warrantyTickets,
  invoices,
  onNavigate,
  onOpenPOS,
  onOpenTradeIn,
  onOpenNewDevice
}) => {
  // Calculations
  const inStockDevices = devices.filter(d => d.status === 'in_stock');
  const soldDevices = devices.filter(d => d.status === 'sold');
  const reservedDevices = devices.filter(d => d.status === 'reserved');
  const warrantyDevices = devices.filter(d => d.status === 'warranty' || d.status === 'repairing');

  const totalInventoryValue = inStockDevices.reduce((sum, d) => sum + d.sellPrice, 0);
  const totalCostValue = inStockDevices.reduce((sum, d) => sum + d.buyPrice, 0);
  const estimatedProfit = totalInventoryValue - totalCostValue;

  const totalRevenue = invoices.reduce((sum, inv) => sum + inv.finalAmount, 0);
  const activeLeads = leads.filter(l => l.status !== 'won' && l.status !== 'lost');
  const wonLeads = leads.filter(l => l.status === 'won');
  const leadConversionRate = leads.length > 0 ? Math.round((wonLeads.length / leads.length) * 100) : 0;

  // Group devices by iPhone series
  const seriesBreakdown: Record<string, number> = {};
  inStockDevices.forEach(d => {
    let series = 'Khác';
    if (d.model.includes('16')) series = 'iPhone 16 Series';
    else if (d.model.includes('15')) series = 'iPhone 15 Series';
    else if (d.model.includes('14')) series = 'iPhone 14 Series';
    else if (d.model.includes('13')) series = 'iPhone 13 Series';
    else if (d.model.includes('12')) series = 'iPhone 12 Series';
    else if (d.model.includes('11')) series = 'iPhone 11 Series';
    
    seriesBreakdown[series] = (seriesBreakdown[series] || 0) + 1;
  });

  // Battery health warning (<85%)
  const lowBatteryDevices = inStockDevices.filter(d => d.batteryHealth < 85 && d.condition !== 'New Seal');
  const activeWarrantyCount = warrantyTickets.filter(w => w.status !== 'delivered').length;

  return (
    <div className="space-y-6 pb-6">
      {/* Hero Banner: Clean White & Orange Gradient Accent */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-orange-600 to-amber-500 text-white p-5 sm:p-7 shadow-lg shadow-orange-500/20">
        {/* Glow effect */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/2" />
        
        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-white text-orange-600 font-black text-xs px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center space-x-1 shadow-sm">
                <Zap className="w-3.5 h-3.5 fill-orange-600" />
                <span>Đồng Bộ Toàn Diện</span>
              </span>
              <span className="bg-orange-700/60 text-white text-xs px-2.5 py-0.5 rounded-full font-medium border border-white/20 backdrop-blur-xs">
                Kho IMEI ⇄ CRM ⇄ Thu Cũ ⇄ POS ⇄ Bảo Hành
              </span>
            </div>
            
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-tight">
              Trung Tâm Quản Trị & Vận Hành <span className="underline decoration-white/40 decoration-wavy">Shop iPhone</span>
            </h1>
            
            <p className="text-xs sm:text-sm text-orange-100 max-w-2xl leading-relaxed">
              Quản lý định danh từng cây máy theo IMEI 15 số, phễu khách hàng đa kênh Zalo/TikTok/Ads, quy trình thu cũ đổi mới và xuất hóa đơn trả góp 0%.
            </p>
          </div>

          {/* Quick Action Buttons for Mobile & Desktop */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5 w-full lg:w-auto">
            <button
              onClick={onOpenPOS}
              className="px-4 py-2.5 bg-white hover:bg-orange-50 text-orange-600 font-black rounded-xl text-xs flex items-center justify-center space-x-1.5 shadow-md transition-all active:scale-95"
            >
              <ShoppingCart className="w-4 h-4 text-orange-600" />
              <span>Bán Nhanh POS</span>
            </button>

            <button
              onClick={onOpenTradeIn}
              className="px-4 py-2.5 bg-orange-700/70 hover:bg-orange-800 text-white border border-white/30 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-all active:scale-95"
            >
              <RefreshCw className="w-4 h-4 text-white" />
              <span>Thẩm Định Thu Cũ</span>
            </button>

            <button
              onClick={onOpenNewDevice}
              className="col-span-2 sm:col-span-1 px-4 py-2.5 bg-orange-700/70 hover:bg-orange-800 text-white border border-white/30 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4 text-amber-200" />
              <span>Nhập Máy Kho IMEI</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Core Metrics Bento Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {/* Metric 1: Stock Value */}
        <div 
          onClick={() => onNavigate('inventory')}
          className="bg-white border border-orange-100 hover:border-orange-300 rounded-2xl p-4 sm:p-5 cursor-pointer transition-all shadow-sm hover:shadow-md group relative overflow-hidden"
        >
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] sm:text-xs font-bold text-zinc-500 uppercase tracking-wider">Kho Sẵn Hàng</span>
            <div className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 group-hover:scale-110 transition-transform">
              <Smartphone className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
            {inStockDevices.length} <span className="text-xs text-orange-600 font-bold">cây</span>
          </div>
          <div className="mt-2 text-[10px] sm:text-xs text-zinc-500 flex items-center justify-between">
            <span>Tổng giá trị:</span>
            <span className="text-zinc-900 font-bold">{Math.round(totalInventoryValue / 1000000)}M đ</span>
          </div>
        </div>

        {/* Metric 2: Revenue */}
        <div 
          onClick={() => onNavigate('pos')}
          className="bg-white border border-orange-100 hover:border-orange-300 rounded-2xl p-4 sm:p-5 cursor-pointer transition-all shadow-sm hover:shadow-md group relative overflow-hidden"
        >
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] sm:text-xs font-bold text-zinc-500 uppercase tracking-wider">Doanh Thu POS</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
            {Math.round(totalRevenue / 1000000)} <span className="text-xs text-amber-600 font-bold">Triệu</span>
          </div>
          <div className="mt-2 text-[10px] sm:text-xs text-zinc-500 flex items-center justify-between">
            <span>Đã xuất bán:</span>
            <span className="text-zinc-900 font-bold">{invoices.length} hóa đơn</span>
          </div>
        </div>

        {/* Metric 3: CRM Active Leads */}
        <div 
          onClick={() => onNavigate('crm')}
          className="bg-white border border-orange-100 hover:border-orange-300 rounded-2xl p-4 sm:p-5 cursor-pointer transition-all shadow-sm hover:shadow-md group relative overflow-hidden"
        >
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] sm:text-xs font-bold text-zinc-500 uppercase tracking-wider">Khách Chờ Chốt</span>
            <div className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 group-hover:scale-110 transition-transform">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
            {activeLeads.length} <span className="text-xs text-orange-600 font-bold">khách</span>
          </div>
          <div className="mt-2 text-[10px] sm:text-xs text-zinc-500 flex items-center justify-between">
            <span>Tỷ lệ chốt deal:</span>
            <span className="text-amber-600 font-bold">{leadConversionRate}%</span>
          </div>
        </div>

        {/* Metric 4: Trade-in & Warranty */}
        <div 
          onClick={() => onNavigate('warranty')}
          className="bg-white border border-orange-100 hover:border-orange-300 rounded-2xl p-4 sm:p-5 cursor-pointer transition-all shadow-sm hover:shadow-md group relative overflow-hidden"
        >
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] sm:text-xs font-bold text-zinc-500 uppercase tracking-wider">Bảo Hành / Thu Cũ</span>
            <div className="w-8 h-8 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-700 group-hover:scale-110 transition-transform">
              <Wrench className="w-4 h-4 text-orange-600" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
            {activeWarrantyCount} <span className="text-xs text-zinc-500 font-normal">máy BH</span>
          </div>
          <div className="mt-2 text-[10px] sm:text-xs text-zinc-500 flex items-center justify-between">
            <span>Thu cũ đã định giá:</span>
            <span className="text-zinc-900 font-bold">{tradeIns.length} hồ sơ</span>
          </div>
        </div>
      </div>

      {/* Middle Grid: Stock by Series & Low Battery Warning */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Cols: Stock Inventory by Series */}
        <div className="lg:col-span-2 bg-white border border-orange-100 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-zinc-900 flex items-center space-x-2">
                <span>Phân Bổ Tồn Kho Theo Dòng iPhone</span>
              </h3>
              <p className="text-xs text-zinc-500">Số lượng máy sẵn hàng theo từng Series</p>
            </div>
            <button
              onClick={() => onNavigate('inventory')}
              className="text-xs text-orange-600 hover:text-orange-700 font-bold flex items-center space-x-1"
            >
              <span>Xem chi tiết</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(seriesBreakdown).map(([series, count]) => (
              <div 
                key={series}
                className="p-3.5 bg-gradient-to-br from-orange-50/60 to-amber-50/40 border border-orange-100 rounded-2xl flex flex-col justify-between hover:border-orange-300 transition-colors"
              >
                <span className="text-xs text-zinc-600 font-semibold">{series}</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-xl font-black text-zinc-900">{count}</span>
                  <span className="text-[10px] text-orange-600 font-bold">Máy Sẵn</span>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Realtime Synchronization Indicators */}
          <div className="p-4 bg-orange-50/50 rounded-2xl border border-orange-100 text-xs space-y-2">
            <div className="font-bold text-zinc-900 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-orange-600" />
              <span>Trạng Thái Đồng Bộ Hệ Thống Đa Module (Live)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-zinc-600 text-[11px] pt-1">
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                <span>Kho IMEI & Quản lý Serial: <strong className="text-zinc-800">Đã kết nối</strong></span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span>Thu Cũ Trade-In ⇄ Kho Bán: <strong className="text-zinc-800">Tự động</strong></span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Xuất Hóa Đơn ⇄ Đổi Serial: <strong className="text-zinc-800">Đồng bộ</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Quality Alerts & Battery Check */}
        <div className="bg-white border border-orange-100 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-zinc-900 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>Cảnh Báo Kỹ Thuật Máy</span>
            </h3>
            <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-bold">
              {lowBatteryDevices.length} máy cần chú ý
            </span>
          </div>

          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {lowBatteryDevices.length === 0 ? (
              <div className="p-6 text-center text-zinc-500 text-xs">
                Tất cả máy trong kho đều có pin trên 85% hoặc New Seal.
              </div>
            ) : (
              lowBatteryDevices.map((d) => (
                <div 
                  key={d.id}
                  className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-between text-xs hover:border-amber-400 transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-bold text-zinc-900 truncate">{d.model} {d.storage}</div>
                    <div className="text-[10px] text-zinc-500 font-mono truncate">IMEI: {d.imei} • {d.color}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-black rounded-lg text-[11px] block">
                      Pin {d.batteryHealth}%
                    </span>
                    <span className="text-[9px] text-zinc-500 mt-0.5 block">Nên hỗ trợ thay pin</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Quick link to Frappe Guide */}
          <div 
            onClick={() => onNavigate('erpnext-plan')}
            className="p-3 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-orange-100/60 transition-all"
          >
            <div className="flex items-center space-x-2 text-xs">
              <BookOpen className="w-4 h-4 text-orange-600" />
              <span className="text-zinc-800 font-bold">Xem Bản Vẽ Schemas & Docker Frappe</span>
            </div>
            <ArrowRight className="w-4 h-4 text-orange-600" />
          </div>
        </div>
      </div>
    </div>
  );
};
