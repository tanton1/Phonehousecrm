import { apiJson } from './apiClient';
import {
  CustomerCareSetupConfig,
  SalesSetupConfig,
  SystemSetupStatus,
  TechnicalTaskTypeConfig
} from '../types';

let operationalConfigCache: { sales?: SalesSetupConfig; customerCare?: CustomerCareSetupConfig } = {};

export function getCachedOperationalConfigs() {
  return operationalConfigCache;
}

export async function fetchSystemSetupStatus(): Promise<SystemSetupStatus> {
  const response = await apiJson<{ success: boolean; data: SystemSetupStatus }>('/api/configuration/setup-status');
  return response.data;
}

export async function fetchOperationalConfigs(): Promise<{
  sales?: SalesSetupConfig;
  customerCare?: CustomerCareSetupConfig;
}> {
  const response = await apiJson<{ success: boolean; data: { configs: Record<string, any> } }>('/api/configuration/operational-configs');
  operationalConfigCache = response.data.configs || {};
  return operationalConfigCache;
}

export async function saveOperationalConfig(
  key: 'sales' | 'customerCare',
  config: SalesSetupConfig | CustomerCareSetupConfig
) {
  const response = await apiJson<{ success: boolean; data: { config: SalesSetupConfig | CustomerCareSetupConfig } }>(`/api/configuration/operational-configs/${key}`, {
    method: 'PUT',
    body: JSON.stringify(config)
  });
  const saved = response.data.config;
  operationalConfigCache = { ...operationalConfigCache, [key]: saved };
  return saved;
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
