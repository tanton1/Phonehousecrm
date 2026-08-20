import React, { useState, useMemo } from 'react';
import { Lead, Customer, CustomerTierConfig, SalesInvoice, WarrantyTicket } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { normalizeVietnamPhone, formatDisplayPhone } from '../../../utils/phoneUtils';
import { 
  User, 
  Phone, 
  Award, 
  ShoppingBag, 
  Wrench, 
  Clock, 
  DollarSign, 
  MessageSquare, 
  X, 
  Plus, 
  CheckCircle2,
  Smartphone,
  Sparkles,
  RefreshCw,
  Send,
  ShieldCheck,
  Calendar,
  Check
} from 'lucide-react';

export interface NextBestActionRecommendation {
  actionType: 'TRADE_IN' | 'WARRANTY_CARE' | 'HOT_DEAL' | 'INSTALLMENT' | 'VIP_CARE';
  title: string;
  desc: string;
  actionText: string;
  confidence?: number;
  campaignCode?: string;
  suggestedTemplate?: string;
}

export interface Customer360DrawerProps {
  lead?: Lead | null;
  customer?: Customer | null;
  leads?: Lead[];
  isOpen: boolean;
  onClose: () => void;
  invoices: SalesInvoice[];
  warrantyTickets: WarrantyTicket[];
  customerTiers?: CustomerTierConfig[];
  onAddTimelineNote?: (targetId: string, note: string) => Promise<void> | void;
  onTriggerNextBestAction?: (action: NextBestActionRecommendation, target: { name: string; phone: string; customerId?: string }) => void;
  onSelectLead?: (lead: Lead) => void;
}

export const Customer360Drawer: React.FC<Customer360DrawerProps> = ({
  lead,
  customer,
  leads = [],
  isOpen,
  onClose,
  invoices,
  warrantyTickets,
  customerTiers,
  onAddTimelineNote,
  onTriggerNextBestAction,
  onSelectLead
}) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'OPPORTUNITIES' | 'DEVICES' | 'ORDERS' | 'WARRANTY' | 'TIMELINE'>('OVERVIEW');
  const [noteInput, setNoteInput] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [actionSuccessNotice, setActionSuccessNotice] = useState<string | null>(null);

  // Identity extraction from customer or lead
  const displayName = customer?.name || lead?.name || 'Khách Hàng';
  const rawPhone = customer?.primaryPhone || lead?.phone || lead?.phoneNormalized || '';
  const customerId = customer?.id || lead?.customerId;
  const targetId = lead?.id || customer?.id || 'TARGET_UNKNOWN';

  // Normalized phone
  const normalizedPhone = useMemo(() => {
    return normalizeVietnamPhone(rawPhone);
  }, [rawPhone]);

  // Filter all opportunity leads for this customer (without merging them)
  const customerLeads = useMemo(() => {
    return leads.filter(l => {
      if (customerId && l.customerId === customerId) return true;
      if (normalizedPhone) {
        const lPhone = normalizeVietnamPhone(l.phoneNormalized || l.phone);
        return lPhone === normalizedPhone;
      }
      return false;
    });
  }, [leads, customerId, normalizedPhone]);

  // Filter invoices for this customer by customerId or normalized phone
  const customerInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (customerId && inv.customerId === customerId) return true;
      if (normalizedPhone) {
        const invPhone = normalizeVietnamPhone(inv.customerPhone || (inv as any).phone);
        return invPhone === normalizedPhone;
      }
      return false;
    });
  }, [invoices, customerId, normalizedPhone]);

  // Filter warranty tickets by customerId or normalized phone
  const customerWarranties = useMemo(() => {
    return warrantyTickets.filter(w => {
      if (customerId && w.customerId === customerId) return true;
      if (normalizedPhone) {
        const wPhone = normalizeVietnamPhone(w.phone);
        return wPhone === normalizedPhone;
      }
      return false;
    });
  }, [warrantyTickets, customerId, normalizedPhone]);

  // Extract owned devices from paid/completed invoices without fake battery / fake warranty assumptions
  const ownedDevices = useMemo(() => {
    const list: Array<{
      id: string;
      model: string;
      imeiMasked: string;
      color?: string;
      storage?: string;
      batteryHealth: number | null;
      purchaseDate: string;
      warrantyExpiry: string;
      invoiceCode: string;
      price: number;
    }> = [];

    customerInvoices.forEach(inv => {
      if (inv.status === 'cancelled') return;
      if (inv.items && inv.items.length > 0) {
        inv.items.forEach((item, idx) => {
          const imei = item.imei || '';
          const imeiMasked = imei.length >= 4 ? `••••••••${imei.slice(-4)}` : 'Chưa kích hoạt IMEI';
          const pDate = inv.createdAt || inv.createdDate || '';
          
          // Determine accurate warranty expiry
          let warrantyExpiry = 'Theo chính sách hóa đơn';
          if (item.warrantyExpiryDate) {
            warrantyExpiry = item.warrantyExpiryDate.slice(0, 10);
          } else if (item.warrantyMonths && pDate) {
            try {
              const pDateObj = new Date(pDate);
              pDateObj.setMonth(pDateObj.getMonth() + item.warrantyMonths);
              warrantyExpiry = pDateObj.toISOString().split('T')[0];
            } catch (e) {}
          } else if (pDate) {
            // Default explicit label with purchase date
            warrantyExpiry = `BH 12T (từ ${pDate.slice(0, 10)})`;
          }

          list.push({
            id: `${inv.id}-${idx}`,
            model: item.productName || item.model || 'iPhone',
            imeiMasked,
            color: (item as any).color,
            storage: (item as any).storage,
            batteryHealth: item.batteryHealth != null ? item.batteryHealth : ((item as any).batteryHealth ?? null),
            purchaseDate: pDate ? pDate.slice(0, 10) : 'Chưa rõ',
            warrantyExpiry,
            invoiceCode: inv.invoiceCode || inv.id,
            price: item.price || 0
          });
        });
      }
    });

    return list;
  }, [customerInvoices]);

  // Calculate LTV
  const totalLtv = useMemo(() => {
    return customerInvoices
      .filter(inv => inv.status !== 'cancelled')
      .reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);
  }, [customerInvoices]);

  // VIP Tier calculation based on configurable tier thresholds
  const vipInfo = useMemo(() => {
    if (customer?.vipTier) {
      if (customer.vipTier === 'DIAMOND') return { name: 'KIM CƯƠNG (DIAMOND)', badge: 'bg-purple-100 text-purple-700 border-purple-200' };
      if (customer.vipTier === 'GOLD') return { name: 'VÀNG (GOLD)', badge: 'bg-amber-100 text-amber-800 border-amber-200' };
      if (customer.vipTier === 'SILVER') return { name: 'BẠC (SILVER)', badge: 'bg-blue-100 text-blue-700 border-blue-200' };
    }

    if (customerTiers && customerTiers.length > 0) {
      const sorted = [...customerTiers].sort((a, b) => b.minSpend - a.minSpend);
      const matched = sorted.find(t => totalLtv >= t.minSpend);
      if (matched) {
        return {
          name: matched.name,
          badge: matched.tier === 'DIAMOND' 
            ? 'bg-purple-100 text-purple-700 border-purple-200' 
            : matched.tier === 'GOLD' 
            ? 'bg-amber-100 text-amber-800 border-amber-200' 
            : 'bg-blue-100 text-blue-700 border-blue-200'
        };
      }
    }

    if (totalLtv >= 100_000_000) return { name: 'KIM CƯƠNG (DIAMOND)', badge: 'bg-purple-100 text-purple-700 border-purple-200' };
    if (totalLtv >= 50_000_000) return { name: 'VÀNG (GOLD)', badge: 'bg-amber-100 text-amber-800 border-amber-200' };
    if (totalLtv >= 20_000_000) return { name: 'BẠC (SILVER)', badge: 'bg-blue-100 text-blue-700 border-blue-200' };
    return { name: 'THÀNH VIÊN (STANDARD)', badge: 'bg-zinc-100 text-zinc-700 border-zinc-200' };
  }, [totalLtv, customer, customerTiers]);

  // Next Best Action Engine
  const nextBestAction: NextBestActionRecommendation = useMemo(() => {
    if (ownedDevices.length > 0) {
      const primaryDevice = ownedDevices[0];
      const purchaseTime = primaryDevice.purchaseDate !== 'Chưa rõ' ? new Date(primaryDevice.purchaseDate).getTime() : Date.now();
      const monthsUsed = Math.floor((Date.now() - purchaseTime) / (1000 * 60 * 60 * 24 * 30));

      if (monthsUsed >= 12) {
        return {
          actionType: 'TRADE_IN',
          title: `Gợi ý lên đời dòng mới (Đã dùng ${primaryDevice.model} ~${monthsUsed} tháng)`,
          desc: `Khách đã sử dụng thiết bị được hơn 1 năm. Gợi ý chương trình Thu Cũ Đổi Mới trợ giá hấp dẫn khi lên đời dòng iPhone mới nhất.`,
          actionText: 'Tạo Báo Giá Thu Cũ',
          confidence: 0.88,
          campaignCode: 'CAMPAIGN_TRADEIN_LOYAL',
          suggestedTemplate: `Chào ${displayName}, PhoneHouse hiện có ưu đãi trợ giá thu cũ lên đời dành riêng cho máy ${primaryDevice.model} của bạn.`
        };
      }

      return {
        actionType: 'WARRANTY_CARE',
        title: `Chăm sóc sau bán & Vệ sinh thiết bị`,
        desc: `Thiết bị ${primaryDevice.model} đang sử dụng. Gợi ý khách đến showroom để vệ sinh loa, dán cường lực và kiểm tra pin miễn phí.`,
        actionText: 'Gửi Lời Nhắc Chăm Sóc',
        confidence: 0.75,
        campaignCode: 'CARE_POST_PURCHASE',
        suggestedTemplate: `Chào ${displayName}, định kỳ mời bạn ghé PhoneHouse vệ sinh máy và dán lại cường lực miễn phí nhé!`
      };
    }

    if (lead?.budget && lead.budget > 25_000_000) {
      return {
        actionType: 'HOT_DEAL',
        title: `Tư vấn chốt suất giữ máy Pro Max`,
        desc: `Khách hàng có ngân sách lớn (${(lead.budget / 1_000_000).toFixed(1)}tr) quan tâm ${lead.interestedModel || 'iPhone Pro Max'}. Gửi báo giá ưu đãi độc quyền.`,
        actionText: 'Tạo Báo Giá Ưu Đãi',
        confidence: 0.92,
        campaignCode: 'PREMIUM_BUYER',
        suggestedTemplate: `Chào ${displayName}, PhoneHouse vừa về sẵn hàng ${lead.interestedModel || 'iPhone'} với mức giá và quà tặng tốt nhất trong tuần này.`
      };
    }

    return {
      actionType: 'INSTALLMENT',
      title: `Tư vấn chương trình trả góp 0%`,
      desc: `Tư vấn gói duyệt hồ sơ trả góp duyệt nhanh online qua CCCD không cần trả trước.`,
      actionText: 'Gửi Bảng Tính Trả Góp',
      confidence: 0.65,
      campaignCode: 'FINANCIAL_ZERO_PCT',
      suggestedTemplate: `Chào ${displayName}, PhoneHouse hỗ trợ trả góp 0% lãi suất với thủ tục đơn giản, nhận máy dùng ngay.`
    };
  }, [ownedDevices, lead, displayName]);

  if (!isOpen || (!lead && !customer)) return null;

  const handleSaveNote = async () => {
    if (!noteInput.trim() || !onAddTimelineNote) return;
    setIsSubmittingNote(true);
    try {
      await onAddTimelineNote(targetId, noteInput.trim());
      setNoteInput('');
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handleExecuteAction = () => {
    if (onTriggerNextBestAction) {
      onTriggerNextBestAction(nextBestAction, { name: displayName, phone: rawPhone, customerId });
    } else {
      // Inline feedback state
      setActionSuccessNotice(`Đã tạo tác vụ: "${nextBestAction.actionText}" cho ${displayName}`);
      setTimeout(() => setActionSuccessNotice(null), 3500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg h-full flex flex-col shadow-2xl border-l border-zinc-200 animate-in slide-in-from-right duration-300">
        {/* 1. Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-orange-100 text-[#ff4b16] flex items-center justify-center font-bold text-base">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-black text-zinc-900 leading-snug">{displayName}</h3>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${vipInfo.badge}`}>
                  {vipInfo.name}
                </span>
              </div>
              <p className="text-xs text-zinc-500 font-mono flex items-center space-x-1 mt-0.5">
                <Phone className="w-3 h-3 text-zinc-400" />
                <span>{formatDisplayPhone(rawPhone)}</span>
                {customerId && (
                  <span className="text-[10px] text-zinc-400 font-sans ml-2">ID: {customerId}</span>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. KPI Metrics Bar */}
        <div className="p-3.5 bg-zinc-50/80 border-b border-zinc-100 grid grid-cols-4 gap-2 text-xs">
          <div className="p-2 bg-white border border-zinc-200/80 rounded-xl">
            <span className="text-[10px] text-zinc-400 block font-semibold">LTV Chi Tiêu</span>
            <span className="font-bold font-mono text-[#ff4b16] text-xs mt-0.5 block truncate">
              {(totalLtv / 1_000_000).toFixed(1)}tr
            </span>
          </div>

          <div className="p-2 bg-white border border-zinc-200/80 rounded-xl">
            <span className="text-[10px] text-zinc-400 block font-semibold">Đơn Mua</span>
            <span className="font-bold font-mono text-zinc-800 text-xs mt-0.5 block">
              {customerInvoices.length} đơn
            </span>
          </div>

          <div className="p-2 bg-white border border-zinc-200/80 rounded-xl">
            <span className="text-[10px] text-zinc-400 block font-semibold">Máy Sở Hữu</span>
            <span className="font-bold font-mono text-zinc-800 text-xs mt-0.5 block">
              {ownedDevices.length} máy
            </span>
          </div>

          <div className="p-2 bg-white border border-zinc-200/80 rounded-xl">
            <span className="text-[10px] text-zinc-400 block font-semibold">Bảo Hành</span>
            <span className="font-bold font-mono text-zinc-800 text-xs mt-0.5 block">
              {customerWarranties.length} lần
            </span>
          </div>
        </div>

        {/* Action Success Alert Notification */}
        {actionSuccessNotice && (
          <div className="mx-4 mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-2 text-xs text-emerald-800 font-bold animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccessNotice}</span>
          </div>
        )}

        {/* 3. Next Best Action Recommendation Card */}
        <div className="p-3.5 mx-4 mt-3 bg-linear-to-r from-orange-50 to-amber-50 border border-orange-200/90 rounded-2xl space-y-2 text-xs">
          <div className="flex items-center space-x-1.5 font-bold text-[#ff4b16]">
            <Sparkles className="w-4 h-4" />
            <span>⚡ GỢI Ý HÀNH ĐỘNG HÔM NAY (NEXT BEST ACTION)</span>
          </div>
          <div>
            <p className="font-bold text-zinc-900">{nextBestAction.title}</p>
            <p className="text-[11px] text-zinc-600 mt-0.5 leading-relaxed">{nextBestAction.desc}</p>
          </div>
          <div className="pt-1 flex items-center space-x-2">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Send className="w-3 h-3" />}
              className="text-[11px] h-7"
              onClick={handleExecuteAction}
            >
              {nextBestAction.actionText}
            </Button>
            {rawPhone && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Phone className="w-3 h-3" />}
                className="text-[11px] h-7 bg-white"
                onClick={() => window.open(`tel:${rawPhone}`)}
              >
                Gọi Khách
              </Button>
            )}
          </div>
        </div>

        {/* 4. Navigation Tabs with responsive horizontal scrolling on mobile */}
        <div className="flex items-center space-x-1 px-4 border-b border-zinc-100 text-xs font-bold bg-white mt-2 overflow-x-auto whitespace-nowrap scrollbar-thin">
          <button
            onClick={() => setActiveTab('OVERVIEW')}
            className={`py-2.5 px-3 border-b-2 transition-all shrink-0 cursor-pointer ${
              activeTab === 'OVERVIEW'
                ? 'border-[#ff4b16] text-[#ff4b16]'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Nhu Cầu
          </button>

          <button
            onClick={() => setActiveTab('OPPORTUNITIES')}
            className={`py-2.5 px-3 border-b-2 transition-all shrink-0 cursor-pointer ${
              activeTab === 'OPPORTUNITIES'
                ? 'border-[#ff4b16] text-[#ff4b16]'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Cơ Hội / Lead ({customerLeads.length})
          </button>

          <button
            onClick={() => setActiveTab('DEVICES')}
            className={`py-2.5 px-3 border-b-2 transition-all shrink-0 cursor-pointer ${
              activeTab === 'DEVICES'
                ? 'border-[#ff4b16] text-[#ff4b16]'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Thiết Bị ({ownedDevices.length})
          </button>

          <button
            onClick={() => setActiveTab('ORDERS')}
            className={`py-2.5 px-3 border-b-2 transition-all shrink-0 cursor-pointer ${
              activeTab === 'ORDERS'
                ? 'border-[#ff4b16] text-[#ff4b16]'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Đơn Hàng ({customerInvoices.length})
          </button>

          <button
            onClick={() => setActiveTab('WARRANTY')}
            className={`py-2.5 px-3 border-b-2 transition-all shrink-0 cursor-pointer ${
              activeTab === 'WARRANTY'
                ? 'border-[#ff4b16] text-[#ff4b16]'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Bảo Hành ({customerWarranties.length})
          </button>

          <button
            onClick={() => setActiveTab('TIMELINE')}
            className={`py-2.5 px-3 border-b-2 transition-all shrink-0 cursor-pointer ${
              activeTab === 'TIMELINE'
                ? 'border-[#ff4b16] text-[#ff4b16]'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Nhật Ký
          </button>
        </div>

        {/* 5. Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          
          {/* TAB: OPPORTUNITIES (Multi-lead 360 view) */}
          {activeTab === 'OPPORTUNITIES' && (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between font-bold text-zinc-900">
                <span>Tất cả cơ hội mua hàng của khách ({customerLeads.length})</span>
              </div>
              {customerLeads.length === 0 ? (
                <div className="py-8 text-center text-zinc-400 font-medium">
                  Chưa có cơ hội/lead nào được liên kết với khách hàng này.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {customerLeads.map(cl => (
                    <div 
                      key={cl.id} 
                      className="bg-zinc-50 rounded-2xl p-3.5 border border-zinc-200 hover:border-zinc-300 transition-colors space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-zinc-900 text-sm">{cl.interestedModel}</span>
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          cl.status === 'won' ? 'bg-emerald-100 text-emerald-800' :
                          cl.status === 'lost' ? 'bg-rose-100 text-rose-800' :
                          cl.status === 'appointment_scheduled' ? 'bg-purple-100 text-purple-800' :
                          'bg-orange-100 text-[#FF4B16]'
                        }`}>
                          {cl.status === 'won' ? '✓ Đã Mua (Won)' :
                           cl.status === 'lost' ? '❌ Thất Bại (Lost)' :
                           cl.status === 'appointment_scheduled' ? 'Lịch Hẹn' :
                           cl.status === 'deposit' ? 'Đã Cọc' :
                           'Đang Tư Vấn'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-zinc-500 text-[11px]">
                        <span>Ngân sách: <strong>{cl.budget ? `${(cl.budget / 1000000).toFixed(1)}Tr` : 'Linh hoạt'}</strong></span>
                        <span>Phụ trách: <strong>{cl.assignedStaff}</strong></span>
                      </div>

                      {cl.lastCustomerResponse && (
                        <div className="text-[11px] text-zinc-600 italic bg-white p-2 rounded-xl border border-zinc-100">
                          "{cl.lastCustomerResponse}"
                        </div>
                      )}

                      {onSelectLead && (
                        <div className="pt-1 text-right">
                          <button
                            onClick={() => {
                              onSelectLead(cl);
                              onClose();
                            }}
                            className="text-[#FF4B16] font-bold text-[11px] hover:underline"
                          >
                            Mở chi tiết Lead →
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-3">
              <div className="p-4 bg-zinc-50 border border-zinc-200/80 rounded-2xl space-y-2.5">
                <h4 className="font-bold text-zinc-900">Thông Tin Khách Hàng & Nhu Cầu</h4>
                <div className="grid grid-cols-2 gap-2 text-zinc-600">
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Dòng máy quan tâm:</span>
                    <span className="font-bold text-zinc-800">{lead?.interestedModel || 'Chưa chọn máy'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Ngân sách dự kiến:</span>
                    <span className="font-bold font-mono text-[#ff4b16]">
                      {lead?.budget ? `${(lead.budget / 1_000_000).toFixed(1)} triệu` : 'Linh hoạt'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Nguồn tiếp nhận:</span>
                    <span className="font-bold text-zinc-800">{lead?.source || 'Khách vãng lai'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Nhân viên chăm sóc:</span>
                    <span className="font-bold text-zinc-800">{lead?.assignedStaff || 'Chưa gán'}</span>
                  </div>
                </div>

                {lead?.nextAction && (
                  <div className="p-2.5 bg-orange-50/70 border border-orange-200 rounded-xl space-y-1">
                    <span className="text-[10px] font-bold text-[#ff4b16] uppercase block">Kế Hoạch Tiếp Theo:</span>
                    <div className="flex justify-between items-center text-zinc-800 font-semibold">
                      <span>Loại: {lead.nextAction.type}</span>
                      <span className="font-mono text-zinc-600">{lead.nextAction.dueAt || 'Chưa đặt giờ'}</span>
                    </div>
                  </div>
                )}

                {lead?.notes && (
                  <div className="pt-2 border-t border-zinc-200/60">
                    <span className="text-[10px] text-zinc-400 block">Ghi chú tư vấn:</span>
                    <p className="text-zinc-700 mt-0.5 leading-relaxed">{lead.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: OWNED DEVICES */}
          {activeTab === 'DEVICES' && (
            <div className="space-y-3">
              {ownedDevices.length === 0 ? (
                <div className="p-8 text-center text-zinc-400 bg-zinc-50 border border-dashed border-zinc-200 rounded-2xl">
                  <Smartphone className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                  <p className="font-semibold text-zinc-600">Chưa có thiết bị nào</p>
                  <p className="text-[11px] text-zinc-400 mt-1">Dữ liệu thiết bị sẽ tự động ghi nhận khi khách hoàn tất đơn hàng POS.</p>
                </div>
              ) : (
                ownedDevices.map(dev => (
                  <div
                    key={dev.id}
                    className="p-3.5 bg-zinc-50 border border-zinc-200/80 rounded-2xl space-y-2"
                  >
                    <div className="flex items-center justify-between font-bold">
                      <div className="flex items-center space-x-2">
                        <Smartphone className="w-4 h-4 text-[#ff4b16]" />
                        <span className="text-zinc-900">{dev.model}</span>
                      </div>
                      <span className="font-mono text-[#ff4b16]">
                        {(dev.price).toLocaleString('vi-VN')}đ
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-600 bg-white p-2.5 rounded-xl border border-zinc-200/60">
                      <div>
                        <span className="text-[10px] text-zinc-400 block">IMEI:</span>
                        <span className="font-mono font-bold text-zinc-800">{dev.imeiMasked}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 block">Pin lúc bán:</span>
                        {dev.batteryHealth != null ? (
                          <span className={`font-mono font-bold ${dev.batteryHealth >= 85 ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {dev.batteryHealth}%
                          </span>
                        ) : (
                          <span className="text-zinc-400 italic">Chưa ghi nhận</span>
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 block">Ngày mua:</span>
                        <span className="font-mono">{dev.purchaseDate}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 block">Hạn bảo hành:</span>
                        <span className="font-mono font-bold text-[#ff4b16]">{dev.warrantyExpiry}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: ORDERS */}
          {activeTab === 'ORDERS' && (
            <div className="space-y-2.5">
              {customerInvoices.length === 0 ? (
                <div className="p-8 text-center text-zinc-400 bg-zinc-50 border border-dashed border-zinc-200 rounded-2xl">
                  Khách hàng chưa phát sinh hóa đơn mua hàng.
                </div>
              ) : (
                customerInvoices.map(inv => (
                  <div
                    key={inv.id}
                    className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-zinc-900">{inv.invoiceCode || inv.id}</span>
                      <span className="font-mono font-bold text-[#ff4b16]">
                        {(inv.finalAmount || 0).toLocaleString('vi-VN')}đ
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span>{inv.createdAt || inv.createdDate || ''}</span>
                      <span className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                        inv.status === 'completed' 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : inv.status === 'cancelled'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {inv.status === 'completed' ? 'Đã hoàn tất' : inv.status === 'cancelled' ? 'Đã hủy' : 'Chờ xử lý'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 4: WARRANTY */}
          {activeTab === 'WARRANTY' && (
            <div className="space-y-2.5">
              {customerWarranties.length === 0 ? (
                <div className="p-8 text-center text-zinc-400 bg-zinc-50 border border-dashed border-zinc-200 rounded-2xl">
                  Chưa có lịch sử bảo hành hoặc sửa chữa.
                </div>
              ) : (
                customerWarranties.map(w => (
                  <div
                    key={w.id}
                    className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-zinc-900">{w.ticketNumber}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-orange-100 text-[#ff4b16]">
                        {w.status}
                      </span>
                    </div>
                    <div className="text-zinc-700 font-semibold">{w.model} • {w.faultDescription}</div>
                    <div className="text-[10px] text-zinc-400 flex items-center justify-between">
                      <span>KTV: {w.technician}</span>
                      <span>{w.receivedDate}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 5: TIMELINE & NOTES */}
          {activeTab === 'TIMELINE' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <textarea
                  value={noteInput}
                  onChange={e => setNoteInput(e.target.value)}
                  placeholder="Nhập nhật ký chăm sóc, phản hồi của khách hàng..."
                  rows={3}
                  className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-[#ff4b16]"
                />
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveNote}
                    isLoading={isSubmittingNote}
                    disabled={!noteInput.trim()}
                    leftIcon={<Plus className="w-3.5 h-3.5" />}
                  >
                    Lưu Nhật Ký
                  </Button>
                </div>
              </div>

              <div className="p-3 bg-zinc-50 border border-zinc-200/60 rounded-xl space-y-2">
                <div className="flex items-center space-x-2 text-zinc-500 text-[11px]">
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Thời gian tiếp nhận: {lead?.createdAt || customer?.createdAt || 'Hôm nay'}</span>
                </div>
                {lead?.lastContactedAt && (
                  <div className="flex items-center space-x-2 text-zinc-500 text-[11px]">
                    <Phone className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Liên hệ gần nhất: {lead.lastContactedAt}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 6. Footer */}
        <div className="p-4 border-t border-zinc-100 flex items-center justify-between bg-zinc-50">
          <span className="text-[11px] text-zinc-400">PhoneHouse Customer 360 Engine v4.2</span>
          <Button variant="outline" size="sm" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
};
