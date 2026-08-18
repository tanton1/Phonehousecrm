import React, { useState } from 'react';
import { getAuthorizedNavigation } from './permissionNavigation';
import { ChevronLeft, ChevronRight, Sparkles, Smartphone } from 'lucide-react';

export interface DesktopSidebarProps {
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  userRole?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  activeTab,
  onSelectTab,
  userRole = 'ADMIN',
  isCollapsed: controlledCollapsed,
  onToggleCollapse
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;

  const toggleCollapse = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed(prev => !prev);
    }
  };

  const navGroups = getAuthorizedNavigation(userRole);

  return (
    <aside
      className={`hidden lg:flex flex-col bg-white border-r border-zinc-200/80 select-none transition-all duration-300 z-30 shrink-0 ${
        isCollapsed ? 'w-[72px]' : 'w-[230px]'
      }`}
    >
      {/* 1. Header / Logo Brand */}
      <div className="h-14 flex items-center px-4 border-b border-zinc-100 justify-between">
        {!isCollapsed ? (
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#ff4b16] to-[#ff6b3d] flex items-center justify-center text-white shadow-sm shadow-[#ff4b16]/25 shrink-0">
              <Smartphone className="w-4 h-4" />
            </div>
            <div className="flex flex-col truncate">
              <span className="text-sm font-black tracking-tight text-zinc-900 leading-tight">
                Phone<span className="text-[#ff4b16]">House</span>
              </span>
              <span className="text-[10px] font-semibold text-zinc-400 tracking-wider uppercase">
                Enterprise CRM
              </span>
            </div>
          </div>
        ) : (
          <div className="w-full flex justify-center">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#ff4b16] to-[#ff6b3d] flex items-center justify-center text-white shadow-sm shadow-[#ff4b16]/25">
              <Smartphone className="w-4 h-4" />
            </div>
          </div>
        )}
      </div>

      {/* 2. Navigation Items List */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4 scrollbar-thin scrollbar-thumb-zinc-200">
        {navGroups.map(group => (
          <div key={group.id} className="space-y-1">
            {!isCollapsed && (
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                {group.label}
              </div>
            )}
            {group.items.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full flex items-center rounded-xl transition-all group cursor-pointer relative ${
                    isCollapsed ? 'justify-center h-10 px-0' : 'justify-between h-9 px-2.5'
                  } ${
                    isActive
                      ? 'bg-orange-50/80 text-[#ff4b16] font-bold shadow-2xs'
                      : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/70 font-medium'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive ? 'text-[#ff4b16]' : 'text-zinc-400 group-hover:text-zinc-700'
                      }`}
                    />
                    {!isCollapsed && (
                      <span className="text-xs truncate">{item.label}</span>
                    )}
                  </div>

                  {!isCollapsed && item.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-[#ff4b16] font-mono font-bold">
                      {item.badge}
                    </span>
                  )}

                  {!isCollapsed && item.shortcut && (
                    <span className="text-[9px] text-zinc-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      {item.shortcut}
                    </span>
                  )}

                  {/* Active Indicator Bar */}
                  {isActive && (
                    <div className="absolute right-0 top-1.5 bottom-1.5 w-1 bg-[#ff4b16] rounded-l-full" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* 3. Footer Toggle Collapse Button */}
      <div className="p-2 border-t border-zinc-100 flex items-center justify-between">
        {!isCollapsed && (
          <div className="px-2 flex items-center space-x-1.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 py-1 rounded-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Hệ thống sẵn sàng</span>
          </div>
        )}
        <button
          onClick={toggleCollapse}
          className={`p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer ${
            isCollapsed ? 'mx-auto' : ''
          }`}
          title={isCollapsed ? 'Mở rộng Sidebar' : 'Thu gọn Sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
};
