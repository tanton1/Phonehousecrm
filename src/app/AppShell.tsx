import React, { useState } from 'react';
import { DesktopSidebar } from './DesktopSidebar';
import { AppHeader } from './AppHeader';
import { MobileBottomNav } from './MobileBottomNav';
import { StoreBranch, StaffMember } from '../types';

export interface AppShellProps {
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  currentUser: StaffMember | null;
  currentBranch: StoreBranch;
  branches: StoreBranch[];
  selectedBranchId?: string;
  onSelectBranchId?: (branchId: string) => void;
  onSelectBranch: (branch: StoreBranch) => void;
  onLogout: () => void;
  onOpenQuickSearch?: () => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeTab,
  onSelectTab,
  currentUser,
  currentBranch,
  branches,
  selectedBranchId,
  onSelectBranchId,
  onSelectBranch,
  onLogout,
  onOpenQuickSearch,
  children
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-50 font-sans">
      {/* 1. Desktop Collapsible Sidebar */}
      <DesktopSidebar
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        userRole={currentUser?.role}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
      />

      {/* 2. Main Content Area & App Header */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <AppHeader
          currentUser={currentUser}
          currentBranch={currentBranch}
          branches={branches}
          selectedBranchId={selectedBranchId}
          onSelectBranchId={onSelectBranchId}
          onSelectBranch={onSelectBranch}
          onLogout={onLogout}
          onOpenQuickSearch={onOpenQuickSearch}
        />

        <main className={`flex-1 ${
          activeTab === 'pos'
            ? 'p-0 overflow-hidden'
            : activeTab === 'dashboard'
              ? 'p-0 overflow-y-auto'
              : 'overflow-y-auto p-2 sm:p-4 lg:p-5 pb-20 lg:pb-6 scrollbar-thin scrollbar-thumb-zinc-200'
        }`}>
          <div className={`${
            activeTab === 'pos' || activeTab === 'dashboard'
              ? 'w-full h-full max-w-none'
              : ['chat', 'crm', 'warranty', 'tradein', 'funds', 'inventory', 'purchase-orders'].includes(activeTab)
                ? 'w-full max-w-none px-2 sm:px-4'
                : 'max-w-7xl mx-auto w-full'
          }`}>
            {children}
          </div>
        </main>
      </div>

      {/* 3. Mobile Bottom Navigation */}
      <MobileBottomNav
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        userRole={currentUser?.role}
      />
    </div>
  );
};
