import React, { useState, useEffect } from 'react';
import { DeviceItem, Lead, WarrantyTicket, SalesInvoice } from '../types';
import { Search, Smartphone, Users, Wrench, Receipt, X, ArrowRight, Sparkles } from 'lucide-react';

interface QuickSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices: DeviceItem[];
  leads: Lead[];
  warrantyTickets: WarrantyTicket[];
  invoices: SalesInvoice[];
  onSelectDevice: (device: DeviceItem) => void;
  onSelectLead: (lead: Lead) => void;
  onSelectWarranty: (ticket: WarrantyTicket) => void;
}

export const QuickSearchModal: React.FC<QuickSearchModalProps> = ({
  isOpen,
  onClose,
  devices,
  leads,
  warrantyTickets,
  invoices,
  onSelectDevice,
  onSelectLead,
  onSelectWarranty
}) => {
  const [query, setQuery] = useState('');

  // Keyboard shortcut listener for ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const matchedDevices = devices.filter(d => 
    query.trim() && (
      d.imei.toLowerCase().includes(query.toLowerCase()) ||
      d.serialNo.toLowerCase().includes(query.toLowerCase()) ||
      d.model.toLowerCase().includes(query.toLowerCase()) ||
      (d.customerName && d.customerName.toLowerCase().includes(query.toLowerCase())) ||
      (d.customerPhone && d.customerPhone.includes(query))
    )
  ).slice(0, 4);

  const matchedLeads = leads.filter(l => 
    query.trim() && (
      l.name.toLowerCase().includes(query.toLowerCase()) ||
      l.phone.includes(query) ||
      l.interestedModel.toLowerCase().includes(query.toLowerCase())
    )
  ).slice(0, 3);

  const matchedWarranty = warrantyTickets.filter(w => 
    query.trim() && (
      w.id.toLowerCase().includes(query.toLowerCase()) ||
      w.customerName.toLowerCase().includes(query.toLowerCase()) ||
      w.imei.includes(query) ||
      w.phone.includes(query)
    )
  ).slice(0, 3);

  const totalResults = matchedDevices.length + matchedLeads.length + matchedWarranty.length;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-start justify-center p-3 sm:p-6 pt-12 sm:pt-20">
      <div className="bg-white border border-orange-200 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl space-y-0">
        {/* Search Input Bar */}
        <div className="relative border-b border-zinc-200 p-4 bg-zinc-50 flex items-center">
          <Search className="w-5 h-5 text-orange-600 mr-3 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tra cứu IMEI 15 số, Tên khách, SĐT, Mã bảo hành..."
            className="w-full bg-transparent text-sm sm:text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-zinc-400 hover:text-zinc-600 p-1">
              <X className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="ml-2 text-xs bg-zinc-200 text-zinc-600 px-2 py-1 rounded-lg border border-zinc-300 font-bold">
            ESC
          </button>
        </div>

        {/* Results Container */}
        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-4">
          {!query.trim() ? (
            <div className="py-8 text-center text-zinc-500 text-xs space-y-1">
              <p>Nhập số IMEI (15 số), Serial No, Tên khách hoặc SĐT để tra cứu nhanh.</p>
              <p className="text-[11px] text-orange-600 font-medium">Hỗ trợ tìm kiếm xuyên suốt Kho hàng, Lead CRM & Phiếu bảo hành.</p>
            </div>
          ) : totalResults === 0 ? (
            <div className="py-8 text-center text-zinc-500 text-xs">
              Không tìm thấy kết quả nào khớp với "{query}".
            </div>
          ) : (
            <>
              {/* Devices / IMEI */}
              {matchedDevices.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider flex items-center space-x-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-orange-600" />
                    <span>Kho Máy Theo Số IMEI ({matchedDevices.length})</span>
                  </span>
                  <div className="space-y-1.5">
                    {matchedDevices.map(d => (
                      <div
                        key={d.id}
                        onClick={() => {
                          onSelectDevice(d);
                          onClose();
                        }}
                        className="p-3 bg-white hover:bg-orange-50/50 border border-zinc-200 hover:border-orange-300 rounded-2xl flex items-center justify-between cursor-pointer transition-all shadow-2xs"
                      >
                        <div>
                          <div className="font-bold text-zinc-900 text-xs">{d.model} {d.storage} • {d.color}</div>
                          <div className="text-[11px] font-mono text-orange-700">
                            IMEI: {d.imei} • Pin {d.batteryHealth}% • {d.condition}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-zinc-900 text-xs font-mono">{d.sellPrice.toLocaleString('vi-VN')} đ</span>
                          <span className="block text-[10px] text-zinc-500 uppercase font-bold">{d.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Leads */}
              {matchedLeads.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-zinc-100">
                  <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider flex items-center space-x-1.5">
                    <Users className="w-3.5 h-3.5 text-amber-600" />
                    <span>Khách Hàng CRM ({matchedLeads.length})</span>
                  </span>
                  <div className="space-y-1.5">
                    {matchedLeads.map(l => (
                      <div
                        key={l.id}
                        onClick={() => {
                          onSelectLead(l);
                          onClose();
                        }}
                        className="p-3 bg-white hover:bg-amber-50/50 border border-zinc-200 hover:border-amber-300 rounded-2xl flex items-center justify-between cursor-pointer transition-all shadow-2xs"
                      >
                        <div>
                          <div className="font-bold text-zinc-900 text-xs">{l.name} ({l.phone})</div>
                          <div className="text-[11px] text-zinc-500">Quan tâm: {l.interestedModel}</div>
                        </div>
                        <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-bold">
                          {l.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warranty */}
              {matchedWarranty.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-zinc-100">
                  <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider flex items-center space-x-1.5">
                    <Wrench className="w-3.5 h-3.5 text-orange-600" />
                    <span>Phiếu Bảo Hành ({matchedWarranty.length})</span>
                  </span>
                  <div className="space-y-1.5">
                    {matchedWarranty.map(w => (
                      <div
                        key={w.id}
                        onClick={() => {
                          onSelectWarranty(w);
                          onClose();
                        }}
                        className="p-3 bg-white hover:bg-orange-50/50 border border-zinc-200 hover:border-orange-300 rounded-2xl flex items-center justify-between cursor-pointer transition-all shadow-2xs"
                      >
                        <div>
                          <div className="font-bold text-zinc-900 text-xs">{w.id} • {w.customerName}</div>
                          <div className="text-[11px] text-zinc-500 font-mono">IMEI: {w.imei} • {w.issueType}</div>
                        </div>
                        <span className="text-[10px] bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-bold">
                          {w.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
