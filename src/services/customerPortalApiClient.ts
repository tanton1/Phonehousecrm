import { apiBinary, apiJson } from './apiClient';
import { customerAuth } from '../lib/firebase';

export type CustomerApiEnvelope<T> = { success: boolean; data: T; error?: string; code?: string; message?: string };
export type CustomerBootstrap = {
  brand: { name: string; slogan: string; hotline: string; supportEmail: string; logoUrl?: string | null };
  branches: Array<{ id: string; name: string; address: string; phone: string; openingHours: string; latitude?: number | null; longitude?: number | null }>;
  promotions: CustomerPromotion[];
  generatedAt: string;
};
export type CustomerPromotion = { id: string; title: string; summary: string; details: string; category: string; bannerUrl?: string | null; startsAt?: string | null; endsAt?: string | null; branchIds: string[]; allBranches: boolean; conditions: string[]; hashtags: string[]; ctaLabel: string; ctaType: string; voucherCode?: string | null; personalized: boolean };
export type CustomerDevice = { id: string; model: string; imeiMasked: string; purchaseAt?: string | null; branchId: string; branchName: string; invoiceId?: string | null; invoiceCode?: string | null; warrantyMonths: number; warrantyUntil?: string | null; warrantyStatus: string; daysRemaining?: number | null; repairCount: number };
export type CustomerRepair = { id: string; customerDeviceId?: string | null; code: string; model: string; imeiMasked: string; type: 'WARRANTY' | 'REPAIR'; branchId: string; stage: string; stageLabel: string; promisedAt?: string | null; receivedAt?: string | null; completedAt?: string | null; diagnosis: string; quote: { status: string; customerDecision?: string | null; amount: number; version: number; updatedAt?: string | null; mayDecide: boolean }; payment: { finalAmount: number; paidAmount: number; balanceDue: number; status: string }; tasks: Array<{ id: string; name: string; status: string }>; timeline: Array<{ key: string; label: string; at?: string | null }>; updatedAt?: string | null };
export type CustomerRequest = { id: string; type: string; model: string; imeiMasked: string; issueType: string; issueLabel?: string; description: string; branchId: string; branchName: string; preferredVisitAt?: string | null; status: string; statusLabel: string; convertedWorkOrderId?: string | null; evidenceCount: number; createdAt?: string | null; updatedAt?: string | null };
export type CustomerMe = { uid: string; displayName: string; phoneMasked: string; linkStatus: string; notificationConsent: boolean; marketingConsent: boolean; linkedBranchIds: string[] };
export type CustomerNotification = { id: string; type: string; title: string; body: string; url: string; read: boolean; createdAt: string };
export type CustomerChatMessage = { id: string; sender: 'CUSTOMER' | 'BOT' | 'STAFF'; senderName: string; content: string; timestamp: string };
export type CustomerConversation = { id: string; status: string; branchName?: string; lastMessageSnippet?: string; messages?: CustomerChatMessage[] };
export type QuickQuoteType = 'DEVICE' | 'REPAIR' | 'ACCESSORY';
export type QuickQuoteBranch = { id: string; name: string; address: string; phone: string; openingHours: string };
export type QuickQuoteBootstrap = { settings: { enabled: boolean; validityHours: number; responseSlaMinutes: number; disclaimer: string; fallbackBranchId?: string }; branches: QuickQuoteBranch[]; quoteTypes: QuickQuoteType[]; generatedAt: string };
export type QuickQuoteDeviceOffer = { selectionToken: string; name: string; model: string; storage: string; color: string; condition: string; region: string; batteryHealth: number; warrantyPeriodMonths: number; imageUrl?: string | null; branchId: string; price: number; inStock: true };
export type QuickQuoteRepairOffer = { selectionToken: string; name: string; description: string; category: string; compatibleModels: string[]; price: number | null; inspectionRequired: boolean; durationMinutes: number; warrantyPeriodMonths: number; imageUrl?: string | null; publicSortOrder?: number };
export type QuickQuoteAccessoryOffer = { selectionToken: string; name: string; description: string; category: string; brand: string; compatibleModels: string[]; imageUrl?: string | null; price: number; inStock: true; branchId: string };
export type QuickQuotePage<T> = { items: T[]; nextCursor: string | null; hasMore: boolean; coverageLimited?: boolean };
export type QuickQuoteRequestResult = { requestCode: string; quoteType: QuickQuoteType; estimatedTotal: number; expiresAt: string; responseSlaMinutes: number; branchName: string; status: string };

export async function customerPublicBootstrap() { return apiJson<CustomerApiEnvelope<CustomerBootstrap>>('/api/customer-portal/public/bootstrap'); }
export async function customerPublicPromotions() { return apiJson<CustomerApiEnvelope<CustomerPromotion[]>>('/api/customer-portal/public/promotions'); }
export async function customerPublicChat(message: string) { return apiJson<CustomerApiEnvelope<{ intent: string; reply: string }>>('/api/customer-portal/public/chat', { method: 'POST', body: JSON.stringify({ message }) }); }
export async function quickQuoteBootstrap() { return apiJson<CustomerApiEnvelope<QuickQuoteBootstrap>>('/api/customer-portal/public/quick-quote/bootstrap'); }
export async function quickQuoteDevices(query: Record<string, string> = {}) { return apiJson<CustomerApiEnvelope<QuickQuotePage<QuickQuoteDeviceOffer>>>(`/api/customer-portal/public/quick-quote/devices?${new URLSearchParams(query)}`); }
export async function quickQuoteRepairServices(query: Record<string, string> = {}) { return apiJson<CustomerApiEnvelope<QuickQuoteRepairOffer[]>>(`/api/customer-portal/public/quick-quote/repair-services?${new URLSearchParams(query)}`); }
export async function quickQuoteAccessories(query: Record<string, string> = {}) { return apiJson<CustomerApiEnvelope<QuickQuotePage<QuickQuoteAccessoryOffer>>>(`/api/customer-portal/public/quick-quote/accessories?${new URLSearchParams(query)}`); }
export async function createQuickQuoteRequest(input: Record<string, any>) { return apiJson<CustomerApiEnvelope<QuickQuoteRequestResult>>('/api/customer-portal/public/quick-quote/requests', { method: 'POST', body: JSON.stringify(input), timeoutMs: 20_000 }); }
export async function trackQuickQuoteEvent(input: Record<string, any>) { return apiJson<CustomerApiEnvelope<{ accepted: true }>>('/api/customer-portal/public/quick-quote/analytics', { method: 'POST', body: JSON.stringify(input) }); }
export async function linkCustomerAccount(input: { verificationValue?: string; displayName?: string }) { return apiJson<CustomerApiEnvelope<Record<string, any>>>('/api/customer-portal/auth/link-account', { method: 'POST', body: JSON.stringify(input) }); }
export async function customerMe() { return apiJson<CustomerApiEnvelope<CustomerMe>>('/api/customer-portal/me'); }
export async function updateCustomerMe(input: Partial<Pick<CustomerMe, 'displayName' | 'notificationConsent' | 'marketingConsent'>>) { return apiJson<CustomerApiEnvelope<CustomerMe>>('/api/customer-portal/me', { method: 'PATCH', body: JSON.stringify(input) }); }
export async function customerDevices() { return apiJson<CustomerApiEnvelope<CustomerDevice[]>>('/api/customer-portal/devices'); }
export async function customerDevice(id: string) { return apiJson<CustomerApiEnvelope<CustomerDevice & { repairHistory: CustomerRepair[] }>>(`/api/customer-portal/devices/${encodeURIComponent(id)}`); }
export async function customerRepairs() { return apiJson<CustomerApiEnvelope<{ items: CustomerRepair[]; requests: CustomerRequest[] }>>('/api/customer-portal/repairs'); }
export async function customerRepair(id: string) { return apiJson<CustomerApiEnvelope<CustomerRepair>>(`/api/customer-portal/repairs/${encodeURIComponent(id)}`); }
export async function createCustomerServiceRequest(input: Record<string, any>) { return apiJson<CustomerApiEnvelope<any>>('/api/customer-portal/service-requests', { method: 'POST', body: JSON.stringify(input) }); }
export async function createQuoteApprovalChallenge(id: string) { return apiJson<CustomerApiEnvelope<{ challengeId: string; workOrderId: string; quoteVersion: number; approvedFinalAmount: number; expiresAt: string }>>(`/api/customer-portal/repairs/${encodeURIComponent(id)}/quote-approval-challenges`, { method: 'POST', body: '{}' }); }
export async function decideCustomerQuote(id: string, input: Record<string, any>) { return apiJson<CustomerApiEnvelope<any>>(`/api/customer-portal/repairs/${encodeURIComponent(id)}/quote-decisions`, { method: 'POST', body: JSON.stringify(input) }); }
export async function customerPromotions() { return apiJson<CustomerApiEnvelope<CustomerPromotion[]>>('/api/customer-portal/promotions'); }
export async function createCustomerConversation(branchId?: string) { return apiJson<CustomerApiEnvelope<CustomerConversation>>('/api/customer-portal/chat/conversations', { method: 'POST', body: JSON.stringify({ branchId }) }); }
export async function customerConversationMessages(id: string) { return apiJson<CustomerApiEnvelope<{ conversation: CustomerConversation; messages: CustomerChatMessage[] }>>(`/api/customer-portal/chat/conversations/${encodeURIComponent(id)}/messages`); }
export async function sendCustomerConversationMessage(id: string, content: string) { return apiJson<CustomerApiEnvelope<{ conversation: CustomerConversation; messages: CustomerChatMessage[] }>>(`/api/customer-portal/chat/conversations/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify({ content, operationKey: `${Date.now()}-${Math.random().toString(36).slice(2)}` }) }); }
export async function handoffCustomerConversation(id: string) { return apiJson<CustomerApiEnvelope<any>>(`/api/customer-portal/chat/conversations/${encodeURIComponent(id)}/handoff`, { method: 'POST', body: '{}' }); }
export async function customerNotifications() { return apiJson<CustomerApiEnvelope<CustomerNotification[]>>('/api/customer-portal/notifications'); }
export async function readCustomerNotification(id: string) { return apiJson<CustomerApiEnvelope<any>>(`/api/customer-portal/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', body: '{}' }); }
export async function saveCustomerPushSubscription(token: string) { return apiJson<CustomerApiEnvelope<any>>('/api/customer-portal/push-subscriptions', { method: 'POST', body: JSON.stringify({ token, userAgent: navigator.userAgent }) }); }

export async function uploadCustomerEvidence(requestId: string, file: File) {
  const session = await apiJson<CustomerApiEnvelope<{ sessionId: string; uploadUrl: string; contentUploadUrl: string; completeUrl: string }>>(`/api/customer-portal/service-requests/${encodeURIComponent(requestId)}/evidence`, { method: 'POST', body: JSON.stringify({ contentType: file.type, size: file.size }) });
  let directUploadSucceeded = false;
  try {
    const uploaded = await fetch(session.data.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
    directUploadSucceeded = uploaded.ok;
  } catch {
    directUploadSucceeded = false;
  }
  if (!directUploadSucceeded) {
    await apiBinary<CustomerApiEnvelope<any>>(session.data.contentUploadUrl, file, file.type);
  }
  return apiJson<CustomerApiEnvelope<any>>(session.data.completeUrl, { method: 'POST', body: '{}' });
}

export function hasCustomerSession() { return Boolean(customerAuth.currentUser?.phoneNumber); }
