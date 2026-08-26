import type {
  CashTransaction,
  AttendanceRecord,
  Lead,
  LeaveRequest,
  Partner,
  PurchaseOrder,
  SalesInvoice,
  StockTransferSlip,
  TradeInAppraisal,
  UserAccount
} from '../types';
import type { FundAccount } from '../types';
import { apiJson } from './apiClient';

export interface OperationalCollectionSummary {
  total: number;
  loaded: number;
  partial: boolean;
}

export interface AdminOperationalSnapshot {
  limit: number;
  generatedAt: string;
  collections: {
    leads: Lead[];
    tradeIns: TradeInAppraisal[];
    invoices: SalesInvoice[];
    partners: Partner[];
    funds: FundAccount[];
    cashTransactions: CashTransaction[];
    transfers: StockTransferSlip[];
    purchaseOrders: PurchaseOrder[];
    attendance: AttendanceRecord[];
    leaveRequests: LeaveRequest[];
    users: UserAccount[];
  };
  summary: Record<keyof AdminOperationalSnapshot['collections'], OperationalCollectionSummary>;
}

export async function fetchAdminOperationalSnapshot(limit = 150): Promise<AdminOperationalSnapshot> {
  const response = await apiJson<{ success: true; data: AdminOperationalSnapshot }>(
    `/api/admin/operational-snapshot?limit=${Math.min(200, Math.max(25, Math.floor(limit)))}`,
    { method: 'GET', timeoutMs: 30000 }
  );
  return response.data;
}
