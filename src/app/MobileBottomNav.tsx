import React, { useState } from 'react';
import { MOBILE_PRIMARY_TABS, getMobilePrimaryTabs } from './navigationConfig';
import { getAuthorizedNavigation } from './permissionNavigation';
import { X } from 'lucide-react';

export interface MobileBottomNavProps {
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  userRole?: string;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
  userRole = 'SALES'
}) => {
  const [isMoreDrawerOpen, setIsMoreDrawerOpen] = useState(false);
  const navGroups = getAuthorizedNavigation(userRole);
  const primaryTabs = getMobilePrimaryTabs(userRole);

  const handleTabClick = (tabId: string) => {
    if (tabId === 'menu' || tabId === 'more') {
      setIsMoreDrawerOpen(true);
    } else {
      onSelectTab(tabId);
    }
  };

  return (
    <>
      {/* 1. Fixed Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-zinc-200/80 px-2 py-1.5 flex items-center justify-around lg:hidden shadow-lg pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {primaryTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = tab.id === 'menu' ? isMoreDrawerOpen : activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all relative cursor-pointer ${
                isActive ? 'text-[#ff4b16]' : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Icon className="w-5 h-5 transition-transform active:scale-90" />
              <span className="text-[10px] font-semibold mt-0.5 tracking-tight">{tab.label}</span>
              {isActive && tab.id !== 'menu' && (
                <span className="absolute -top-1 w-1 h-1 bg-[#ff4b16] rounded-full" />
              )}
            </button>
          );
        })}
      </nav>

      {/* 2. Fullscreen "More / Thêm" Drawer */}
      {isMoreDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end lg:hidden animate-in fade-in duration-200">
          <div className="flex max-h-[88vh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <div>
                <h3 className="text-base font-black text-zinc-900">Xem thêm</h3>
                <p className="text-xs text-zinc-500">Các chức năng theo nhóm nghiệp vụ</p>
              </div>
              <button
                onClick={() => setIsMoreDrawerOpen(false)}
                className="p-2 text-zinc-600 transition-colors hover:text-amber-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 space-y-3 overflow-y-auto bg-white p-4 pb-8">
              {navGroups.map(group => (
                <div key={group.id} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm shadow-zinc-100/80">
                  <div className="px-1 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                    {group.label}
                  </div>
                  <div className="grid grid-cols-3 gap-x-3 gap-y-5">
                    {group.items.map(item => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;

                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            onSelectTab(item.id);
                            setIsMoreDrawerOpen(false);
                          }}
                          className={`flex min-w-0 cursor-pointer flex-col items-center gap-2 py-1 text-center transition-all ${
                            isActive ? 'font-black text-zinc-950' : 'text-zinc-700 hover:text-zinc-950'
                          }`}
                        >
                          <Icon className={`h-6 w-6 text-amber-500 transition-transform active:scale-90 ${isActive ? 'scale-105 text-amber-600' : ''}`} />
                          <span className="line-clamp-2 text-[11px] font-bold leading-4">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
