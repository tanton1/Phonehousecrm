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
          <div className="bg-white rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
              <div>
                <h3 className="text-base font-bold text-zinc-900">Tất Cả Chức Năng</h3>
                <p className="text-xs text-zinc-500">PhoneHouse Enterprise Operations</p>
              </div>
              <button
                onClick={() => setIsMoreDrawerOpen(false)}
                className="p-2 rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {navGroups.map(group => (
                <div key={group.id} className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 px-1">
                    {group.label}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
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
                          className={`flex items-center space-x-2.5 p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                            isActive
                              ? 'bg-orange-50/80 border-orange-200 text-[#ff4b16] font-bold shadow-2xs'
                              : 'bg-zinc-50/70 border-zinc-200/60 text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                              isActive ? 'bg-[#ff4b16] text-white' : 'bg-white text-zinc-500 shadow-2xs'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <span className="text-xs truncate flex-1">{item.label}</span>
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
