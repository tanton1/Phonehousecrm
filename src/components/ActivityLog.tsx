import React from 'react';
import { History } from 'lucide-react';
import { ActionLogEntry } from '../types';

interface ActivityLogProps {
  logs?: ActionLogEntry[];
  title?: string;
  className?: string;
}

export const ActivityLog: React.FC<ActivityLogProps> = ({ 
  logs, 
  title = 'Lịch Sử Cập Nhật (Activity Log)',
  className = "space-y-2 pt-2 border-t border-zinc-100"
}) => {
  if (!logs || logs.length === 0) return null;

  return (
    <div className={className}>
      <h4 className="font-semibold text-zinc-900 uppercase text-[11px] tracking-wider flex items-center gap-1.5">
        <History className="w-3.5 h-3.5 text-zinc-500" />
        <span>{title}</span>
      </h4>
      <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 space-y-3">
        {logs.map((log, idx) => (
          <div key={idx} className="flex gap-3 relative">
            {idx !== logs.length - 1 && (
              <div className="absolute left-1.5 top-5 bottom-[-12px] w-[1px] bg-zinc-200"></div>
            )}
            <div className="w-3 h-3 rounded-full bg-orange-200 border-2 border-white shrink-0 mt-1 z-10"></div>
            <div className="flex-1 text-[11px]">
              <div className="flex justify-between items-start mb-0.5">
                <span className="font-bold text-zinc-900">{log.action}</span>
                <span className="text-zinc-500 font-mono text-[9px]">{log.time}</span>
              </div>
              <div className="text-zinc-600 mb-0.5">{log.user}</div>
              {log.note && (
                <div className="text-zinc-500 italic bg-white p-1.5 rounded-lg border border-zinc-100 mt-1">
                  "{log.note}"
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
