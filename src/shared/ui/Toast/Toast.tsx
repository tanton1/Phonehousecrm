import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastProps {
  id: string;
  type: ToastType;
  message: string;
  onClose: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ id, type, message, onClose }) => {
  const typeConfig = {
    success: {
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
      bg: 'bg-emerald-50 border-emerald-200 text-emerald-900'
    },
    error: {
      icon: <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />,
      bg: 'bg-rose-50 border-rose-200 text-rose-900'
    },
    info: {
      icon: <Info className="w-4 h-4 text-blue-600 shrink-0" />,
      bg: 'bg-blue-50 border-blue-200 text-blue-900'
    }
  };

  const config = typeConfig[type];

  return (
    <div
      className={`flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl border shadow-md text-xs font-medium ${config.bg} animate-in slide-in-from-top duration-200`}
    >
      {config.icon}
      <span className="flex-1">{message}</span>
      <button
        onClick={() => onClose(id)}
        className="text-zinc-400 hover:text-zinc-600 transition-colors p-0.5 rounded-md cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
