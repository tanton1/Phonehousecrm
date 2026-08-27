import React, { useState } from 'react';
import {
  ShoppingCart, Search, Smartphone, Users, ChevronRight,
  RefreshCw, TrendingUp, Bell, Target, ArrowRight, Zap, ScanFace
} from 'lucide-react';
import { POSSalesView } from './POSSalesView';
import { EmployeeDashboardView } from './EmployeeDashboardView';
import { StaffHRView } from './StaffHRView';
import { TradeInView } from './TradeInView';
import { UserAccount, WarrantyTicket, TradeInAppraisal } from '../types';
import { DeviceItem, SalesInvoice, Lead, StoreBranch, WarehouseInfo, StoreSettings, FundAccount, CashTransaction } from '../types';

const CRMLeadsView = React.lazy(() => import('./CRMLeadsView').then(module => ({ default: module.CRMLeadsView })));

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
  onOpenPOS?: () => void;
  funds: FundAccount[];
  onAddTransaction: (tx: CashTransaction) => void;
  onOpenNewDeviceModal?: () => void;
  onOpenCheckIn?: () => void;

  // CRM Props
  onAddLead: (lead: Lead) => void;
  onUpdateLead: (lead: Lead) => void;
  onConvertLeadToSale: (lead: Lead) => void;

  // Employee Dashboard & HR Props
  currentUser?: UserAccount | null;
  users: UserAccount[];
  onUpdateUser?: (user: UserAccount) => void;
  warrantyTickets: WarrantyTicket[];
  onCheckIn?: (time: string) => void;
  onCheckOut?: (time: string) => void;
  attendanceRecord?: import('../types').AttendanceRecord;
  attendanceRecords?: import('../types').AttendanceRecord[];

  // Trade In Props
  tradeIns?: TradeInAppraisal[];
  onAddTradeIn?: (tradeIn: TradeInAppraisal) => void;
  onUpdateTradeIn?: (tradeIn: TradeInAppraisal) => void;
  onAddDevice?: (device: DeviceItem) => void;
}

export const SalesWorkspaceView: React.FC<SalesWorkspaceViewProps> = ({
  devices, invoices, leads = [], branches, warehouses, storeSettings,
  onCreateInvoice, onUpdateDeviceStatus, preSelectedDevice, onNavigateToInvoices, onOpenPOS,
  funds, onAddTransaction, onOpenNewDeviceModal, onOpenCheckIn,
  onAddLead, onUpdateLead, onConvertLeadToSale,
  currentUser, users, onUpdateUser, warrantyTickets,
  onCheckIn, onCheckOut, attendanceRecord, attendanceRecords = [],
  tradeIns = [], onAddTradeIn = () => {}, onUpdateTradeIn = () => {}, onAddDevice = () => {}
}) => {
  const [activeMode, setActiveMode] = useState<'POS' | 'SEARCH' | 'TRADEIN' | 'CRM' | 'KPI' | 'HR'>('KPI');
  const [searchQuery, setSearchQuery] = useState('');
  const openPos = () => onOpenPOS ? onOpenPOS() : setActiveMode('POS');

  const filteredDevices = devices.filter(d =>
    d.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (d.imei && d.imei.includes(searchQuery))
  ).slice(0, 5);

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col font-sans">
      {/* TOPBAR */}
      <div className="bg-[#ff4b16] text-white p-2 sm:p-3 sm:px-6 flex items-center justify-between shadow-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-black uppercase tracking-wider">Sales Desk</h1>
            <div className="text-[10px] text-orange-200 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse"></span>
              {currentUser?.branchName || storeSettings?.storeName || 'Chưa gán chi nhánh'}
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

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (onOpenCheckIn) {
                onOpenCheckIn();
              } else {
                setActiveMode('HR');
              }
            }}
            className="bg-white/20 hover:bg-white/30 text-white text-xs font-black px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm backdrop-blur-md transition-all cursor-pointer active:scale-95 border border-white/20 shrink-0"
            title="Điểm danh khuôn mặt Face ID vào ca"
          >
            <ScanFace className="w-4 h-4 text-orange-200 animate-pulse" />
            <span className="hidden sm:inline">⚡ Điểm Danh Face ID</span>
            <span className="sm:hidden">Điểm Danh</span>
          </button>

          <div className="hidden lg:flex items-center gap-2 bg-black/15 px-3 py-1.5 rounded-full text-xs font-bold">
            <Target className="w-4 h-4 text-orange-400" />
            KPI: 85% <span className="text-white/60 font-normal">/ 300tr</span>
          </div>
          <button className="relative w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
            <Bell className="w-4 h-4 text-white" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-orange-400 rounded-full border border-[#ff4b16]"></span>
          </button>
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-bold text-xs text-[#ff4b16] shadow-inner">
            L
          </div>
        </div>
      </div>

      {/* SEARCH RESULTS DROPDOWN (If searching) */}
      {searchQuery && activeMode === 'SEARCH' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-zinc-200 z-50 p-2 animate-scaleIn origin-top">
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 mb-2">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Kết quả tìm kiếm</span>
            <button onClick={() => { setSearchQuery(''); openPos(); }} className="text-xs text-orange-600 font-medium">Đóng</button>
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
                    <div className="text-sm font-black text-[#ff4b16]">{(d.expectedSellPrice || 0).toLocaleString()} đ</div>
                    <button className="text-[10px] font-bold text-orange-600 opacity-0 group-hover:opacity-100 transition-opacity">Thêm POS &rarr;</button>
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
                attendanceRecords={attendanceRecords}
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
            <div className="flex-1 bg-zinc-50 overflow-auto p-4 sm:p-6">
              <TradeInView
                tradeIns={tradeIns}
                devices={devices}
                onAddTradeIn={onAddTradeIn}
                onUpdateTradeIn={onUpdateTradeIn}
                onImportToInventory={onAddDevice}
              />
            </div>
          )}

          {activeMode === 'CRM' && (
            <div className="flex-1 overflow-auto">
              <React.Suspense fallback={<div className="p-10 text-center text-sm font-bold text-zinc-500">Đang mở CRM…</div>}>
              <CRMLeadsView
                currentUser={currentUser}
                branches={branches || []}
                users={users}
                leads={leads}
                devices={devices}
                invoices={invoices}
                warrantyTickets={warrantyTickets}
                attendanceRecords={attendanceRecords}
                onAddLead={onAddLead}
                onUpdateLead={onUpdateLead}
                onConvertLeadToSale={onConvertLeadToSale}
              />
              </React.Suspense>
            </div>
          )}

          {activeMode === 'KPI' && (
            <div className="flex-1 overflow-auto">
              <EmployeeDashboardView
                invoices={invoices}
                warrantyTickets={warrantyTickets}
                currentUser={currentUser}
                users={users}
                onUpdateUser={onUpdateUser}
                devices={devices}
                attendanceRecords={attendanceRecords}
                onNavigate={() => {}}
                onOpenPOS={openPos}
              />
            </div>
          )}

          {activeMode === 'HR' && (
            <div className="flex-1 overflow-auto p-3 sm:p-5">
              <StaffHRView
                currentUser={currentUser}
                roleType='SALES'
                branches={branches}
                onCheckIn={onCheckIn}
                onCheckOut={onCheckOut}
                checkedInState={!!attendanceRecord?.checkInTime && !attendanceRecord?.checkOutTime}
                initialCheckInTime={attendanceRecord?.checkInTime || null}
                onOpenCheckInModal={onOpenCheckIn}
              />
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM TAB BAR */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-zinc-200 flex items-center justify-around z-40 px-2 pb-safe">
        <button
          onClick={openPos}
          className={`flex flex-col items-center justify-center w-16 h-full gap-1 transition-all ${activeMode === 'POS' ? 'text-[#ff4b16]' : 'text-zinc-400'}`}
        >
          <ShoppingCart className={`w-5 h-5 ${activeMode === 'POS' ? 'scale-110' : ''}`} />
          <span className="text-[10px] font-bold">POS</span>
        </button>
        <button
          onClick={() => setActiveMode('TRADEIN')}
          className={`flex flex-col items-center justify-center w-16 h-full gap-1 transition-all ${activeMode === 'TRADEIN' ? 'text-[#ff4b16]' : 'text-zinc-400'}`}
        >
          <RefreshCw className={`w-5 h-5 ${activeMode === 'TRADEIN' ? 'scale-110' : ''}`} />
          <span className="text-[10px] font-bold">Thu Cũ</span>
        </button>
        <button
          onClick={() => setActiveMode('CRM')}
          className={`flex flex-col items-center justify-center w-16 h-full gap-1 transition-all ${activeMode === 'CRM' ? 'text-[#ff4b16]' : 'text-zinc-400'}`}
        >
          <Users className={`w-5 h-5 ${activeMode === 'CRM' ? 'scale-110' : ''}`} />
          <span className="text-[10px] font-bold">CRM</span>
        </button>
        <button
          onClick={() => setActiveMode('KPI')}
          className={`flex flex-col items-center justify-center w-16 h-full gap-1 transition-all ${activeMode === 'KPI' ? 'text-[#ff4b16]' : 'text-zinc-400'}`}
        >
          <TrendingUp className={`w-5 h-5 ${activeMode === 'KPI' ? 'scale-110' : ''}`} />
          <span className="text-[10px] font-bold">KPI</span>
        </button>
        <button
          onClick={() => setActiveMode('HR')}
          className={`flex flex-col items-center justify-center w-16 h-full gap-1 transition-all ${activeMode === 'HR' ? 'text-[#ff4b16]' : 'text-zinc-400'}`}
        >
          <Users className={`w-5 h-5 ${activeMode === 'HR' ? 'scale-110' : ''}`} />
          <span className="text-[10px] font-bold">Nhân Sự</span>
        </button>
      </div>
    </div>
  );
}
