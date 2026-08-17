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
    generalShopSupportPercent: number; // 30% (Cửa hàng hỗ trợ 30%, KTV 70%)
    screenGlassTiers: {
      id: string;
      label: string;
      maxRate: number; // e.g. 1%
      shopSupportPercent: number; // e.g. 80%
      techPenaltyPercent: number; // e.g. 20%
    }[];
  };
}

export const DEFAULT_TECH_COMMISSION_MATRIX: TechCommissionMatrixConfig = {
  models: [
    { id: 'g1', name: '8 plus trở xuống', keywords: ['8', '8 plus', '7', '7 plus', '6', 'se'] },
    { id: 'g2', name: 'X - Xs max', keywords: ['x', 'xr', 'xs', 'xs max'] },
    { id: 'g3', name: '11 - 11 prm', keywords: ['11', '11 pro', '11 pro max'] },
    { id: 'g4', name: '12 - 12 prm', keywords: ['12', '12 mini', '12 pro', '12 pro max'] },
    { id: 'g5', name: '13 - 13 prm', keywords: ['13', '13 mini', '13 pro', '13 pro max'] },
    { id: 'g6', name: '14 - 14 plus', keywords: ['14', '14 plus'] },
    { id: 'g7', name: '14pro - 14 prm', keywords: ['14 pro', '14 pro max', '14promax'] },
    { id: 'g8', name: '15 - 15 prm', keywords: ['15', '15 plus', '15 pro', '15 pro max', '15promax'] }
  ],
  tasks: [
    { id: 't1', name: 'Thay pin', rates: { g1: 0, g2: 20000, g3: 20000, g4: 20000, g5: 20000, g6: 20000, g7: 20000, g8: 20000 } },
    { id: 't2', name: 'Lưng', rates: { g1: 0, g2: 50000, g3: 50000, g4: 50000, g5: 50000, g6: 20000, g7: 70000, g8: 20000 } },
    { id: 't3', name: 'Vỏ', rates: { g1: 0, g2: 50000, g3: 50000, g4: 50000, g5: 50000, g6: 70000, g7: 70000, g8: 80000 } },
    { id: 't4', name: 'Sửa nguồn', rates: { g1: 100000, g2: 100000, g3: 100000, g4: 100000, g5: 100000, g6: 100000, g7: 100000, g8: 0 } },
    { id: 't5', name: 'Fix face ID', rates: { g1: 0, g2: 50000, g3: 50000, g4: 80000, g5: 80000, g6: 80000, g7: 80000, g8: 100000 } },
    { id: 't6', name: 'Ép kính', rates: { g1: 20000, g2: 50000, g3: 50000, g4: 70000, g5: 70000, g6: 100000, g7: 100000, g8: 200000 } },
    { id: 't7', name: 'Ép cảm', rates: { g1: 50000, g2: 80000, g3: 100000, g4: 140000, g5: 140000, g6: 200000, g7: 200000, g8: 300000 } },
    { id: 't8', name: 'Sàn IC', rates: { g1: 0, g2: 0, g3: 60000, g4: 80000, g5: 100000, g6: 100000, g7: 100000, g8: 100000 } },
    { id: 't9', name: 'Sàn cảm biến', rates: { g1: 40000, g2: 40000, g3: 60000, g4: 80000, g5: 100000, g6: 100000, g7: 100000, g8: 100000 } },
    { id: 't10', name: 'Fix cam rung', rates: { g1: 30000, g2: 30000, g3: 40000, g4: 40000, g5: 40000, g6: 40000, g7: 40000, g8: 80000 } },
    { id: 't11', name: 'Rửa cam 1 cam', rates: { g1: 20000, g2: 20000, g3: 20000, g4: 30000, g5: 30000, g6: 30000, g7: 30000, g8: 40000 } },
    { id: 't12', name: 'Rửa cam 2 cam trở lên', rates: { g1: 0, g2: 0, g3: 0, g4: 50000, g5: 50000, g6: 50000, g7: 50000, g8: 60000 } },
    { id: 't13', name: 'Xử lý thấu', rates: { g1: 40000, g2: 40000, g3: 80000, g4: 80000, g5: 80000, g6: 80000, g7: 80000, g8: 100000 } }
  ],
  compensationPolicy: {
    generalShopSupportPercent: 30, // Cửa hàng hỗ trợ 30% cho các lỗi phát sinh
    screenGlassTiers: [
      { id: 'tier1', label: 'Dưới 1% lỗi', maxRate: 1, shopSupportPercent: 80, techPenaltyPercent: 20 },
      { id: 'tier2', label: 'Dưới 5% lỗi', maxRate: 5, shopSupportPercent: 70, techPenaltyPercent: 30 },
      { id: 'tier3', label: 'Trên 5% lỗi', maxRate: 100, shopSupportPercent: 50, techPenaltyPercent: 50 }
    ]
  }
};

export const TECH_COMMISSION_MATRIX = DEFAULT_TECH_COMMISSION_MATRIX;

const STORAGE_KEY = 'phonehouse_tech_matrix_config';

export function getLiveTechCommissionMatrix(): TechCommissionMatrixConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.models && parsed.tasks) {
        return {
          ...DEFAULT_TECH_COMMISSION_MATRIX,
          ...parsed,
          compensationPolicy: parsed.compensationPolicy || DEFAULT_TECH_COMMISSION_MATRIX.compensationPolicy
        };
      }
    }
  } catch (e) {
    console.error('Failed to load tech matrix config:', e);
  }
  return DEFAULT_TECH_COMMISSION_MATRIX;
}

export function saveLiveTechCommissionMatrix(config: TechCommissionMatrixConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent('tech-matrix-updated', { detail: config }));
  } catch (e) {
    console.error('Failed to save tech matrix config:', e);
  }
}

export function resetTechCommissionMatrix(): TechCommissionMatrixConfig {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('tech-matrix-updated', { detail: DEFAULT_TECH_COMMISSION_MATRIX }));
  } catch (e) {
    console.error('Failed to reset tech matrix config:', e);
  }
  return DEFAULT_TECH_COMMISSION_MATRIX;
}

export function getDeviceGroupForModel(modelName: string): string {
  if (!modelName) return 'g1';
  const nameLower = modelName.toLowerCase();
  const matrix = getLiveTechCommissionMatrix();
  
  // Try to match the highest version first
  for (let i = matrix.models.length - 1; i >= 0; i--) {
    const group = matrix.models[i];
    for (const keyword of group.keywords) {
      if (nameLower.includes(keyword)) {
        return group.id;
      }
    }
  }
  return 'g1'; // Fallback
}

