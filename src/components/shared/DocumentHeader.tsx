import React from 'react';
import { LucideIcon, Printer, X } from 'lucide-react';

export interface DocumentHeaderProps {
  icon?: LucideIcon;
  code: string;
  typeLabel: string;
  date?: string;
  statusBadge?: React.ReactNode;
  branchName?: string;
  onPrint?: () => void;
  onClose?: () => void;
  actions?: React.ReactNode;
  extraInfo?: React.ReactNode;
}

export const DocumentHeader: React.FC<DocumentHeaderProps> = ({
  icon: Icon,
  code,
  typeLabel,
  date,
  statusBadge,
  branchName,
  onPrint,
  onClose,
  actions,
  extraInfo
}) => {
  return (
    <div className="relative shrink-0 overflow-hidden rounded-none border-b border-zinc-800 bg-gradient-to-r from-zinc-950 via-zinc-900 to-black p-4 text-white sm:rounded-t-3xl sm:p-5">
      {/* Subtle orange glow */}
      <div className="absolute top-0 left-1/3 w-80 h-10 bg-[#FF4B16]/15 blur-2xl pointer-events-none" />
      
      <div className="flex items-start justify-between gap-3 relative z-10">
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          {Icon && (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF4B16] to-orange-600 text-white flex items-center justify-center font-bold shrink-0 shadow-md shadow-[#FF4B16]/25">
              <Icon className="w-5 h-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#FF4B16]">
                {typeLabel}
              </span>
              <span className="text-sm sm:text-base font-black font-mono text-white tracking-tight">
                {code}
              </span>
              {statusBadge}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 mt-1">
              {date && <span>{date}</span>}
              {branchName && (
                <>
                  <span>•</span>
                  <span>{branchName}</span>
                </>
              )}
              {extraInfo}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 shrink-0 relative z-10">
          {actions}
          {onPrint && (
            <button
              type="button"
              onClick={onPrint}
              className="p-2 text-zinc-300 hover:text-white hover:bg-zinc-800/80 rounded-xl transition-all cursor-pointer"
              title="In chứng từ"
            >
              <Printer className="w-4 h-4" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-zinc-300 hover:text-white hover:bg-zinc-800/80 rounded-xl transition-all cursor-pointer"
              title="Đóng (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
