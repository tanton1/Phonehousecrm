import React, { useState, useMemo, useEffect } from 'react';
import { 
  subscribeToRepairServices
} from '../services/firestoreService';
import { 
  WarrantyTicket, 
  DeviceItem, 
  FundAccount, 
  CashTransaction,
  UserAccount,
  SparePart,
  TechnicalTaskTypeConfig
} from '../types';
import { 
  REPAIR_SERVICES_PRICELIST, 
  RepairServiceItem 
} from '../data/initialData';
import { createRepairService, fetchTechnicalTaskSettings } from '../services/configurationApiClient';
import { ActivityLog } from './ActivityLog';
import { TechKanbanBoard } from './TechKanbanBoard';
import { TechKPIReport } from './TechKPIReport';
import { 
  Wrench, 
  Plus, 
  Search, 
  ShieldCheck, 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Printer, 
  Smartphone,
  Cpu,
  UserCheck,
  Zap,
  Check,
  X,
  FileText,
  DollarSign,
  Tag,
  Layers,
  KanbanSquare,
  Activity,
  History,
  Lock,
  ChevronRight,
  BatteryCharging,
  QrCode,
  SlidersHorizontal,
  TrendingUp,
  Percent,
  ScanFace
} from 'lucide-react';

import { StoreBranch } from "../types";
interface WarrantyServiceViewProps {
  currentUser?: UserAccount | null;
  branches?: StoreBranch[];
  warrantyTickets: WarrantyTicket[];
  devices: DeviceItem[];
  funds?: FundAccount[];
  users?: UserAccount[];
  spareParts?: SparePart[];
  onAddTicket: (ticket: WarrantyTicket) => void;
  onUpdateTicket: (ticket: WarrantyTicket) => void;
  onUpdateSparePart?: (part: SparePart) => void;
  onAddTransaction?: (tx: CashTransaction) => void;
  onOpenCheckIn?: () => void;
}

export const WarrantyServiceView: React.FC<WarrantyServiceViewProps> = ({
  currentUser,
  branches = [],
  warrantyTickets,
  devices,
  funds = [],
  users = [],
  spareParts = [],
  onAddTicket,
  onUpdateTicket,
  onUpdateSparePart,
  onAddTransaction,
  onOpenCheckIn
}) => {
  // Tabs: 'TICKETS' | 'KANBAN' | 'PRICELIST' | 'STATS' | 'KPI'
  const [activeTab, setActiveTab] = useState<'TICKETS' | 'KANBAN' | 'PRICELIST' | 'STATS' | 'KPI'>('TICKETS');

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL'); // ALL, FREE, PAID

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddPriceModalOpen, setIsAddPriceModalOpen] = useState(false);
  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);

  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const [errorFormData, setErrorFormData] = useState({
    errorType: 'Lỗi phát sinh trong quá trình xử lý', // or 'Lỗi ép kính dẫn tới hư màn'
    errorRate: '< 1%', // '< 1%', '< 5%', '> 5%'
    compensationCost: 0
  });


  const [activeTicketDetails, setActiveTicketDetails] = useState<WarrantyTicket | null>(null);
  const [printTicket, setPrintTicket] = useState<WarrantyTicket | null>(null);

  // Price list state with Firestore & localStorage sync
  const [priceList, setPriceList] = useState<RepairServiceItem[]>(REPAIR_SERVICES_PRICELIST);
  const [technicalTaskTypes, setTechnicalTaskTypes] = useState<TechnicalTaskTypeConfig[]>([]);
  const technicalMatrix = useMemo(() => ({
    models: [{ id: 'ALL', name: 'Tất cả dòng máy', keywords: [] as string[] }],
    tasks: technicalTaskTypes.filter(task => task.isActive).map(task => ({
      id: task.taskType, name: task.name, rates: { ALL: task.baseCommission }
    }))
  }), [technicalTaskTypes]);

  useEffect(() => {
    const unsubscribe = subscribeToRepairServices((items) => {
      setPriceList(items || []);
    });
    fetchTechnicalTaskSettings().then(setTechnicalTaskTypes).catch(error => console.warn('[Technical task settings]', error));
    return () => unsubscribe();
  }, []);

  // Price list search & filter
  const [priceSearchTerm, setPriceSearchTerm] = useState('');
  const [selectedPriceCategory, setSelectedPriceCategory] = useState<string>('ALL');

  // Form State for New Price List Item
  const [newPriceFormData, setNewPriceFormData] = useState({
    name: '',
    category: '',
    categoryName: '',
    compatibleModels: '',
    costPrice: 0,
    sellPrice: 0,
    techCommission: 0,
    warrantyPeriodMonths: 0,
    durationMinutes: 0,
    notes: ''
  });

  // Form State for New Tech Commission Task
  const [newTaskFormData, setNewTaskFormData] = useState({
    taskName: '',
    taskType: 'RETAIL_REPAIR' as 'RETAIL_REPAIR' | 'INBOUND_QC' | 'WARRANTY' | 'SPECIAL_COMPONENT',
    technician: '',
    commissionAmount: 0,
    customerName: '',
    phone: '',
    model: '',
    imei: '',
    estimatedCost: 0,
    expectedReturnDate: '',
    notes: ''
  });

  // Filtered Price List
  const filteredPriceList = useMemo(() => {
    return priceList.filter(item => {
      const matchCat = selectedPriceCategory === 'ALL' || item.category === selectedPriceCategory;
      const matchSearch = 
        item.name.toLowerCase().includes(priceSearchTerm.toLowerCase()) ||
        item.compatibleModels.toLowerCase().includes(priceSearchTerm.toLowerCase()) ||
        (item.notes && item.notes.toLowerCase().includes(priceSearchTerm.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [priceList, priceSearchTerm, selectedPriceCategory]);

  // Handle Save New Price List Item
  const handleSaveNewPriceItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPriceFormData.name.trim()) return;

    const newItem: RepairServiceItem = {
      id: `REP-${Date.now().toString().slice(-6)}`,
      category: newPriceFormData.category,
      categoryName: newPriceFormData.categoryName,
      name: newPriceFormData.name,
      compatibleModels: newPriceFormData.compatibleModels,
      costPrice: Number(newPriceFormData.costPrice) || 0,
      sellPrice: Number(newPriceFormData.sellPrice) || 0,
      techCommission: Number(newPriceFormData.techCommission) || 0,
      warrantyPeriodMonths: Number(newPriceFormData.warrantyPeriodMonths) || 0,
      durationMinutes: Number(newPriceFormData.durationMinutes) || 0,
      notes: newPriceFormData.notes
    };

    try {
      const saved = await createRepairService(newItem);
      setPriceList(current => [saved, ...current.filter(item => item.id !== saved.id)]);
      setIsAddPriceModalOpen(false);
      setNewPriceFormData({
        name: '',
        category: '', categoryName: '', compatibleModels: '', costPrice: 0, sellPrice: 0,
        techCommission: 0, warrantyPeriodMonths: 0, durationMinutes: 0,
        notes: ''
      });
    } catch (error: any) {
      alert(error?.message || 'Không lưu được bảng giá dịch vụ.');
    }
  };

  // Handle Save New Tech Task
  const handleSaveNewTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskFormData.taskName.trim() || !technicalTaskTypes.some(task => task.isActive && newTaskFormData.taskName.includes(task.name))) {
      alert('Hãy chọn task đã cấu hình trong Cài đặt hệ thống.');
      return;
    }

    const matchedUser = users.find(u => 
      u.displayName.toLowerCase().includes(newTaskFormData.technician.toLowerCase()) || 
      newTaskFormData.technician.toLowerCase().includes(u.displayName.toLowerCase())
    );
    const assigneeId = matchedUser ? matchedUser.email : '';

    const ticketNumber = `TASK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

    const newTicket: WarrantyTicket = {
      id: `WRN-${Date.now().toString().slice(-6)}`,
      ticketNumber,
      taskType: newTaskFormData.taskType,
      assigneeId,
      technician: newTaskFormData.technician,
      commissionAmount: Number(newTaskFormData.commissionAmount) || 0,
      customerName: newTaskFormData.customerName,
      phone: newTaskFormData.phone,
      model: newTaskFormData.model,
      imei: newTaskFormData.imei,
      issueType: 'Khác',
      faultDescription: `${newTaskFormData.taskName}${newTaskFormData.notes ? ` - ${newTaskFormData.notes}` : ''}`,
      status: 'received',
      branchId: formData.branchId || currentUser?.branchId || '',
      isWarrantyFree: newTaskFormData.taskType === 'INBOUND_QC' || newTaskFormData.taskType === 'WARRANTY',
      repairCategory: newTaskFormData.taskType === 'INBOUND_QC' || newTaskFormData.taskType === 'WARRANTY' ? 'WARRANTY_FREE' : 'REPAIR_SERVICE',
      estimatedCost: Number(newTaskFormData.estimatedCost) || 0,
      finalCost: Number(newTaskFormData.estimatedCost) || 0,
      receivedDate: new Date().toISOString().split('T')[0],
      expectedReturnDate: newTaskFormData.expectedReturnDate,
      solutionNotes: `Task KTV phân công: ${newTaskFormData.technician} - Mức hoa hồng: ${Number(newTaskFormData.commissionAmount).toLocaleString('vi-VN')} đ`,
      warrantyMonthsAfterRepair: 6,
      paymentStatus: 'UNPAID'
    };

    onAddTicket(newTicket);
    setIsAddTaskModalOpen(false);
    setActiveTab('KANBAN');

    setNewTaskFormData({
      taskName: '',
      taskType: 'RETAIL_REPAIR',
      technician: '',
      commissionAmount: 0,
      customerName: '',
      phone: '',
      model: '',
      imei: '',
      estimatedCost: 0,
      expectedReturnDate: '',
      notes: ''
    });
  };

  // AI Diagnostic State
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [aiDiagnosticResult, setAiDiagnosticResult] = useState<{
    likelyCause: string;
    recommendedAction: string;
    repairTime: string;
    estimatedCostRange: string;
    warrantyTerms: string;
    riskWarning: string;
  } | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<WarrantyTicket>>({
    customerName: '',
    phone: '',
    imei: '',
    model: 'iPhone 13 Pro Max',
    color: 'Titan Tự Nhiên',
    storage: '128GB',
    passcode: '',
    icloudStatus: 'Clean / Khách Nhớ Mật Khẩu',
    deviceAppearance: 'Máy Đẹp Keng 99%',
    accessoriesIncluded: 'Máy trần (không phụ kiện)',
    issueType: 'Màn Hình / Cảm Ứng',
    faultDescription: 'Màn hình bị trắng/xanh toàn bộ khi đang sử dụng',
    technician: 'KTV Trọng (Chuyên Màn)',
    isWarrantyFree: true,
    repairCategory: 'WARRANTY_FREE',
    estimatedCost: 0,
    warrantyMonthsAfterRepair: 6,
    expectedReturnDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]
  });

  // Auto Lookup device by IMEI from sold or in_stock devices
  const handleLookupDeviceByImei = (imei: string) => {
    const cleanImei = imei.trim();
    if (cleanImei.length < 4) return;

    const found = devices.find(d => d.imei === cleanImei || d.imei.endsWith(cleanImei));
    if (found) {
      setFormData(prev => ({
        ...prev,
        imei: found.imei,
        model: found.model,
        color: found.color,
        storage: found.storage,
        customerName: found.customerName || prev.customerName,
        phone: found.customerPhone || prev.phone,
        isWarrantyFree: found.status === 'sold' || found.status === 'warranty'
      }));
    }
  };

  // AI Diagnostic Assistant
  const handleRunAIDiagnostic = () => {
    if (!formData.faultDescription) {
      alert('Vui lòng nhập mô tả triệu chứng lỗi trước khi chẩn đoán!');
      return;
    }

    setIsDiagnosing(true);
    setTimeout(() => {
      let cause = 'Chập áp màn hình 120Hz ProMotion trên dòng 13 Pro / 13 Pro Max';
      let action = 'Áp dụng công nghệ câu dây đồng nối áp màn hình (không cần thay cả cụm màn hình, giữ zin hiển thị 120Hz)';
      let cost = formData.isWarrantyFree ? '0đ (Bảo hành VIP 1 đổi 1)' : '500.000đ - 800.000đ';
      let time = '30 - 45 Phút (Lấy Ngay)';
      let warranty = 'Bảo hành 6 tháng sau sửa chữa';

      if (formData.issueType === 'Pin / Phù Pin') {
        cause = 'Cell pin bị chai phồng, chu kỳ sạc vượt ngưỡng 800 lần, dung lượng còn dưới 80%';
        action = 'Thay Pin Pisen Dragon / Bison Dung Lượng Cao + Sàng cáp IC fix pin 100% trong Cài đặt';
        cost = formData.isWarrantyFree ? '0đ (Bảo hành 1 đổi 1)' : '650.000đ - 1.200.000đ';
        time = '25 - 40 Phút';
        warranty = 'Bảo hành 12 tháng đổi mới';
      } else if (formData.issueType === 'Face ID / Camera') {
        cause = 'Hư hỏng mắt đọc Dot Projector hoặc đứt cáp cảm biến Face ID do va đập / ẩm nước';
        action = 'Sử dụng cáp JCID / Luban sửa Face ID không cần hàn đục thấu kính gốc';
        cost = '750.000đ - 1.450.000đ';
        time = '45 - 60 Phút';
        warranty = 'Bảo hành 6 tháng';
      } else if (formData.issueType === 'Ép Kính / Thay Lưng') {
        cause = 'Kính ngoài nứt vỡ do rơi rớt nhưng phôi màn hình OLED hiển thị và cảm ứng còn hoạt động bình thường';
        action = 'Tách kính vỡ, ép kính zin phủ nano chân không bằng keo OCA chuẩn nhà máy';
        cost = '600.000đ - 1.100.000đ';
        time = '60 - 90 Phút';
        warranty = 'Bảo hành 12 tháng bụi bọt keo';
      }

      setAiDiagnosticResult({
        likelyCause: cause,
        recommendedAction: action,
        repairTime: time,
        estimatedCostRange: cost,
        warrantyTerms: warranty,
        riskWarning: 'Kiểm tra kỹ tình trạng sườn vỏ, camera và face ID trước khi nhận máy'
      });
      setIsDiagnosing(false);
    }, 500);
  };

  // Submit New Ticket
  const handleSaveTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customerName || !formData.phone || !formData.imei) {
      alert('Vui lòng nhập đầy đủ tên khách, SĐT và số IMEI!');
      return;
    }

    const isFree = Boolean(formData.isWarrantyFree);
    const estCost = isFree ? 0 : (Number(formData.estimatedCost) || 0);

    const newTicket: WarrantyTicket = {
      id: `WRN-${Date.now().toString().slice(-4)}`,
      ticketNumber: `BH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`,
      customerName: formData.customerName,
      phone: formData.phone,
      imei: formData.imei,
      model: formData.model || 'iPhone 13 Pro Max',
      color: formData.color,
      storage: formData.storage,
      passcode: formData.passcode || 'Không có / Mở khóa tại chỗ',
      icloudStatus: formData.icloudStatus || 'Clean / Khách Nhớ Mật Khẩu',
      deviceAppearance: formData.deviceAppearance || 'Máy Đẹp Keng 99%',
      accessoriesIncluded: formData.accessoriesIncluded || 'Máy trần',
      issueType: formData.issueType || 'Khác',
      faultDescription: formData.faultDescription || '',
      receivedDate: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16),
      expectedReturnDate: formData.expectedReturnDate || '',
      technician: formData.technician || 'KTV Trọng (Chuyên Màn)',
      status: 'received',
      isWarrantyFree: isFree,
      repairCategory: isFree ? 'WARRANTY_FREE' : 'REPAIR_SERVICE',
      estimatedCost: estCost,
      finalCost: estCost,
      warrantyMonthsAfterRepair: formData.warrantyMonthsAfterRepair || 6,
      aiDiagnostic: aiDiagnosticResult?.recommendedAction,
      timeline: [
        {
          time: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16),
          action: 'Tiếp nhận máy tại quầy',
          note: `Lỗi: ${formData.issueType}. Tình trạng: ${formData.deviceAppearance}`,
          user: 'Nhật Tân (Lễ Tân/Admin)'
        }
      ]
    };

    onAddTicket(newTicket);
    setIsAddModalOpen(false);
    setAiDiagnosticResult(null);
  };

  // Status Change Workflow
  
  const handleReportError = () => {
    if (!activeTicketDetails) return;
    
    let shopRatio = 0.3; // Cửa hàng hỗ trợ 30% mặc định
    
    if (errorFormData.errorType === 'Lỗi ép kính dẫn tới hư màn') {
      if (errorFormData.errorRate === '< 1%') shopRatio = 0.8;
      else if (errorFormData.errorRate === '< 5%') shopRatio = 0.7;
      else shopRatio = 0.5;
    }
    
    const staffRatio = 1 - shopRatio;
    const staffPenalty = Math.round(errorFormData.compensationCost * staffRatio);
    
    // Add ledger penalty logic if needed, or just append to notes
    const newNote = `Sự cố: ${errorFormData.errorType} (${errorFormData.errorRate}). Đền bù: ${errorFormData.compensationCost.toLocaleString()}đ. KTV chịu ${(staffRatio * 100).toFixed(0)}% = ${staffPenalty.toLocaleString()}đ`;
    
    const updated = {
      ...activeTicketDetails,
      solutionNotes: (activeTicketDetails.solutionNotes || '') + '\n' + newNote
    };
    
    // Khoản trách nhiệm chỉ được ghi chú; không tự động trừ quỹ khi chưa có tài khoản
    // lương được định danh theo chi nhánh và quy trình duyệt bảng lương.

    onUpdateTicket(updated);
    setActiveTicketDetails(updated);
    setIsErrorModalOpen(false);
    alert(`Đã ghi nhận sự cố! KTV sẽ bị trừ ${staffPenalty.toLocaleString()}đ vào kỳ lương (Chức năng tạo phiếu phạt tự động có thể được liên kết ở sổ quỹ).`);
  };

  const handleTicketClick = (ticket: WarrantyTicket) => {
    setActiveTicketDetails(ticket);
  };

  
  const handleToggleTechTask = (taskId: string) => {
    if (!activeTicketDetails) return;
    const currentTasks = activeTicketDetails.techTasks || [];
    const newTasks = currentTasks.includes(taskId)
      ? currentTasks.filter(id => id !== taskId)
      : [...currentTasks, taskId];
    
    const updated = { ...activeTicketDetails, techTasks: newTasks };
    setActiveTicketDetails(updated);
    onUpdateTicket(updated);
  };

  const handleUpdateStatus = (ticket: WarrantyTicket, newStatus: WarrantyTicket['status']) => {
    const now = new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16);
    let actionDesc = '';
    let completedDate = ticket.completedDate;
    let deliveredDate = ticket.deliveredDate;

    if (newStatus === 'repairing') {
      actionDesc = 'Kỹ thuật viên bắt đầu tháo máy & sửa chữa';
    } else if (newStatus === 'ready') {
      actionDesc = 'Sửa chữa hoàn tất, kiểm tra QC 12 bước đạt chuẩn';
      completedDate = now;
    } else if (newStatus === 'delivered') {
      actionDesc = 'Đã bàn giao máy cho khách hàng & xuất phiếu bảo hành';
      deliveredDate = now;

      // If paid repair, prompt creating cash transaction receipt
      if (!ticket.isWarrantyFree && ticket.finalCost > 0 && onAddTransaction) {
        const createReceipt = confirm(`Giao máy thành công! Tạo phiếu thu ${ticket.finalCost.toLocaleString('vi-VN')}đ dịch vụ sửa chữa vào Quỹ Tiền Mặt?`);
        if (createReceipt) {
          const receiptFund = funds.find(f =>
            f.branchId === ticket.branchId &&
            f.type === 'CASH' &&
            f.isActive !== false &&
            f.isArchived !== true
          );
          if (!ticket.branchId || !receiptFund) {
            alert('Không tìm thấy quỹ tiền mặt đang hoạt động của đúng chi nhánh phiếu sửa chữa.');
            return;
          }
          const newTx: CashTransaction = {
            id: `TX-${Date.now()}`,
            code: `PT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`,
            type: 'RECEIPT',
            category: 'REPAIR_SERVICE',
            categoryName: `Thu tiền dịch vụ sửa chữa ${ticket.model} (${ticket.issueType})`,
            amount: ticket.finalCost,
            branchId: receiptFund.branchId,
            fundId: receiptFund.id,
            fundType: receiptFund.type,
            fundName: receiptFund.name,
            date: now,
            partnerName: ticket.customerName,
            partnerPhone: ticket.phone,
            partnerType: 'CUSTOMER',
            referenceCode: ticket.ticketNumber,
            creator: ticket.technician || 'KTV Sửa Chữa',
            notes: `Thu tiền dịch vụ phiếu ${ticket.ticketNumber} - IMEI: ${ticket.imei}`,
            status: 'COMPLETED'
          };
          onAddTransaction(newTx);
        }
      }
    }

    // The legacy warranty ticket has no task/lot/cost snapshot. Never let it
    // mutate spare-part stock directly; that would bypass the canonical part
    // ledger and make IMEI cost wrong. It must first be handled as a standard
    // Technical Work Order.
    if ((newStatus === 'ready' || newStatus === 'delivered') && ticket.partsUsed && ticket.partsUsed.length > 0) {
      const unDeductedParts = ticket.partsUsed.filter(p => !p.deductedFromStock);
      if (unDeductedParts.length > 0) {
        alert('Phiếu sửa cũ đang có linh kiện chưa qua Part Ledger. Hãy tạo/hoàn tất Phiếu kỹ thuật chuẩn để xuất đúng task, kho KTV và giá vốn trước khi chuyển trạng thái.');
        return;
      }
    }

    const updatedTicket: WarrantyTicket = {
      ...ticket,
      status: newStatus,
      ...(completedDate ? { completedDate } : {}),
      ...(deliveredDate ? { deliveredDate } : {}),
      timeline: [
        ...(ticket.timeline || []),
        {
          time: now,
          action: actionDesc || `Chuyển trạng thái: ${newStatus}`,
          user: 'KTV Trực Tiếp Xử Lý'
        }
      ]
    };

    onUpdateTicket(updatedTicket);
    if (activeTicketDetails?.id === ticket.id) {
      setActiveTicketDetails(updatedTicket);
    }
  };

  // Filtered Tickets
  const filteredTickets = useMemo(() => {
    return warrantyTickets.filter(ticket => {
      const matchesSearch = 
        ticket.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.phone.includes(searchTerm) ||
        ticket.imei.includes(searchTerm) ||
        ticket.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.ticketNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.model.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'ALL' || ticket.status === statusFilter;
      const matchesType = 
        typeFilter === 'ALL' ||
        (typeFilter === 'FREE' && ticket.isWarrantyFree) ||
        (typeFilter === 'PAID' && !ticket.isWarrantyFree);

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [warrantyTickets, searchTerm, statusFilter, typeFilter]);

  // Statistics Summary
  const stats = useMemo(() => {
    const total = warrantyTickets.length;
    const received = warrantyTickets.filter(t => t.status === 'received').length;
    const repairing = warrantyTickets.filter(t => t.status === 'repairing' || t.status === 'waiting_parts' || t.status === 'inspecting').length;
    const ready = warrantyTickets.filter(t => t.status === 'ready').length;
    const delivered = warrantyTickets.filter(t => t.status === 'delivered').length;
    
    const freeWarrantyCount = warrantyTickets.filter(t => t.isWarrantyFree).length;
    const paidServiceCount = warrantyTickets.filter(t => !t.isWarrantyFree).length;
    const totalRevenue = warrantyTickets.filter(t => !t.isWarrantyFree).reduce((sum, t) => sum + (t.finalCost || t.estimatedCost || 0), 0);

    return {
      total,
      received,
      repairing,
      ready,
      delivered,
      freeWarrantyCount,
      paidServiceCount,
      totalRevenue
    };
  }, [warrantyTickets]);

  const getStatusBadge = (status: WarrantyTicket['status']) => {
    switch (status) {
      case 'received':
        return (
          <span className="bg-orange-50 text-orange-700 border border-orange-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold inline-flex items-center space-x-1">
            <Clock className="w-3 h-3" />
            <span>Mới Tiếp Nhận</span>
          </span>
        );
      case 'inspecting':
        return (
          <span className="bg-orange-50 text-orange-700 border border-orange-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold inline-flex items-center space-x-1">
            <Activity className="w-3 h-3" />
            <span>Đang Kiểm Tra</span>
          </span>
        );
      case 'waiting_parts':
        return (
          <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold inline-flex items-center space-x-1">
            <Cpu className="w-3 h-3" />
            <span>Chờ Linh Kiện</span>
          </span>
        );
      case 'repairing':
        return (
          <span className="bg-orange-50 text-orange-800 border border-orange-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold inline-flex items-center space-x-1 animate-pulse">
            <Wrench className="w-3 h-3" />
            <span>Đang Sửa Chữa</span>
          </span>
        );
      case 'ready':
        return (
          <span className="bg-orange-50 text-orange-700 border border-orange-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold inline-flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Đã Xong (Chờ Trả)</span>
          </span>
        );
      case 'delivered':
        return (
          <span className="bg-zinc-100 text-zinc-600 border border-zinc-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-medium inline-flex items-center space-x-1">
            <UserCheck className="w-3 h-3" />
            <span>Đã Giao Máy</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fadeIn pb-16">
      {/* 1. TOP BANNER */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-orange-100 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-orange-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg sm:text-xl font-black text-zinc-900 tracking-tight">
                Trung Tâm Bảo Hành & Dịch Vụ Sửa Chữa Apple
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                {stats.total} Phiếu
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              Tiếp nhận máy theo IMEI, chẩn đoán AI, quản lý kỹ thuật viên, theo dõi linh kiện và in biên nhận K80/A5
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => {
              setFormData({
                customerName: '',
                phone: '',
                imei: '',
                model: 'iPhone 13 Pro Max',
                color: 'Titan Tự Nhiên',
                storage: '128GB',
                passcode: '',
                icloudStatus: 'Clean / Khách Nhớ Mật Khẩu',
                deviceAppearance: 'Máy Đẹp Keng 99%',
                accessoriesIncluded: 'Máy trần',
                issueType: 'Màn Hình / Cảm Ứng',
                faultDescription: 'Màn hình bị trắng/xanh toàn bộ khi đang lướt mạng',
                technician: 'KTV Trọng (Chuyên Màn)',
                commissionAmount: 100000,
                isWarrantyFree: true,
                repairCategory: 'WARRANTY_FREE',
                estimatedCost: 0,
                warrantyMonthsAfterRepair: 6,
                expectedReturnDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]
              });
              setIsAddModalOpen(true);
            }}
            className="bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white text-xs font-black px-3.5 py-2.5 rounded-xl flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-orange-500/20 active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Tiếp Nhận Máy</span>
          </button>

          <button
            onClick={() => setIsAddPriceModalOpen(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-black px-3.5 py-2.5 rounded-xl flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-orange-500/20 active:scale-95 cursor-pointer"
          >
            <DollarSign className="w-4 h-4" />
            <span>+ Tạo Bảng Giá Dịch Vụ</span>
          </button>

          <button
            onClick={() => setIsAddTaskModalOpen(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-black px-3.5 py-2.5 rounded-xl flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-orange-600/20 active:scale-95 cursor-pointer"
          >
            <Wrench className="w-4 h-4" />
            <span>+ Phân Công Task KTV</span>
          </button>
        </div>
      </div>

      {/* 2. STATS CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-orange-100 shadow-xs">
          <div className="text-[10px] font-bold text-zinc-500 uppercase">Mới Tiếp Nhận</div>
          <div className="text-xl sm:text-2xl font-black text-orange-600 mt-0.5">{stats.received}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Chờ KTV kiểm tra & chẩn đoán</div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-orange-100 shadow-xs">
          <div className="text-[10px] font-bold text-zinc-500 uppercase">Đang Sửa Chữa</div>
          <div className="text-xl sm:text-2xl font-black text-orange-600 mt-0.5">{stats.repairing}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">KTV đang thao tác xử lý</div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-orange-100 shadow-xs">
          <div className="text-[10px] font-bold text-zinc-500 uppercase">Đã Xong / Chờ Giao</div>
          <div className="text-xl sm:text-2xl font-black text-orange-600 mt-0.5">{stats.ready}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Đã test QC đạt chuẩn 100%</div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-orange-100 shadow-xs">
          <div className="text-[10px] font-bold text-zinc-500 uppercase">Doanh Thu Dịch Vụ</div>
          <div className="text-lg sm:text-xl font-black text-orange-600 mt-0.5 font-mono">
            {stats.totalRevenue.toLocaleString('vi-VN')} đ
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">{stats.freeWarrantyCount} ca BH miễn phí</div>
        </div>
      </div>

      {/* 3. NAVIGATION TABS */}
      <div className="flex items-center space-x-2 border-b border-zinc-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('TICKETS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'TICKETS'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Danh Sách Phiếu Tiếp Nhận ({warrantyTickets.length})</span>
        </button>
        
        <button
          onClick={() => setActiveTab('KANBAN')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'KANBAN'
              ? 'bg-orange-600 text-white shadow-xs'
              : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
          }`}
        >
          <KanbanSquare className="w-3.5 h-3.5" />
          <span>Bảng Kỹ Thuật (Tech Board)</span>
        </button>

        <button
          onClick={() => setActiveTab('PRICELIST')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'PRICELIST'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5" />
          <span>Bảng Giá Dịch Vụ & Linh Kiện iPhone</span>
        </button>

        <button
          onClick={() => setActiveTab('STATS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'STATS'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Quy Trình & Tỷ Lệ Bảo Hành</span>
        </button>

        <button
          onClick={() => setActiveTab('KPI')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'KPI'
              ? 'bg-orange-600 text-white shadow-xs'
              : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5" />
          <span>Báo Cáo KPI Kỹ Thuật</span>
        </button>
      </div>

      {/* TAB 1: TICKETS LIST */}
      {activeTab === 'TICKETS' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-orange-100 shadow-xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm Mã phiếu, IMEI, Tên khách, Model..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-8 pr-3 py-1.5 text-[11px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-orange-500"
                />
              </div>

              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 font-bold focus:outline-none focus:border-orange-500"
                >
                  <option value="ALL">Tất Cả Trạng Thái</option>
                  <option value="received">Mới Tiếp Nhận</option>
                  <option value="inspecting">Đang Kiểm Tra</option>
                  <option value="repairing">Đang Sửa Chữa</option>
                  <option value="ready">Đã Sửa Xong (Chờ Trả)</option>
                  <option value="delivered">Đã Giao Máy Khách</option>
                </select>
              </div>

              <div>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 font-bold focus:outline-none focus:border-orange-500"
                >
                  <option value="ALL">Tất Cả Phân Loại</option>
                  <option value="FREE">Bảo Hành 1 Đổi 1 (Miễn Phí)</option>
                  <option value="PAID">Sửa Chữa Dịch Vụ (Có Phí)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block bg-white border border-orange-100 rounded-3xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs text-zinc-700">
              <thead className="bg-zinc-50 text-zinc-500 uppercase font-bold border-b border-zinc-200 text-[11px]">
                <tr>
                  <th className="px-4 py-3.5">Mã Phiếu & Khách Hàng</th>
                  <th className="px-4 py-3.5">Thiết Bị & IMEI (15 số)</th>
                  <th className="px-4 py-3.5">Hạng Mục Lỗi & Mô Tả</th>
                  <th className="px-4 py-3.5">Kỹ Thuật Xử Lý</th>
                  <th className="px-4 py-3.5">Chi Phí / Bảo Hành</th>
                  <th className="px-4 py-3.5">Trạng Thái</th>
                  <th className="px-4 py-3.5 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredTickets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-zinc-500">
                      <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30 text-zinc-400" />
                      <p>Không có phiếu bảo hành/sửa chữa nào phù hợp bộ lọc.</p>
                    </td>
                  </tr>
                ) : (
                  filteredTickets.map((t) => (
                    <tr key={t.id} className="hover:bg-orange-50/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-mono font-black text-orange-600">{t.ticketNumber || t.id}</div>
                        <div className="font-bold text-zinc-900 text-xs mt-0.5">{t.customerName}</div>
                        <div className="text-[11px] text-zinc-500 font-mono">{t.phone}</div>
                      </td>

                      <td className="px-4 py-3.5 font-mono">
                        <div className="font-bold text-zinc-900 text-xs">{t.model}</div>
                        <div className="text-[11px] text-zinc-600 font-bold">IMEI: {t.imei}</div>
                        {t.deviceAppearance && (
                          <div className="text-[10px] text-zinc-500 font-sans">{t.deviceAppearance}</div>
                        )}
                      </td>

                      <td className="px-4 py-3.5 max-w-xs">
                        <span className="bg-orange-50 text-orange-800 border border-orange-200 px-2 py-0.5 rounded text-[10px] font-bold">
                          {t.issueType}
                        </span>
                        <p className="text-[11px] text-zinc-600 mt-1 line-clamp-1 italic">"{t.faultDescription}"</p>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="font-bold text-zinc-800">{t.technician}</span>
                        <div className="text-[10px] text-zinc-500">Nhận: {t.receivedDate}</div>
                      </td>

                      <td className="px-4 py-3.5">
                        {t.isWarrantyFree ? (
                          <div>
                            <span className="text-orange-700 font-bold text-xs bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                              BH Miễn Phí
                            </span>
                            <div className="text-[10px] text-zinc-400 mt-0.5">Gói VIP 1 đổi 1</div>
                          </div>
                        ) : (
                          <div>
                            <span className="text-zinc-900 font-black font-mono text-xs">
                              {t.finalCost ? t.finalCost.toLocaleString('vi-VN') : t.estimatedCost.toLocaleString('vi-VN')} đ
                            </span>
                            <div className="text-[10px] text-zinc-500 mt-0.5">BH {t.warrantyMonthsAfterRepair || 6} tháng</div>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        {getStatusBadge(t.status)}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => setActiveTicketDetails(t)}
                            className="p-1.5 bg-zinc-50 hover:bg-orange-50 text-zinc-700 rounded-lg border border-zinc-200"
                            title="Xem Chi Tiết Phiếu"
                          >
                            <FileText className="w-3.5 h-3.5 text-orange-600" />
                          </button>

                          <button
                            onClick={() => setPrintTicket(t)}
                            className="p-1.5 bg-zinc-50 hover:bg-orange-50 text-zinc-700 rounded-lg border border-zinc-200"
                            title="In Biên Nhận K80"
                          >
                            <Printer className="w-3.5 h-3.5 text-zinc-600" />
                          </button>

                          {t.status === 'received' && (
                            <button
                              onClick={() => handleUpdateStatus(t, 'repairing')}
                              className="bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg"
                            >
                              Sửa Máy
                            </button>
                          )}
                          {t.status === 'repairing' && (
                            <button
                              onClick={() => handleUpdateStatus(t, 'ready')}
                              className="bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg"
                            >
                              Sửa Xong
                            </button>
                          )}
                          {t.status === 'ready' && (
                            <button
                              onClick={() => handleUpdateStatus(t, 'delivered')}
                              className="bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-xs"
                            >
                              Giao Máy
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {filteredTickets.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-zinc-300 text-zinc-500 text-xs">
                Không có phiếu nào.
              </div>
            ) : (
              filteredTickets.map((t) => (
                <div 
                  key={t.id}
                  className="bg-white border border-orange-100 rounded-2xl p-4 space-y-3 shadow-xs"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-mono text-xs font-black text-orange-600">{t.ticketNumber || t.id}</span>
                      <h3 className="font-bold text-zinc-900 text-sm mt-0.5">{t.customerName} ({t.phone})</h3>
                    </div>
                    {getStatusBadge(t.status)}
                  </div>

                  <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 text-xs space-y-1">
                    <div className="flex justify-between text-zinc-500">
                      <span>Thiết bị:</span>
                      <strong className="text-zinc-900 font-mono">{t.model} ({t.imei.slice(-6)})</strong>
                    </div>
                    <div className="flex justify-between text-zinc-500">
                      <span>Lỗi:</span>
                      <span className="text-orange-800 font-bold">{t.issueType}</span>
                    </div>
                    <div className="flex justify-between text-zinc-500">
                      <span>Chi phí:</span>
                      <span className="font-black text-zinc-900 font-mono">
                        {t.isWarrantyFree ? 'BH Miễn Phí' : `${(t.finalCost || t.estimatedCost).toLocaleString('vi-VN')} đ`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="text-[11px] text-zinc-500">
                      KTV: <strong className="text-zinc-700">{t.technician}</strong>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => setActiveTicketDetails(t)}
                        className="px-2.5 py-1 bg-zinc-100 text-zinc-700 text-xs font-bold rounded-lg"
                      >
                        Chi Tiết
                      </button>

                      <button
                        onClick={() => setPrintTicket(t)}
                        className="p-1.5 bg-zinc-100 text-zinc-700 rounded-lg"
                      >
                        <Printer className="w-3.5 h-3.5 text-orange-600" />
                      </button>

                      {t.status === 'received' && (
                        <button
                          onClick={() => handleUpdateStatus(t, 'repairing')}
                          className="px-3 py-1 bg-orange-500 text-white text-xs font-bold rounded-lg shadow-xs"
                        >
                          Sửa Máy
                        </button>
                      )}
                      {t.status === 'repairing' && (
                        <button
                          onClick={() => handleUpdateStatus(t, 'ready')}
                          className="px-3 py-1 bg-orange-600 text-white text-xs font-bold rounded-lg shadow-xs"
                        >
                          Sửa Xong
                        </button>
                      )}
                      {t.status === 'ready' && (
                        <button
                          onClick={() => handleUpdateStatus(t, 'delivered')}
                          className="px-3 py-1 bg-orange-600 text-white text-xs font-bold rounded-lg shadow-xs"
                        >
                          Giao Máy
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB: KANBAN BOARD */}
      {activeTab === 'KANBAN' && (
        <TechKanbanBoard 
          tasks={filteredTickets} 
          onTaskClick={handleTicketClick} 
          onOpenAddTaskModal={() => setIsAddTaskModalOpen(true)}
        />
      )}

      {/* TAB 2: PRICELIST */}
      {activeTab === 'PRICELIST' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-orange-100 shadow-xs flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm bảng giá thay màn hình, thay pin, ép kính, sửa Face ID..."
                value={priceSearchTerm}
                onChange={(e) => setPriceSearchTerm(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-8 pr-3 py-1.5 text-[11px] text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
              <select
                value={selectedPriceCategory}
                onChange={(e) => setSelectedPriceCategory(e.target.value)}
                className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 font-bold focus:outline-none focus:border-orange-500"
              >
                <option value="ALL">Tất Cả Danh Mục Sửa Chữa</option>
                <option value="THAY_MAN_HINH">Thay Màn Hình iPhone</option>
                <option value="THAY_PIN">Thay Pin iPhone Chính Hãng</option>
                <option value="EP_KINH">Ép Kính / Ép Cảm Ứng</option>
                <option value="FACE_ID">Sửa Chữa Face ID</option>
                <option value="MAINBOARD_NGUON">Phần Cứng Mainboard / IC Nguồn</option>
                <option value="CAMERA_LOA">Thay Camera / Loa / Mic / Lưng</option>
                <option value="KHAC">Dịch Vụ Khác</option>
              </select>

              <button
                onClick={() => setIsAddPriceModalOpen(true)}
                className="bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm active:scale-95 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Tạo Bảng Giá / Dịch Vụ Mới</span>
              </button>
            </div>
          </div>

          {/* Pricing Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredPriceList.map((item) => (
              <div 
                key={item.id}
                className="bg-white border border-orange-100 hover:border-orange-300 rounded-2xl p-4 space-y-3 shadow-xs transition-all"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                      {item.categoryName}
                    </span>
                    <h3 className="font-bold text-zinc-900 text-sm mt-1">{item.name}</h3>
                    <div className="text-[11px] text-zinc-500">Áp dụng: <strong>{item.compatibleModels}</strong></div>
                  </div>

                  <div className="text-right">
                    <div className="text-base font-black text-orange-600 font-mono">
                      {item.sellPrice.toLocaleString('vi-VN')} đ
                    </div>
                    <span className="text-[10px] text-zinc-400">Giá vốn: {item.costPrice.toLocaleString('vi-VN')}đ</span>
                  </div>
                </div>

                <div className="p-2.5 bg-zinc-50 rounded-xl text-xs text-zinc-600 space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span>Thời gian hoàn thành: <strong>{item.durationMinutes} phút</strong></span>
                    <span>Bảo hành: <strong className="text-orange-700">{item.warrantyPeriodMonths} tháng</strong></span>
                  </div>

                  {Boolean(item.techCommission) && (
                    <div className="mt-1.5 pt-1.5 border-t border-zinc-200/60 flex justify-between items-center text-[11px] font-bold text-orange-800 bg-orange-50/80 p-1.5 rounded-lg">
                      <span>💰 Hoa hồng KTV:</span>
                      <span className="font-mono text-xs">{item.techCommission?.toLocaleString('vi-VN')} đ</span>
                    </div>
                  )}

                  {item.notes && <p className="text-[11px] text-zinc-500 italic pt-1 border-t border-zinc-200">{item.notes}</p>}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setFormData(prev => ({
                        ...prev,
                        issueType: item.categoryName.includes('Pin') ? 'Pin / Phù Pin' : item.categoryName.includes('Màn') ? 'Màn Hình / Cảm Ứng' : 'Khác',
                        faultDescription: `Yêu cầu dịch vụ: ${item.name}`,
                        estimatedCost: item.sellPrice,
                        commissionAmount: item.techCommission || 50000,
                        isWarrantyFree: false,
                        warrantyMonthsAfterRepair: item.warrantyPeriodMonths
                      }));
                      setIsAddModalOpen(true);
                    }}
                    className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold text-xs rounded-xl border border-orange-200 transition-colors cursor-pointer"
                  >
                    + Tiếp Nhận Dịch Vụ Này
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: STATS & QC WORKFLOW */}
      {activeTab === 'STATS' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-3xl border border-orange-100 shadow-xs space-y-4">
            <h3 className="font-black text-zinc-900 text-base flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-orange-600" />
              <span>Tiêu Chuẩn Tiếp Nhận & Kiểm Tra Chất Lượng (QC 12 Bước)</span>
            </h3>
            <p className="text-xs text-zinc-600">
              Quy trình chuẩn Apple Service tại Phone House đảm bảo độ bền và tính toàn vẹn của thiết bị khách hàng:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 bg-zinc-50 rounded-2xl border border-zinc-200 text-xs space-y-1.5">
                <div className="font-bold text-zinc-900 flex items-center space-x-1.5">
                  <span className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center text-[10px]">1</span>
                  <span>Tiếp Nhận & Kiểm Tra Ban Đầu</span>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Kiểm tra ngoại quan, chụp ảnh sườn vỏ, check iCloud, ghi nhận mật khẩu và phụ kiện kèm theo.
                </p>
              </div>

              <div className="p-3.5 bg-zinc-50 rounded-2xl border border-zinc-200 text-xs space-y-1.5">
                <div className="font-bold text-zinc-900 flex items-center space-x-1.5">
                  <span className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center text-[10px]">2</span>
                  <span>Sửa Chữa Trong Phòng Kỹ Thuật</span>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Sử dụng linh kiện bóc máy/chính hãng Pisen, dán ron chống nước áp suất chuẩn zin cho máy.
                </p>
              </div>

              <div className="p-3.5 bg-zinc-50 rounded-2xl border border-zinc-200 text-xs space-y-1.5">
                <div className="font-bold text-zinc-900 flex items-center space-x-1.5">
                  <span className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center text-[10px]">3</span>
                  <span>Kiểm Tra QC & Xuất Phiếu Bảo Hành</span>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Test toàn bộ tính năng Face ID, TrueTone, Micro, Loa, Camera trước sau và cấp tem bảo hành.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: KPI (Lương Kỹ Thuật) */}
      {activeTab === 'KPI' && (
        <div className="h-[70vh] bg-white rounded-3xl border border-zinc-200 overflow-hidden shadow-xs">
          <TechKPIReport 
            tickets={warrantyTickets} 
            users={users} 
            onOpenAddTaskModal={() => setIsAddTaskModalOpen(true)}
          />
        </div>
      )}

      {/* MODAL 1: TIẾP NHẬN MÁY BẢO HÀNH / SỬA CHỮA */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:rounded-3xl sm:max-w-3xl overflow-hidden shadow-2xl flex flex-col border border-orange-200">
            <div className="bg-gradient-to-r from-orange-50 via-orange-50/50 to-white px-5 py-4 border-b border-orange-100 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-500 text-white flex items-center justify-center">
                  <Wrench className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-zinc-900 text-base">Tiếp Nhận Máy Bảo Hành & Sửa Chữa</h3>
                  <p className="text-[11px] text-zinc-500">Tra cứu nhanh theo 15 số IMEI & ghi nhận tình trạng máy</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1.5 hover:bg-zinc-100 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTicket} className="p-4 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1 bg-white">
              {/* Row 1: IMEI & Tra cứu */}
              <div className="p-3.5 bg-orange-50/50 rounded-2xl border border-orange-100 space-y-2">
                <label className="block text-xs font-bold text-zinc-800">
                  Số IMEI Thiết Bị (15 số) * <span className="text-[11px] text-orange-600 font-normal">(Nhập để tự động tìm khách hàng & gói bảo hành)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={formData.imei}
                    onChange={(e) => {
                      setFormData({ ...formData, imei: e.target.value });
                      handleLookupDeviceByImei(e.target.value);
                    }}
                    placeholder="Nhập 15 số IMEI..."
                    className="flex-1 bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-zinc-900 focus:border-orange-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleLookupDeviceByImei(formData.imei || '')}
                    className="px-4 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold hover:bg-orange-600 cursor-pointer"
                  >
                    Tra Cứu Máy
                  </button>
                </div>
              </div>

              {/* Row 2: Customer & Device Info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Dòng iPhone *</label>
                  <input
                    type="text"
                    required
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:bg-white focus:border-orange-500"
                  />
                </div>

                <div>
                  
                {/* Chi nhánh */}
                {(currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER') && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Chi nhánh tiếp nhận</label>
                    <select
                      value={formData.branchId || ''}
                      onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:border-orange-500 outline-none"
                    >
                      <option value="">-- Chọn chi nhánh --</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                  <label className="block text-xs font-bold text-zinc-700 mb-1">Tên Khách Hàng *</label>
                  <input
                    type="text"
                    required
                    value={formData.customerName}
                    onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:bg-white focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Số Điện Thoại *</label>
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 font-mono focus:bg-white focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Row 3: Passcode & Appearance & iCloud */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Mật Khẩu Mở Khóa Máy</label>
                  <input
                    type="text"
                    value={formData.passcode}
                    onChange={(e) => setFormData({ ...formData, passcode: e.target.value })}
                    placeholder="VD: 123456 hoặc Không có"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:bg-white focus:border-orange-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Ngoại Quan Lúc Nhận</label>
                  <select
                    value={formData.deviceAppearance}
                    onChange={(e) => setFormData({ ...formData, deviceAppearance: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:border-orange-500"
                  >
                    <option value="Máy Đẹp Keng 99%">Máy Đẹp Keng 99%</option>
                    <option value="Trầy Xước Viền Nhẹ">Trầy Xước Viền Nhẹ</option>
                    <option value="Cấn Móp Góc / Nứt Kính">Cấn Móp Góc / Nứt Kính</option>
                    <option value="Màn Hình Bể / Sọc Toàn Bộ">Màn Hình Bể / Sọc Toàn Bộ</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Tình Trạng iCloud</label>
                  <select
                    value={formData.icloudStatus}
                    onChange={(e) => setFormData({ ...formData, icloudStatus: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:border-orange-500"
                  >
                    <option value="Clean / Khách Nhớ Mật Khẩu">Clean / Khách Nhớ Mật Khẩu</option>
                    <option value="Đã Thoát iCloud Tại Quầy">Đã Thoát iCloud Tại Quầy</option>
                    <option value="Mất Nguồn Chưa Kiểm Tra Được">Mất Nguồn Chưa Kiểm Tra Được</option>
                  </select>
                </div>
              </div>

              {/* Row 4: Issue Category & Warranty Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Nhóm Hạng Mục Lỗi *</label>
                  <select
                    value={formData.issueType}
                    onChange={(e) => setFormData({ ...formData, issueType: e.target.value as any })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 font-bold focus:border-orange-500"
                  >
                    <option value="Màn Hình / Cảm Ứng">Màn Hình / Cảm Ứng (Trắng, Xanh, Sọc 13PM)</option>
                    <option value="Pin / Phù Pin">Pin / Phù Pin / Nhanh Hết Pin</option>
                    <option value="Ép Kính / Thay Lưng">Ép Kính / Ép Cảm Ứng / Thay Kính Lưng</option>
                    <option value="Face ID / Camera">Face ID / Camera Rung Mờ</option>
                    <option value="Mainboard / IC Sạc">Mainboard / IC Nguồn / Mất Sóng</option>
                    <option value="Loa / Mic">Loa Trong / Loa Ngoài / Mic Rè</option>
                    <option value="Khác">Lỗi Khác</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Hình Thức Xử Lý & Chi Phí</label>
                  <div className="flex gap-2">
                    <label className={`flex-1 p-2 rounded-xl border text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer ${
                      formData.isWarrantyFree ? 'bg-orange-50 border-orange-500 text-orange-800' : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                    }`}>
                      <input
                        type="radio"
                        name="warrantyType"
                        checked={formData.isWarrantyFree}
                        onChange={() => setFormData({ ...formData, isWarrantyFree: true, estimatedCost: 0 })}
                        className="hidden"
                      />
                      <span>Bảo Hành Miễn Phí (0đ)</span>
                    </label>

                    <label className={`flex-1 p-2 rounded-xl border text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer ${
                      !formData.isWarrantyFree ? 'bg-orange-50 border-orange-500 text-orange-800' : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                    }`}>
                      <input
                        type="radio"
                        name="warrantyType"
                        checked={!formData.isWarrantyFree}
                        onChange={() => setFormData({ ...formData, isWarrantyFree: false, estimatedCost: 650000 })}
                        className="hidden"
                      />
                      <span>Sửa Dịch Vụ Có Phí</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Fault Description & AI Diagnosis */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-zinc-800">Mô Tả Triệu Chứng Cụ Thể</label>
                  <button
                    type="button"
                    onClick={handleRunAIDiagnostic}
                    disabled={isDiagnosing}
                    className="text-xs bg-gradient-to-r from-orange-500 to-orange-500 text-white font-bold px-3 py-1 rounded-lg flex items-center space-x-1 shadow-xs cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isDiagnosing ? 'Đang phân tích...' : 'AI Chẩn Đoán Kỹ Thuật'}</span>
                  </button>
                </div>

                <textarea
                  rows={2}
                  value={formData.faultDescription}
                  onChange={(e) => setFormData({ ...formData, faultDescription: e.target.value })}
                  placeholder="VD: Khách báo máy 13 Pro Max đang dùng bị trắng màn hình đột ngột..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-xs text-zinc-900 focus:bg-white focus:border-orange-500"
                />
              </div>

              {/* AI Diagnostic Result Card */}
              {aiDiagnosticResult && (
                <div className="p-3.5 bg-gradient-to-r from-orange-50/80 to-orange-50/80 border border-orange-200 rounded-2xl text-xs space-y-2">
                  <div className="flex items-center space-x-1.5 font-bold text-orange-800">
                    <Sparkles className="w-4 h-4 text-orange-600" />
                    <span>Kết Quả Phân Tích & Đề Xuất Kỹ Thuật (Gemini AI)</span>
                  </div>

                  <div className="space-y-1 text-zinc-700">
                    <div><strong>Nguyên nhân khả dĩ:</strong> {aiDiagnosticResult.likelyCause}</div>
                    <div><strong>Phương án xử lý:</strong> {aiDiagnosticResult.recommendedAction}</div>
                    <div className="flex gap-4 pt-1 text-[11px] font-bold">
                      <span className="text-orange-700">Thời gian: {aiDiagnosticResult.repairTime}</span>
                      <span className="text-orange-700">Dự toán: {aiDiagnosticResult.estimatedCostRange}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Row: KTV & Cost & Return Date */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Kỹ Thuật Phụ Trách</label>
                  <input
                    type="text"
                    value={formData.technician}
                    onChange={(e) => setFormData({ ...formData, technician: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:bg-white focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-orange-800 mb-1">Hoa Hồng KTV (VNĐ)</label>
                  <input
                    type="number"
                    step={10000}
                    value={formData.commissionAmount || 0}
                    onChange={(e) => setFormData({ ...formData, commissionAmount: Number(e.target.value) })}
                    className="w-full bg-orange-50/60 border border-orange-200 rounded-xl px-3 py-2 text-xs text-orange-900 font-mono font-bold focus:bg-white focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Báo Giá Khách (VNĐ)</label>
                  <input
                    type="number"
                    disabled={formData.isWarrantyFree}
                    value={formData.estimatedCost}
                    onChange={(e) => setFormData({ ...formData, estimatedCost: Number(e.target.value) })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 font-mono font-bold focus:bg-white focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Hẹn Ngày Trả Máy</label>
                  <input
                    type="date"
                    value={formData.expectedReturnDate}
                    onChange={(e) => setFormData({ ...formData, expectedReturnDate: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:bg-white focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Submit Actions */}
              <div className="pt-3 border-t border-zinc-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white font-bold rounded-xl text-xs shadow-md shadow-orange-500/20 active:scale-95"
                >
                  Lưu & Xuất Phiếu Biên Nhận
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CHI TIẾT TIẾN ĐỘ PHIẾU BẢO HÀNH */}
      {activeTicketDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-zinc-200 max-h-[90vh]">
            {/* Header */}
            <div className="bg-zinc-900 px-5 py-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center font-bold">
                  {activeTicketDetails.ticketNumber?.slice(2) || activeTicketDetails.id.slice(0,4).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-black text-lg">Chi Tiết Bảo Hành</h3>
                  <p className="text-xs text-zinc-400">
                    Bán lúc {new Date(activeTicketDetails.receivedDate).toLocaleDateString('vi-VN')}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setActiveTicketDetails(null)}
                className="text-zinc-400 hover:text-white p-2 hover:bg-white/10 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto space-y-5">
              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-100">
                  <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Khách Hàng</div>
                  <div className="font-bold text-zinc-900">{activeTicketDetails.customerName}</div>
                  <div className="text-xs text-zinc-600 mt-0.5">{activeTicketDetails.phone}</div>
                </div>
                <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-100">
                  <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Máy</div>
                  <div className="font-bold text-zinc-900">{activeTicketDetails.model}</div>
                  <div className="text-xs text-zinc-600 mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">IMEI: {activeTicketDetails.imei}</div>
                </div>
              </div>

              {/* Lỗi */}
              <div>
                <h4 className="font-black text-zinc-900 uppercase text-[11px] tracking-wider mb-2">Tình Trạng Lỗi</h4>
                <div className="bg-rose-50 p-3 rounded-2xl border border-rose-100 text-rose-800 text-sm font-medium">
                  {activeTicketDetails.issueType} - {activeTicketDetails.faultDescription}
                </div>
              </div>

              {/* Các Bước Sửa Chữa (Hoa Hồng KTV) */}
              <div className="pt-2 border-t border-zinc-100">
                <h4 className="font-black text-zinc-900 uppercase text-[11px] tracking-wider mb-3">Hạng Mục Sửa Chữa (KTV)</h4>
                
                {/* Tech Tasks Grid */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {technicalMatrix.tasks.map(task => {
                    const isSelected = (activeTicketDetails.techTasks || []).includes(task.id);
                    return (
                      <button
                        key={task.id}
                        onClick={() => handleToggleTechTask(task.id)}
                        className={`px-3 py-2 text-left text-xs font-bold rounded-xl border flex items-center justify-between ${
                          isSelected ? 'bg-orange-50 border-orange-500 text-orange-700' : 'bg-white border-zinc-200 text-zinc-700 hover:border-zinc-300'
                        }`}
                      >
                        <span>{task.name}</span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-orange-500" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Action Progress Flow */}

              <div className="space-y-2 pt-2 border-t border-zinc-100">
                <h4 className="font-black text-zinc-900 uppercase text-[11px] tracking-wider">Cập Nhật Tiến Độ</h4>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleUpdateStatus(activeTicketDetails, 'repairing')}
                    disabled={activeTicketDetails.status === 'repairing'}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-1 cursor-pointer ${
                      activeTicketDetails.status === 'repairing' ? 'bg-orange-100 text-orange-800 border border-orange-300' : 'bg-zinc-100 hover:bg-orange-50 text-zinc-700'
                    }`}
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>1. Đang Sửa</span>
                  </button>

                  <button
                    onClick={() => handleUpdateStatus(activeTicketDetails, 'ready')}
                    disabled={activeTicketDetails.status === 'ready'}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-1 cursor-pointer ${
                      activeTicketDetails.status === 'ready' ? 'bg-orange-100 text-orange-800 border border-orange-300' : 'bg-zinc-100 hover:bg-orange-50 text-zinc-700'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>2. Sửa Xong (QC OK)</span>
                  </button>

                  <button
                    onClick={() => handleUpdateStatus(activeTicketDetails, 'delivered')}
                    disabled={activeTicketDetails.status === 'delivered'}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-1 cursor-pointer ${
                      activeTicketDetails.status === 'delivered' ? 'bg-zinc-200 text-zinc-800 border border-zinc-300' : 'bg-zinc-100 hover:bg-orange-50 text-zinc-700'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>3. Đã Giao Khách</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex flex-wrap gap-2 justify-between items-center">
              <button
                onClick={() => setIsErrorModalOpen(true)}
                className="px-3 py-2 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-xl font-bold text-xs flex items-center space-x-1"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Báo Lỗi Đền Bù</span>
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setPrintTicket(activeTicketDetails);
                    setActiveTicketDetails(null);
                  }}
                  className="px-3.5 py-2 bg-white hover:bg-orange-50 text-zinc-700 border border-zinc-200 rounded-xl font-bold flex items-center space-x-1.5"
                >
                  <Printer className="w-4 h-4 text-orange-600" />
                  <span>In Phiếu K80</span>
                </button>
                <button
                  onClick={() => setActiveTicketDetails(null)}
                  className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 rounded-xl font-bold"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: TẠO BẢNG GIÁ DỊCH VỤ SỬA CHỮA MỚI */}
      {isAddPriceModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-xl rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-orange-200 max-h-[90vh]">
            <div className="bg-gradient-to-r from-orange-500 to-orange-500 px-5 py-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center font-bold">
                  <DollarSign className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-base">Thêm Dịch Vụ Sửa Chữa & Bảng Giá Mới</h3>
                  <p className="text-[11px] text-orange-100">Định giá linh kiện, thời gian hoàn thành & định mức hoa hồng KTV</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAddPriceModalOpen(false)}
                className="text-white/80 hover:text-white p-1.5 hover:bg-white/10 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNewPriceItem} className="p-4 sm:p-5 space-y-3.5 overflow-y-auto custom-scrollbar flex-1 bg-white text-xs">
              <div>
                <label className="block font-bold text-zinc-800 mb-1">Tên Dịch Vụ Sửa Chữa *</label>
                <input
                  type="text"
                  required
                  value={newPriceFormData.name}
                  onChange={(e) => setNewPriceFormData({ ...newPriceFormData, name: e.target.value })}
                  placeholder="VD: Thay Pin Pisen iPhone 15 Pro Max, Ép kính 14PM,..."
                  className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-zinc-900 font-bold focus:bg-white focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Nhóm Hạng Mục *</label>
                  <select
                    value={newPriceFormData.category}
                    onChange={(e) => {
                      const cat = e.target.value;
                      const catNames: Record<string, string> = {
                        'THAY_MAN_HINH': 'Thay Màn Hình iPhone',
                        'THAY_PIN': 'Thay Pin iPhone Chính Hãng',
                        'EP_KINH': 'Ép Kính / Ép Cảm Ứng',
                        'FACE_ID': 'Sửa Chữa Face ID',
                        'MAINBOARD_NGUON': 'Phần Cứng Mainboard / IC Nguồn',
                        'CAMERA_LOA': 'Thay Camera / Loa / Mic / Lưng',
                        'KHAC': 'Dịch Vụ Khác'
                      };
                      setNewPriceFormData({
                        ...newPriceFormData,
                        category: cat,
                        categoryName: catNames[cat] || 'Dịch Vụ Khác'
                      });
                    }}
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-zinc-900 font-bold focus:border-orange-500"
                  >
                    <option value="THAY_MAN_HINH">Thay Màn Hình iPhone</option>
                    <option value="THAY_PIN">Thay Pin iPhone Chính Hãng</option>
                    <option value="EP_KINH">Ép Kính / Ép Cảm Ứng</option>
                    <option value="FACE_ID">Sửa Chữa Face ID</option>
                    <option value="MAINBOARD_NGUON">Mainboard / IC Nguồn</option>
                    <option value="CAMERA_LOA">Camera / Loa / Mic / Lưng</option>
                    <option value="KHAC">Dịch Vụ Kỹ Thuật Khác</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Dòng Máy Áp Dụng *</label>
                  <input
                    type="text"
                    required
                    value={newPriceFormData.compatibleModels}
                    onChange={(e) => setNewPriceFormData({ ...newPriceFormData, compatibleModels: e.target.value })}
                    placeholder="VD: iPhone 13 Pro Max, Toàn bộ Series 14..."
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-zinc-900 focus:bg-white focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Giá Vốn Linh Kiện (VNĐ)</label>
                  <input
                    type="number"
                    step={50000}
                    value={newPriceFormData.costPrice}
                    onChange={(e) => setNewPriceFormData({ ...newPriceFormData, costPrice: Number(e.target.value) })}
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 font-mono font-bold text-zinc-900 focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-orange-700 mb-1">Giá Báo Khách / Phí (VNĐ)</label>
                  <input
                    type="number"
                    step={50000}
                    value={newPriceFormData.sellPrice}
                    onChange={(e) => setNewPriceFormData({ ...newPriceFormData, sellPrice: Number(e.target.value) })}
                    className="w-full bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 font-mono font-black text-orange-900 focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-orange-800 mb-1">Hoa Hồng KTV (VNĐ)</label>
                  <input
                    type="number"
                    step={10000}
                    value={newPriceFormData.techCommission}
                    onChange={(e) => setNewPriceFormData({ ...newPriceFormData, techCommission: Number(e.target.value) })}
                    className="w-full bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 font-mono font-black text-orange-900 focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Thời Gian Sửa (Phút)</label>
                  <input
                    type="number"
                    value={newPriceFormData.durationMinutes}
                    onChange={(e) => setNewPriceFormData({ ...newPriceFormData, durationMinutes: Number(e.target.value) })}
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 font-bold text-zinc-900 focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Thời Gian Bảo Hành (Tháng)</label>
                  <input
                    type="number"
                    value={newPriceFormData.warrantyPeriodMonths}
                    onChange={(e) => setNewPriceFormData({ ...newPriceFormData, warrantyPeriodMonths: Number(e.target.value) })}
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 font-bold text-zinc-900 focus:border-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1">Ghi Chú & Lưu Ý Kỹ Thuật</label>
                <textarea
                  rows={2}
                  value={newPriceFormData.notes}
                  onChange={(e) => setNewPriceFormData({ ...newPriceFormData, notes: e.target.value })}
                  placeholder="VD: Dán ron chống nước sau khi hoàn thành, sàng cáp IC zin gốc..."
                  className="w-full bg-zinc-50 border border-zinc-300 rounded-xl p-2.5 text-zinc-900 focus:bg-white focus:border-orange-500"
                />
              </div>

              <div className="pt-2 border-t border-zinc-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddPriceModalOpen(false)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl font-bold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white font-bold rounded-xl shadow-md cursor-pointer"
                >
                  Lưu Bảng Giá Mới
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: PHÂN CÔNG TASK KTV & ĐỊNH MỨC HOA HỒNG */}

      {isErrorModalOpen && activeTicketDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-zinc-100 flex justify-between items-center bg-rose-50 text-rose-800">
              <h3 className="font-black flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5" />
                <span>Báo Cáo Sự Cố & Đền Bù</span>
              </h3>
              <button onClick={() => setIsErrorModalOpen(false)} className="p-1 hover:bg-rose-200 rounded-full text-rose-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="bg-orange-50 text-orange-800 p-3 rounded-xl text-xs font-medium border border-orange-200">
                <p><strong>Lưu ý chính sách:</strong></p>
                <ul className="list-disc pl-4 mt-1 space-y-1">
                  <li>Lỗi phát sinh chung: Cửa hàng hỗ trợ 30%</li>
                  <li>Lỗi ép kính hư màn: Hỗ trợ 80% (&lt;1%), 70% (&lt;5%), 50% (&gt;5%)</li>
                </ul>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Loại Sự Cố</label>
                <select 
                  value={errorFormData.errorType}
                  onChange={(e) => setErrorFormData({...errorFormData, errorType: e.target.value})}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-sm focus:border-rose-500"
                >
                  <option value="Lỗi phát sinh trong quá trình xử lý">Lỗi phát sinh trong quá trình xử lý (Chung)</option>
                  <option value="Lỗi ép kính dẫn tới hư màn">Lỗi ép kính dẫn tới hư màn</option>
                </select>
              </div>

              {errorFormData.errorType === 'Lỗi ép kính dẫn tới hư màn' && (
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Tỷ lệ lỗi ép kính</label>
                  <select 
                    value={errorFormData.errorRate}
                    onChange={(e) => setErrorFormData({...errorFormData, errorRate: e.target.value})}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-sm focus:border-rose-500"
                  >
                    <option value="< 1%">Dưới 1%</option>
                    <option value="< 5%">Dưới 5%</option>
                    <option value="> 5%">Trên 5%</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Chi phí thay thế/Đền bù thực tế (VNĐ)</label>
                <input 
                  type="number"
                  value={errorFormData.compensationCost}
                  onChange={(e) => setErrorFormData({...errorFormData, compensationCost: Number(e.target.value)})}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:border-rose-500"
                  placeholder="Ví dụ: 2000000"
                />
              </div>
            </div>

            <div className="p-4 border-t border-zinc-100 flex justify-end gap-2 bg-zinc-50">
              <button 
                onClick={() => setIsErrorModalOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold text-zinc-600 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-100"
              >
                Hủy
              </button>
              <button 
                onClick={handleReportError}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-700"
              >
                Ghi nhận phạt KTV
              </button>
            </div>
          </div>
        </div>
      )}

      {isAddTaskModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-xl rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-orange-200 max-h-[90vh]">
            <div className="bg-gradient-to-r from-orange-600 to-orange-600 px-5 py-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center font-bold">
                  <Wrench className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-base">Phân Công Task KTV & Hoa Hồng</h3>
                  <p className="text-[11px] text-orange-100">Giao việc kỹ thuật, quy định mức thưởng hoa hồng & hạn deadline</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAddTaskModalOpen(false)}
                className="text-white/80 hover:text-white p-1.5 hover:bg-white/10 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNewTask} className="p-4 sm:p-5 space-y-3.5 overflow-y-auto custom-scrollbar flex-1 bg-white text-xs">
              {/* MATRIX QUICK SELECTOR CARD */}
              <div className="p-3.5 bg-gradient-to-r from-orange-50 to-orange-50 border border-orange-200 rounded-2xl space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="font-black text-orange-900 text-xs flex items-center space-x-1.5">
                    <Sparkles className="w-4 h-4 text-orange-600 shrink-0" />
                    <span>⚡ Chọn Nhanh Task Tu Ma Trận Đơn Giá (Auto Tính Hoa Hồng)</span>
                  </span>
                  <span className="text-[10px] text-orange-700 bg-orange-200/60 font-bold px-2 py-0.5 rounded-md">
                    Đồng Bộ Ma Trận KTV
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-orange-900 mb-1">Dòng Máy Tiếp Nhận:</label>
                    <select
                      value="ALL"
                      onChange={(e) => {
                        const groupId = e.target.value;
                        const matrix = technicalMatrix;
                        const group = matrix.models.find(m => m.id === groupId);
                        if (group) {
                          setNewTaskFormData(prev => ({
                            ...prev,
                            model: group.name
                          }));
                        }
                      }}
                      className="w-full bg-white border border-orange-300 rounded-xl px-2.5 py-1.5 font-bold text-xs text-orange-950 focus:border-orange-500"
                    >
                      {technicalMatrix.models.map(m => (
                        <option key={m.id} value={m.id}>📱 {m.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-orange-900 mb-1">Nhập Tên Máy Cụ Thể:</label>
                    <input
                      type="text"
                      placeholder="VD: iPhone 14 Pro Max 128GB"
                      value={newTaskFormData.model}
                      onChange={(e) => setNewTaskFormData({ ...newTaskFormData, model: e.target.value })}
                      className="w-full bg-white border border-orange-300 rounded-xl px-2.5 py-1.5 font-bold text-xs text-orange-950 focus:border-orange-500"
                    />
                  </div>
                </div>

                {/* Matrix Tasks Grid */}
                <div>
                  <label className="block text-[11px] font-bold text-orange-900 mb-1">
                    Bấm chọn tác vụ từ Ma Trận để tự động cộng hoa hồng KTV:
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-white/90 rounded-xl border border-orange-200">
                    {(() => {
                      const matrix = technicalMatrix;
                      const currentGroupId = 'ALL';
                      return matrix.tasks.map(t => {
                        const rate = t.rates[currentGroupId] || 0;
                        const isAlreadySelected = newTaskFormData.taskName.includes(t.name);

                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              if (isAlreadySelected) {
                                // Remove task
                                const newName = newTaskFormData.taskName
                                  .replace(t.name, '')
                                  .replace(/,\s*,/g, ',')
                                  .replace(/^,\s*|\s*,\s*$/g, '')
                                  .trim();
                                const newComm = Math.max(0, newTaskFormData.commissionAmount - rate);
                                setNewTaskFormData({
                                  ...newTaskFormData,
                                  taskName: newName || 'Sửa chữa kỹ thuật',
                                  commissionAmount: newComm
                                });
                              } else {
                                // Add task
                                const newName = newTaskFormData.taskName 
                                  ? `${newTaskFormData.taskName}, ${t.name}`
                                  : t.name;
                                const newComm = newTaskFormData.commissionAmount + rate;
                                setNewTaskFormData({
                                  ...newTaskFormData,
                                  taskName: newName,
                                  commissionAmount: newComm
                                });
                              }
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer flex items-center space-x-1 ${
                              isAlreadySelected 
                                ? 'bg-orange-500 text-white border-orange-600 shadow-2xs font-black'
                                : 'bg-orange-50 text-orange-900 border-orange-200 hover:bg-orange-100'
                            }`}
                          >
                            <span>{t.name}</span>
                            <span className={`text-[10px] font-mono ${isAlreadySelected ? 'text-orange-100' : 'text-orange-700 font-bold'}`}>
                              (+{(rate / 1000)}k)
                            </span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-800 mb-1">Tên Công Việc / Task Kỹ Thuật *</label>
                <input
                  type="text"
                  required
                  value={newTaskFormData.taskName}
                  onChange={(e) => setNewTaskFormData({ ...newTaskFormData, taskName: e.target.value })}
                  placeholder="VD: Thay Màn Hình & Fix TrueTone 13PM, KCS Kiểm Tra Lô 10 Máy Nhập..."
                  className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-zinc-900 font-bold focus:bg-white focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Loại Task Công Việc *</label>
                  <select
                    value={newTaskFormData.taskType}
                    onChange={(e) => setNewTaskFormData({ ...newTaskFormData, taskType: e.target.value as any })}
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-zinc-900 font-bold focus:border-orange-500"
                  >
                    <option value="RETAIL_REPAIR">Sửa Chữa Dịch Vụ Khách Lẻ</option>
                    <option value="INBOUND_QC">KCS Kiểm Tra Hàng Kho Nhập</option>
                    <option value="WARRANTY">Bảo Hành 1 Đổi 1 / Sửa BH</option>
                    <option value="SPECIAL_COMPONENT">Định Dạng / Ép Kính Linh Kiện Đặc Biệt</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Kỹ Thuật Viên Phụ Trách *</label>
                  <select
                    value={newTaskFormData.technician}
                    onChange={(e) => setNewTaskFormData({ ...newTaskFormData, technician: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-zinc-900 font-bold focus:border-orange-500"
                  >
                    {users && users.filter(u => u.role === 'TECHNICIAN' || u.role === 'ADMIN' || u.role === 'MANAGER').length > 0 ? (
                      users.filter(u => u.role === 'TECHNICIAN' || u.role === 'ADMIN' || u.role === 'MANAGER').map(u => (
                        <option key={u.id} value={u.displayName}>
                          {u.displayName} ({u.role})
                        </option>
                      ))
                    ) : <option value="">Chưa có KTV được cấu hình</option>}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-orange-50/80 rounded-2xl border border-orange-200">
                  <label className="block font-bold text-orange-900 mb-1">Mức Hoa Hồng KTV (VNĐ) *</label>
                  <input
                    type="number"
                    step={10000}
                    required
                    value={newTaskFormData.commissionAmount}
                    readOnly
                    className="w-full bg-white border border-orange-300 rounded-xl px-3 py-2 font-mono font-black text-orange-900 text-sm focus:border-orange-500"
                  />
                  <span className="text-[10px] text-orange-700 mt-0.5 block">Lấy tự động từ task đã cấu hình</span>
                </div>

                <div className="p-3 bg-orange-50/80 rounded-2xl border border-orange-200">
                  <label className="block font-bold text-orange-900 mb-1">Báo Giá Dịch Vụ Khách (VNĐ)</label>
                  <input
                    type="number"
                    step={50000}
                    value={newTaskFormData.estimatedCost}
                    onChange={(e) => setNewTaskFormData({ ...newTaskFormData, estimatedCost: Number(e.target.value) })}
                    className="w-full bg-white border border-orange-300 rounded-xl px-3 py-2 font-mono font-black text-orange-900 text-sm focus:border-orange-500"
                  />
                  <span className="text-[10px] text-orange-700 mt-0.5 block">Nhập 0đ nếu là task QC nhập kho hoặc bảo hành miễn phí</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Tên Khách / Đối Tác</label>
                  <input
                    type="text"
                    value={newTaskFormData.customerName}
                    onChange={(e) => setNewTaskFormData({ ...newTaskFormData, customerName: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-zinc-900 focus:bg-white focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Model Dòng Máy</label>
                  <input
                    type="text"
                    value={newTaskFormData.model}
                    onChange={(e) => setNewTaskFormData({ ...newTaskFormData, model: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-zinc-900 focus:bg-white focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Hạn Hoàn Thành</label>
                  <input
                    type="date"
                    value={newTaskFormData.expectedReturnDate}
                    onChange={(e) => setNewTaskFormData({ ...newTaskFormData, expectedReturnDate: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-zinc-900 focus:bg-white focus:border-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1">Yêu Cầu & Ghi Chú Kỹ Thuật Chi Tiết</label>
                <textarea
                  rows={2}
                  value={newTaskFormData.notes}
                  onChange={(e) => setNewTaskFormData({ ...newTaskFormData, notes: e.target.value })}
                  placeholder="Ghi rõ tiêu chuẩn kiểm tra hoặc chú ý bảo quản máy..."
                  className="w-full bg-zinc-50 border border-zinc-300 rounded-xl p-2.5 text-zinc-900 focus:bg-white focus:border-orange-500"
                />
              </div>

              <div className="pt-2 border-t border-zinc-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddTaskModalOpen(false)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl font-bold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
                >
                  Phân Công Task Ngay
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: IN BIÊN NHẬN K80 / A5 */}
      {printTicket && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-orange-200 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
              <span className="font-black text-sm text-zinc-900">Biên Nhận Bảo Hành & Sửa Chữa</span>
              <button onClick={() => setPrintTicket(null)} className="text-zinc-400 hover:text-zinc-600 font-bold">✕</button>
            </div>

            {/* Receipt K80 */}
            <div className="bg-zinc-50 text-black p-4 rounded-xl border border-zinc-300 text-xs font-mono space-y-2 shadow-inner">
              <div className="text-center font-black text-sm uppercase text-orange-600">PHONE HOUSE APPLE PREMIUM</div>
              <div className="text-center text-[10px] text-zinc-600">BIÊN NHẬN SỬA CHỮA & BẢO HÀNH</div>
              <div className="border-b border-dashed border-zinc-400 my-2" />

              <div className="flex justify-between font-bold">
                <span>Số Phiếu:</span>
                <span>{printTicket.ticketNumber || printTicket.id}</span>
              </div>
              <div className="flex justify-between">
                <span>Ngày Nhận:</span>
                <span>{printTicket.receivedDate}</span>
              </div>
              <div className="flex justify-between">
                <span>Khách Hàng:</span>
                <span className="font-bold">{printTicket.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span>SĐT:</span>
                <span>{printTicket.phone}</span>
              </div>
              <div className="flex justify-between">
                <span>Thiết Bị:</span>
                <span className="font-bold">{printTicket.model}</span>
              </div>
              <div className="flex justify-between">
                <span>Số IMEI:</span>
                <span>{printTicket.imei}</span>
              </div>
              <div className="flex justify-between">
                <span>Mật khẩu máy:</span>
                <span>{printTicket.passcode || 'Không có'}</span>
              </div>

              <div className="pt-2 border-t border-dashed border-zinc-400">
                <div><strong>Lỗi tiếp nhận:</strong> {printTicket.issueType}</div>
                <div className="text-[11px] italic">"{printTicket.faultDescription}"</div>
              </div>

              <div className="pt-2 border-t border-dashed border-zinc-400 flex justify-between font-bold">
                <span>Chi phí tạm tính:</span>
                <span>
                  {printTicket.isWarrantyFree ? '0đ (BH Miễn Phí)' : `${(printTicket.finalCost || printTicket.estimatedCost).toLocaleString('vi-VN')} đ`}
                </span>
              </div>

              <div className="text-[10px] text-zinc-500 pt-2 border-t border-dashed border-zinc-400">
                * Quý khách vui lòng mang theo phiếu này khi nhận lại máy. Cửa hàng không chịu trách nhiệm dữ liệu bên trong máy.
              </div>

              {/* Signatures */}
              <div className="pt-4 grid grid-cols-2 gap-2 text-center text-[10px] text-zinc-600 font-sans">
                <div>
                  <div className="font-bold">Khách Hàng</div>
                  <div className="h-10"></div>
                  <div>(Ký, ghi rõ họ tên)</div>
                </div>
                <div>
                  <div className="font-bold">KTV Tiếp Nhận</div>
                  <div className="h-10"></div>
                  <div>{printTicket.technician}</div>
                </div>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white font-bold rounded-xl text-xs shadow-md shadow-orange-500/20"
              >
                In Biên Nhận (Print)
              </button>
              <button
                onClick={() => setPrintTicket(null)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
