import React, { useState } from 'react';
import { 
  ShoppingCart, Search, Smartphone, Users, ChevronRight, 
  RefreshCw, TrendingUp, Bell, Target, ArrowRight, Zap
} from 'lucide-react';
import { POSSalesView } from './POSSalesView';
import { CRMLeadsView } from './CRMLeadsView';
import { EmployeeDashboardView } from './EmployeeDashboardView';
import { StaffHRView } from './StaffHRView';
import { UserAccount, WarrantyTicket } from '../types';
import { DeviceItem, SalesInvoice, Lead, StoreBranch, WarehouseInfo, StoreSettings, FundAccount, CashTransaction } from '../types';

interface SalesWorkspaceViewProps {
  devices: DeviceItem[];
  invoices: SalesInvoice[];
  leads?: Lead[];
  branches?: StoreBranch[];
  warehouses?: WarehouseInfo[];
  storeSettings?: StoreSettings;
  onCreateInvoice: (invoice: SalesInvoice) => void;
  onUpdateDeviceStatus: (imei: string, status: DeviceItem['status'], customerName?: string, phone?: string) => void;
  preSelectedDevice?: DeviceItem | null;
  onNavigateToInvoices?: () => void;
  funds: FundAccount[];
  onAddTransaction: (tx: CashTransaction) => void;
  onOpenNewDeviceModal?: () => void;
  
  // CRM Props
  onAddLead: (lead: Lead) => void;
  onUpdateLead: (lead: Lead) => void;
  onConvertLeadToSale: (lead: Lead) => void;
  
  // Employee Dashboard & HR Props
  currentUser?: UserAccount | null;
  users: UserAccount[];
  warrantyTickets: WarrantyTicket[];
  onCheckIn?: (time: string) => void;
  onCheckOut?: (time: string) => void;
  attendanceRecord?: import('../types').AttendanceRecord;
}

export const SalesWorkspaceView: React.FC<SalesWorkspaceViewProps> = ({ 
  devices, invoices, leads = [], branches, warehouses, storeSettings, 
  onCreateInvoice, onUpdateDeviceStatus, preSelectedDevice, onNavigateToInvoices,
  funds, onAddTransaction, onOpenNewDeviceModal,
  onAddLead, onUpdateLead, onConvertLeadToSale,
  currentUser, users, warrantyTickets
, onCheckIn, onCheckOut, attendanceRecord }) => {
  const [activeMode, setActiveMode] = useState<'POS' | 'SEARCH' | 'TRADEIN' | 'CRM' | 'KPI' | 'HR'>('POS');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredDevices = devices.filter(d => 
    d.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (d.imei && d.imei.includes(searchQuery))
  ).slice(0, 5);

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col font-sans">
      {/* TOPBAR */}
      <div className="bg-[#FF4B16] text-white p-2 sm:p-3 sm:px-6 flex items-center justify-between shadow-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-black uppercase tracking-wider">Sales Desk</h1>
            <div className="text-[10px] text-orange-200 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Chi nhánh Cầu Giấy
            </div>
          </div>
        </div>

        {/* SEARCH BAR (Center) */}
        <div className="hidden md:flex flex-1 max-w-xl mx-8">
          <div className="relative w-full">
            <input 
              type="text" 
              placeholder="F3: Quét mã vạch / Tên SP..." 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value && activeMode !== 'SEARCH') setActiveMode('SEARCH');
              }}
              className="w-full bg-black/10 border border-white/20 text-white placeholder:text-white/60 rounded-full px-4 py-2 pl-10 focus:outline-none focus:bg-white focus:text-zinc-900 focus:placeholder:text-zinc-400 transition-all text-sm font-medium"
            />
            <Search className={`absolute left-3 top-2.5 w-4 h-4 ${searchQuery ? 'text-zinc-400' : 'text-white/60'}`} />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-2 bg-black/15 px-3 py-1.5 rounded-full text-xs font-bold">
            <Target className="w-4 h-4 text-emerald-400" />
            KPI: 85% <span className="text-white/60 font-normal">/ 300tr</span>
          </div>
          <button className="relative w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
            <Bell className="w-4 h-4 text-white" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-400 rounded-full border border-[#FF4B16]"></span>
          </button>
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-bold text-xs text-[#FF4B16] shadow-inner">
            L
          </div>
        </div>
      </div>

      {/* SEARCH RESULTS DROPDOWN (If searching) */}
      {searchQuery && activeMode === 'SEARCH' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-zinc-200 z-50 p-2 animate-scaleIn origin-top">
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 mb-2">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Kết quả tìm kiếm</span>
            <button onClick={() => { setSearchQuery(''); setActiveMode('POS'); }} className="text-xs text-blue-600 font-medium">Đóng</button>
          </div>
          {filteredDevices.length > 0 ? (
            <div className="space-y-1">
              {filteredDevices.map(d => (
                <div key={d.id} className="flex items-center justify-between p-3 hover:bg-zinc-50 rounded-xl cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center">
                      <Smartphone className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-zinc-900">{d.model} <span className="text-zinc-500 font-normal">({d.color})</span></div>
                      <div className="text-[10px] text-zinc-500 font-mono mt-0.5">IMEI: {d.imei || 'Đang cập nhật'} • Pin: {d.batteryHealth}%</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-[#FF4B16]">{(d.expectedSellPrice || 0).toLocaleString()} đ</div>
                    <button className="text-[10px] font-bold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">Thêm POS &rarr;</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-zinc-400">Không tìm thấy sản phẩm nào</div>
          )}
        </div>
      )}

      {/* MAIN LAYOUT */}
      <div className="flex flex-1 overflow-hidden pb-16">
        {/* WORKSPACE AREA */}
        <div className="flex-1 flex overflow-hidden">
          {activeMode === 'POS' && (
            <div className="flex-1 overflow-hidden relative">
              <POSSalesView 
                devices={devices}
                invoices={invoices}
                leads={leads}
                branches={branches}
                warehouses={warehouses}
                storeSettings={storeSettings}
                onCreateInvoice={onCreateInvoice}
                onUpdateDeviceStatus={onUpdateDeviceStatus}
                preSelectedDevice={preSelectedDevice}
                onNavigateToInvoices={onNavigateToInvoices}
                funds={funds}
                onAddTransaction={onAddTransaction}
              />
            </div>
          )}
          
          {activeMode === 'TRADEIN' && (
            <div className="flex-1 bg-zinc-50 p-6 overflow-auto">
              <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-xl border border-zinc-200 overflow-hidden">
                <div className="p-8 text-center border-b border-zinc-100 bg-gradient-to-br from-orange-50 to-white">
                  <div className="w-16 h-16 bg-orange-100 text-[#FF4B16] rounded-full flex items-center justify-center mx-auto mb-4">
                    <Zap className="w-8 h-8" />
                  </div>
                  <h2 className="text-2xl font-black text-zinc-900 mb-2">Định Giá Thu Cũ Thông Minh</h2>
                  <p className="text-sm text-zinc-500">Chỉ cần chọn dòng máy, hệ thống sẽ đưa ra giá thu mua chuẩn ngay lập tức.</p>
                </div>
                <div className="p-8">
                  {/* Mock Trade In Simple Flow */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-2">Dòng Máy Cũ Của Khách</label>
                        <select className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-[#FF4B16] focus:ring-1 focus:ring-[#FF4B16]">
                          <option>iPhone 14 Pro Max</option>
                          <option>iPhone 13 Pro Max</option>
                          <option>iPhone 12 Pro</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-2">Tình Trạng (KCS)</label>
                        <select className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-[#FF4B16] focus:ring-1 focus:ring-[#FF4B16]">
                          <option>Loại 1 (Đẹp 99%, Pin &gt; 90%)</option>
                          <option>Loại 2 (Cấn xước nhẹ, Pin 8x)</option>
                          <option>Loại 3 (Kính phẩy, cần thay pin)</option>
                        </select>
                      </div>
                    </div>
                    
                    <div className="bg-zinc-900 text-white rounded-2xl p-6 flex flex-col justify-center relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10"><RefreshCw className="w-32 h-32" /></div>
                      <div className="relative z-10">
                        <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Giá thu mua dự kiến</div>
                        <div className="text-4xl font-black text-emerald-400 mb-4">16.500.000 đ</div>
                        <button className="w-full py-3 bg-[#FF4B16] hover:bg-orange-600 text-white font-bold rounded-xl shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2">
                          Chốt Thu Mua & Lên Đời <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {activeMode === 'CRM' && (
            <div className="flex-1 overflow-auto">
              <CRMLeadsView
                leads={leads}
                devices={devices}
                onAddLead={onAddLead}
                onUpdateLead={onUpdateLead}
                onConvertLeadToSale={onConvertLeadToSale}
              />
            </div>
          )}
          
          {activeMode === 'KPI' && (
            <div className="flex-1 overflow-auto">
              <EmployeeDashboardView
                invoices={invoices}
                warrantyTickets={warrantyTickets}
                currentUser={currentUser}
                users={users}
                devices={devices}
                onNavigate={() => {}}
                onOpenPOS={() => setActiveMode('POS')}
              />
            </div>
          )}
          
          {activeMode === 'HR' && (
            <div className="flex-1 overflow-auto">
              <StaffHRView 
                currentUser={currentUser} 
                roleType='SALES' 
                onCheckIn={onCheckIn}
                onCheckOut={onCheckOut}
                checkedInState={!!attendanceRecord?.checkInTime && !attendanceRecord?.checkOutTime}
                initialCheckInTime={attendanceRecord?.checkInTime || null}
              />
            </div>
          )}
        </div>
      </div>
      
      {/* BOTTOM TAB BAR */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-zinc-200 flex items-center justify-around z-40 px-2 pb-safe">
        <button 
          onClick={() => setActiveMode('POS')}
          className={`flex flex-col items-center justify-center w-16 h-full gap-1 transition-all ${activeMode === 'POS' ? 'text-[#FF4B16]' : 'text-zinc-400'}`}
        >
          <ShoppingCart className={`w-5 h-5 ${activeMode === 'POS' ? 'scale-110' : ''}`} />
          <span className="text-[10px] font-bold">POS</span>
        </button>
        <button 
          onClick={() => setActiveMode('TRADEIN')}
          className={`flex flex-col items-center justify-center w-16 h-full gap-1 transition-all ${activeMode === 'TRADEIN' ? 'text-[#FF4B16]' : 'text-zinc-400'}`}
        >
          <RefreshCw className={`w-5 h-5 ${activeMode === 'TRADEIN' ? 'scale-110' : ''}`} />
          <span className="text-[10px] font-bold">Thu Cũ</span>
        </button>
        <button 
          onClick={() => setActiveMode('CRM')}
          className={`flex flex-col items-center justify-center w-16 h-full gap-1 transition-all ${activeMode === 'CRM' ? 'text-[#FF4B16]' : 'text-zinc-400'}`}
        >
          <Users className={`w-5 h-5 ${activeMode === 'CRM' ? 'scale-110' : ''}`} />
          <span className="text-[10px] font-bold">CRM</span>
        </button>
        <button 
          onClick={() => setActiveMode('KPI')}
          className={`flex flex-col items-center justify-center w-16 h-full gap-1 transition-all ${activeMode === 'KPI' ? 'text-[#FF4B16]' : 'text-zinc-400'}`}
        >
          <TrendingUp className={`w-5 h-5 ${activeMode === 'KPI' ? 'scale-110' : ''}`} />
          <span className="text-[10px] font-bold">KPI</span>
        </button>
        <button 
          onClick={() => setActiveMode('HR')}
          className={`flex flex-col items-center justify-center w-16 h-full gap-1 transition-all ${activeMode === 'HR' ? 'text-[#FF4B16]' : 'text-zinc-400'}`}
        >
          <Users className={`w-5 h-5 ${activeMode === 'HR' ? 'scale-110' : ''}`} />
          <span className="text-[10px] font-bold">Nhân Sự</span>
        </button>
      </div>
    </div>
  );
}
