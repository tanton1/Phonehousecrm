/**
 * PhoneHouse CRM & ERP - Enterprise Feature Flags Configuration
 * Allows safe progressive rollout and canary testing of new architectural modules.
 */

export interface FeatureFlags {
  newAppShell: boolean;
  newDashboard: boolean;
  newPOSCockpit: boolean;
  newInventoryCards: boolean;
  newFinanceBanking: boolean;
  secureAttendance: boolean;
  strictRulesV3: boolean;
  enableKanbanWarranty: boolean;
  enableCustomer360: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  newAppShell: true,          // 6-Category SaaS Navbar and streamlined launcher
  newDashboard: true,         // Action-oriented Executive Dashboard
  newPOSCockpit: true,        // Desktop wide 3-column POS layout (F2, F4, F8, F9)
  newInventoryCards: true,    // Modern Card Grid & Table View switcher with filter chips
  newFinanceBanking: true,    // Multi-bank ledger & strict fund routing
  secureAttendance: true,     // Server IP egress verification & face biometric locking
  strictRulesV3: true,        // Role-based inventory & fund write protection
  enableKanbanWarranty: false, // In development (Sprint 14)
  enableCustomer360: false,    // In development (Sprint 11)
};

// Check local storage for staging/testing runtime flag overrides
export function getFeatureFlags(): FeatureFlags {
  try {
    const saved = localStorage.getItem('ph_feature_flags');
    if (saved) {
      return { ...DEFAULT_FLAGS, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Failed to parse runtime feature flags:', e);
  }
  return DEFAULT_FLAGS;
}

export const featureFlags = getFeatureFlags();

export function updateFeatureFlag<K extends keyof FeatureFlags>(key: K, value: boolean): void {
  try {
    const current = getFeatureFlags();
    const updated = { ...current, [key]: value };
    localStorage.setItem('ph_feature_flags', JSON.stringify(updated));
    window.location.reload();
  } catch (e) {
    console.error('Failed to save feature flag:', e);
  }
}
