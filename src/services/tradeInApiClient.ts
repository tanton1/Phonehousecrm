import { TradeInAppraisal } from '../types';
import { apiJson } from './apiClient';

export async function requestCreateTradeIn(appraisal: TradeInAppraisal): Promise<TradeInAppraisal> {
  const response = await apiJson<{ success: boolean; data: TradeInAppraisal }>('/api/trade-ins', {
    method: 'POST',
    body: JSON.stringify(appraisal)
  });
  return response.data;
}

export async function requestUpdateTradeIn(appraisal: TradeInAppraisal): Promise<TradeInAppraisal> {
  const response = await apiJson<{ success: boolean; data: TradeInAppraisal }>(`/api/trade-ins/${encodeURIComponent(appraisal.id)}`, {
    method: 'PATCH',
    body: JSON.stringify(appraisal)
  });
  return response.data;
}
