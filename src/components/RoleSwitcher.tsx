import React, { useState } from 'react';
import { ShieldCheck, ShoppingCart, Wrench, ChevronDown, UserCircle } from 'lucide-react';

export type WorkspaceMode = 'ADMIN' | 'SALES' | 'TECH';

interface RoleSwitcherProps {
  currentMode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
}

export const RoleSwitcher: React.FC<RoleSwitcherProps> = ({ currentMode, onModeChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  const roles = [
    { id: 'ADMIN', label: 'Admin / CHT', icon: ShieldCheck, color: 'text-purple-600', bg: 'bg-purple-100' },
    { id: 'SALES', label: 'NV Bán Hàng', icon: ShoppingCart, color: 'text-orange-600', bg: 'bg-orange-100' },
    { id: 'TECH', label: 'Kỹ Thuật Viên', icon: Wrench, color: 'text-blue-600', bg: 'bg-blue-100' }
  ];

  const activeRole = roles.find(r => r.id === currentMode) || roles[0];
  const ActiveIcon = activeRole.icon;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-48 bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden animate-scaleIn origin-bottom-right">
          <div className="p-3 bg-zinc-900 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2">
            <UserCircle className="w-4 h-4" /> Mode Preview
          </div>
          <div className="p-1 space-y-1">
            {roles.map(role => {
              const Icon = role.icon;
              return (
                <button
                  key={role.id}
                  onClick={() => {
                    onModeChange(role.id as WorkspaceMode);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-sm font-medium transition-colors ${
                    currentMode === role.id 
                      ? 'bg-zinc-100 text-zinc-900 font-bold'
                      : 'hover:bg-zinc-50 text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <div className={`p-1.5 rounded-lg ${role.bg} ${role.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  {role.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-full shadow-xl transition-transform hover:scale-105 active:scale-95"
      >
        <div className={`p-1 rounded-full bg-white/20`}>
          <ActiveIcon className="w-4 h-4" />
        </div>
        <span className="text-sm font-bold">{activeRole.label}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
    </div>
  );
};
