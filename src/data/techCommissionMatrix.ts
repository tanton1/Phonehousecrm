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
let compatibilityMatrix = DEFAULT_TECH_COMMISSION_MATRIX;

export function getLiveTechCommissionMatrix(): TechCommissionMatrixConfig {
  return compatibilityMatrix;
}

export function saveLiveTechCommissionMatrix(config: TechCommissionMatrixConfig): void {
  // Compatibility for the retired editor only. Authoritative task rates are
  // persisted through System Settings and the technical configuration API.
  compatibilityMatrix = config;
  window.dispatchEvent(new CustomEvent('tech-matrix-updated', { detail: config }));
}

export function resetTechCommissionMatrix(): TechCommissionMatrixConfig {
  compatibilityMatrix = DEFAULT_TECH_COMMISSION_MATRIX;
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
