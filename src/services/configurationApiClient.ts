import { apiJson } from './apiClient';
import {
  CustomerCareSetupConfig,
  RetailPricingSetupConfig,
  SalesSetupConfig,
  SystemSetupStatus,
  TechnicalTaskTypeConfig
} from '../types';

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
