import React from 'react';
import { SalesInvoice, DeviceItem, Lead, WarrantyTicket, FundAccount, Partner, StoreBranch, StaffMember } from '../../types';
import { useDashboardMetrics } from './hooks/useDashboardMetrics';
import { KpiGrid } from './components/KpiGrid';
import { ActionQueue } from './components/ActionQueue';
import { RevenueTrendChart } from './components/RevenueTrendChart';
import { StockSummary } from './components/StockSummary';
import { Sparkles, RefreshCw } from 'lucide-react';

import { SalesHomeView } from './components/SalesHomeView';
import { TechHomeView } from './components/TechHomeView';
import { AccountantHomeView } from './components/AccountantHomeView';

export interface DashboardPageProps {
  invoices: SalesInvoice[];
  devices: DeviceItem[];
  leads: Lead[];
  warrantyTickets: WarrantyTicket[];
  funds: FundAccount[];
  partners: Partner[];
  branches: StoreBranch[];
  selectedBranchId?: string;
  currentUser?: StaffMember | null;
  onNavigateTab: (tabId: string) => void;
  onOpenAICopilot?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  invoices,
  devices,
  leads,
  warrantyTickets,
  funds,
  partners,
  branches,
  selectedBranchId,
  currentUser,
  onNavigateTab,
  onOpenAICopilot
}) => {
  const currentBranch = branches.find(b => b.id === selectedBranchId) || branches[0];

  // 1. Role-Adaptive Home for SALES
  if (currentUser?.role === 'SALES') {
    return (
      <SalesHomeView
        invoices={invoices}
        devices={devices}
        leads={leads}
        currentBranch={currentBranch}
        currentUser={currentUser}
        onNavigateTab={onNavigateTab}
      />
    );
  }

  // 2. Role-Adaptive Home for TECHNICIANS
  if (currentUser?.role === 'TECHNICIAN' || currentUser?.role === 'TECH' || currentUser?.role === 'TECH_LEAD') {
    return (
      <TechHomeView
        warrantyTickets={warrantyTickets}
        devices={devices}
        currentBranch={currentBranch}
        currentUser={currentUser}
        onNavigateTab={onNavigateTab}
      />
    );
  }

  // 3. Role-Adaptive Home for ACCOUNTANTS
  if (currentUser?.role === 'ACCOUNTANT') {
    return (
      <AccountantHomeView
        invoices={invoices}
        funds={funds}
        partners={partners}
        currentBranch={currentBranch}
        currentUser={currentUser}
        onNavigateTab={onNavigateTab}
      />
    );
  }

  // 4. Executive Dashboard for ADMIN & MANAGERS
  const metrics = useDashboardMetrics({
    invoices,
    devices,
    leads,
    warrantyTickets,
    funds,
    partners,
    selectedBranchId
  });

  const currentBranchName = branches.find(b => b.id === selectedBranchId)?.name || 'Toàn Hệ Thống';

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-200">
      {/* 1. Dashboard Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
        <div>
          <h1 className="text-lg sm:text-xl font-black text-zinc-900 tracking-tight">
            Bàn Điều Hành Trung Tâm
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Dữ liệu tổng hợp theo thời gian thực • <span className="font-semibold text-zinc-800">{currentBranchName}</span>
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {onOpenAICopilot && (
            <button
              onClick={onOpenAICopilot}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-xs shadow-sm shadow-orange-500/20 hover:brightness-105 active:scale-95 transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Trợ Lý Điều Hành</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Top KPI Cards */}
      <KpiGrid metrics={metrics} />

      {/* 3. Action Queue (Ưu tiên xử lý) */}
      <ActionQueue items={metrics.actionQueue} onNavigateTab={onNavigateTab} />

      {/* 4. Analytics & Stock Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <RevenueTrendChart data={metrics.dailyRevenueTrend} />
        </div>
        <div className="lg:col-span-1">
          <StockSummary metrics={metrics} onNavigateTab={onNavigateTab} />
        </div>
      </div>
    </div>
  );
};
