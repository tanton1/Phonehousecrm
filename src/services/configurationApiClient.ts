import { apiJson } from './apiClient';
import {
  CustomerCareSetupConfig,
  SalesSetupConfig,
  SystemSetupStatus,
  TechnicalTaskTypeConfig
} from '../types';

let operationalConfigCache: { sales?: SalesSetupConfig; customerCare?: CustomerCareSetupConfig } = {};
let operationalPolicyVersionsCache: { sales: SalesSetupConfig[]; customerCare: CustomerCareSetupConfig[] } = { sales: [], customerCare: [] };

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
  };
  policyVersions: {
    sales: SalesSetupConfig[];
    customerCare: CustomerCareSetupConfig[];
  };
}> {
  const response = await apiJson<{ success: boolean; data: {
    configs: { sales?: SalesSetupConfig; customerCare?: CustomerCareSetupConfig };
    policyVersions?: { sales?: SalesSetupConfig[]; customerCare?: CustomerCareSetupConfig[] };
  } }>('/api/configuration/operational-configs');
  operationalConfigCache = response.data.configs || {};
  operationalPolicyVersionsCache = {
    sales: response.data.policyVersions?.sales || [],
    customerCare: response.data.policyVersions?.customerCare || []
  };
  return { configs: operationalConfigCache, policyVersions: operationalPolicyVersionsCache };
}

export async function fetchOperationalConfigs(): Promise<{
  sales?: SalesSetupConfig;
  customerCare?: CustomerCareSetupConfig;
}> {
  return (await fetchOperationalConfigurationState()).configs;
}

export async function saveOperationalConfig(
  key: 'sales' | 'customerCare',
  config: SalesSetupConfig | CustomerCareSetupConfig
) {
  const response = await apiJson<{ success: boolean; data: {
    config?: SalesSetupConfig | CustomerCareSetupConfig;
    policy: SalesSetupConfig | CustomerCareSetupConfig;
    policyVersions: Array<SalesSetupConfig | CustomerCareSetupConfig>;
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
