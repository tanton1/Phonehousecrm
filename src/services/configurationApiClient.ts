import { apiJson } from './apiClient';
import {
  CustomerCareSetupConfig,
  RetailPricingSetupConfig,
  SalesSetupConfig,
  SystemSetupStatus,
  TechnicalTaskTypeConfig
} from '../types';
import { SOPTemplateItem } from '../types';
import { RepairServiceItem } from '../data/initialData';

let operationalConfigCache: { sales?: SalesSetupConfig; customerCare?: CustomerCareSetupConfig; retailPricing?: RetailPricingSetupConfig } = {};
let operationalPolicyVersionsCache: { sales: SalesSetupConfig[]; customerCare: CustomerCareSetupConfig[]; retailPricing: RetailPricingSetupConfig[] } = { sales: [], customerCare: [], retailPricing: [] };

export function getCachedOperationalConfigs() {
  return operationalConfigCache;
}

export function getCachedOperationalPolicyVersions() {
  return operationalPolicyVersionsCache;
}

export async function fetchSystemSetupStatus(): Promise<SystemSetupStatus> {
  const response = await apiJson<{ success: boolean; data: SystemSetupStatus }>('/api/configuration/setup-status');
  return response.data;
}

export async function fetchOperationalConfigurationState(): Promise<{
  configs: {
    sales?: SalesSetupConfig;
    customerCare?: CustomerCareSetupConfig;
    retailPricing?: RetailPricingSetupConfig;
  };
  policyVersions: {
    sales: SalesSetupConfig[];
    customerCare: CustomerCareSetupConfig[];
    retailPricing: RetailPricingSetupConfig[];
  };
}> {
  const response = await apiJson<{ success: boolean; data: {
    configs: { sales?: SalesSetupConfig; customerCare?: CustomerCareSetupConfig; retailPricing?: RetailPricingSetupConfig };
    policyVersions?: { sales?: SalesSetupConfig[]; customerCare?: CustomerCareSetupConfig[]; retailPricing?: RetailPricingSetupConfig[] };
  } }>('/api/configuration/operational-configs');
  operationalConfigCache = response.data.configs || {};
  operationalPolicyVersionsCache = {
    sales: response.data.policyVersions?.sales || [],
    customerCare: response.data.policyVersions?.customerCare || [],
    retailPricing: response.data.policyVersions?.retailPricing || []
  };
  return { configs: operationalConfigCache, policyVersions: operationalPolicyVersionsCache };
}

export async function fetchOperationalConfigs(): Promise<{
  sales?: SalesSetupConfig;
  customerCare?: CustomerCareSetupConfig;
  retailPricing?: RetailPricingSetupConfig;
}> {
  return (await fetchOperationalConfigurationState()).configs;
}

export async function saveOperationalConfig(
  key: 'sales' | 'customerCare' | 'retailPricing',
  config: SalesSetupConfig | CustomerCareSetupConfig | RetailPricingSetupConfig
) {
  const response = await apiJson<{ success: boolean; data: {
    config?: SalesSetupConfig | CustomerCareSetupConfig | RetailPricingSetupConfig;
    policy: SalesSetupConfig | CustomerCareSetupConfig | RetailPricingSetupConfig;
    policyVersions: Array<SalesSetupConfig | CustomerCareSetupConfig | RetailPricingSetupConfig>;
  } }>(`/api/configuration/operational-configs/${key}`, {
    method: 'PUT',
    body: JSON.stringify(config)
  });
  operationalConfigCache = { ...operationalConfigCache, [key]: response.data.config };
  operationalPolicyVersionsCache = { ...operationalPolicyVersionsCache, [key]: response.data.policyVersions as any };
  return response.data.policy;
}

export interface FinanceCategoriesConfig {
  receiptCategories: string[];
  paymentCategories: string[];
}

export async function fetchFinanceCategories(): Promise<FinanceCategoriesConfig> {
  const response = await apiJson<{ success: boolean; data: FinanceCategoriesConfig }>('/api/configuration/finance-categories');
  return {
    receiptCategories: response.data.receiptCategories || [],
    paymentCategories: response.data.paymentCategories || []
  };
}

export async function addFinanceCategory(type: 'RECEIPT' | 'PAYMENT', name: string): Promise<FinanceCategoriesConfig> {
  const response = await apiJson<{ success: boolean; data: FinanceCategoriesConfig }>('/api/configuration/finance-categories', {
    method: 'POST',
    body: JSON.stringify({ type, name })
  });
  return response.data;
}

export async function fetchTechnicalTaskSettings(): Promise<TechnicalTaskTypeConfig[]> {
  const response = await apiJson<{ success: boolean; data: { taskTypes: TechnicalTaskTypeConfig[] } }>('/api/inventory-transfers/metadata');
  return response.data.taskTypes || [];
}

export async function saveTechnicalTaskSetting(task: TechnicalTaskTypeConfig): Promise<TechnicalTaskTypeConfig> {
  const response = await apiJson<{ success: boolean; data: { taskType: TechnicalTaskTypeConfig } }>(`/api/inventory-transfers/metadata/task-types/${encodeURIComponent(task.taskType)}`, {
    method: 'PUT',
    body: JSON.stringify(task)
  });
  return response.data.taskType;
}

export async function createSopTemplate(template: SOPTemplateItem): Promise<SOPTemplateItem> {
  const response = await apiJson<{ success: boolean; data: SOPTemplateItem }>('/api/configuration/sop-templates', {
    method: 'POST', body: JSON.stringify(template)
  });
  return response.data;
}

export async function updateSopTemplate(template: SOPTemplateItem): Promise<SOPTemplateItem> {
  const response = await apiJson<{ success: boolean; data: SOPTemplateItem }>(`/api/configuration/sop-templates/${encodeURIComponent(template.id)}`, {
    method: 'PATCH', body: JSON.stringify(template)
  });
  return response.data;
}

export async function archiveSopTemplate(templateId: string): Promise<void> {
  await apiJson(`/api/configuration/sop-templates/${encodeURIComponent(templateId)}/archive`, { method: 'POST' });
}

export async function createRepairService(item: RepairServiceItem): Promise<RepairServiceItem> {
  const response = await apiJson<{ success: boolean; data: RepairServiceItem }>('/api/configuration/repair-services', {
    method: 'POST', body: JSON.stringify(item)
  });
  return response.data;
}
