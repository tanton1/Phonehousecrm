import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('PhoneHouse visual system consistency', () => {
  it('keeps one canonical brand palette and shared page primitives', () => {
    const css = source('src/index.css');

    expect(css).toContain('--ph-orange-500: #ff4b16');
    expect(css).toContain('--ph-orange-600: #e94112');
    expect(css).toContain('.ph-page-header');
    expect(css).toContain('.ph-page-title');
    expect(css).toContain('.ph-primary-button');
  });

  it('keeps tiny mobile labels readable without changing form zoom protection', () => {
    const css = source('src/index.css');

    expect(css).toContain('[class~="text-[10px]"]');
    expect(css).toContain('font-size: 11px !important');
    expect(css).toContain('input, select, textarea, [contenteditable="true"]');
    expect(css).toContain('font-size: 16px !important');
  });

  it('uses the PhoneHouse primary treatment on the user and permission page', () => {
    const page = source('src/components/UserManagementView.tsx');

    expect(page).toContain('ph-page-header');
    expect(page).toContain('ph-primary-button');
    expect(page).not.toContain('bg-indigo-600');
    expect(page).not.toContain('from-indigo-600');
    expect(page).not.toContain('border-slate-200');
  });

  it('routes legacy status badges through the shared component', () => {
    const compatibilityExport = source('src/components/shared/StatusBadge.tsx');
    const canonicalBadge = source('src/shared/ui/StatusBadge/StatusBadge.tsx');

    expect(compatibilityExport).toContain("from '../../shared/ui/StatusBadge/StatusBadge'");
    expect(canonicalBadge).toContain('const STATUS_MAP');
    expect(canonicalBadge).toContain("pending_verification: { label: 'Chờ xác minh'");
  });
});
