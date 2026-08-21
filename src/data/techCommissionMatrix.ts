export interface TechModelGroup {
  id: string;
  name: string;
  keywords: string[];
}

export interface TechTaskItem {
  id: string;
  name: string;
  rates: Record<string, number>;
}

export interface TechCommissionMatrixConfig {
  models: TechModelGroup[];
  tasks: TechTaskItem[];
  compensationPolicy: {
    generalShopSupportPercent: number;
    screenGlassTiers: Array<{
      id: string;
      label: string;
      maxRate: number;
      shopSupportPercent: number;
      techPenaltyPercent: number;
    }>;
  };
}

/** Legacy compatibility only. Business rates must be configured in System Settings. */
export const DEFAULT_TECH_COMMISSION_MATRIX: TechCommissionMatrixConfig = {
  models: [],
  tasks: [],
  compensationPolicy: { generalShopSupportPercent: 0, screenGlassTiers: [] }
};

export const TECH_COMMISSION_MATRIX = DEFAULT_TECH_COMMISSION_MATRIX;
const STORAGE_KEY = 'phonehouse_tech_matrix_config';

export function getLiveTechCommissionMatrix(): TechCommissionMatrixConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.models) && Array.isArray(parsed.tasks) && parsed.compensationPolicy) return parsed;
    }
  } catch (error) {
    console.error('Failed to load tech matrix config:', error);
  }
  return DEFAULT_TECH_COMMISSION_MATRIX;
}

export function saveLiveTechCommissionMatrix(config: TechCommissionMatrixConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new CustomEvent('tech-matrix-updated', { detail: config }));
}

export function resetTechCommissionMatrix(): TechCommissionMatrixConfig {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('tech-matrix-updated', { detail: DEFAULT_TECH_COMMISSION_MATRIX }));
  return DEFAULT_TECH_COMMISSION_MATRIX;
}

export function getDeviceGroupForModel(modelName: string): string {
  if (!modelName) return '';
  const normalized = modelName.toLowerCase();
  const matched = [...getLiveTechCommissionMatrix().models].reverse().find(group =>
    group.keywords.some(keyword => normalized.includes(keyword.toLowerCase()))
  );
  return matched?.id || '';
}
