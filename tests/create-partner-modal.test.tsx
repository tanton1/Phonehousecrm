import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CreatePartnerModal } from '../src/components/CreatePartnerModal';
import type { StoreBranch } from '../src/types';

const branches = [
  { id: 'PH109', name: 'PhoneHouse 109', isActive: true },
  { id: 'XSTORE', name: 'XStore', isActive: true }
] as StoreBranch[];

describe('Unified partner creation form', () => {
  it('shows the branch account explicitly in the purchase-order supplier flow', () => {
    const html = renderToStaticMarkup(
      <CreatePartnerModal
        isOpen
        onClose={() => undefined}
        defaultType="SUPPLIER"
        branchId="PH109"
        branches={branches}
        branchLocked
        lockType
        onSavePartner={() => undefined}
      />
    );

    expect(html).toContain('Chi nhánh quản lý');
    expect(html).toContain('PhoneHouse 109');
    expect(html).toContain('khóa để tránh tạo nhầm');
    expect(html).toContain('Nhóm Nhà Cung Cấp');
    expect(html).not.toContain('Đối tác tài chính');
  });

  it('lets the central partner page present every active branch for Admin selection', () => {
    const html = renderToStaticMarkup(
      <CreatePartnerModal
        isOpen
        onClose={() => undefined}
        defaultType="SUPPLIER"
        branchId="PH109"
        branches={branches}
        branchLocked={false}
        onSavePartner={() => undefined}
      />
    );

    expect(html).toContain('PhoneHouse 109');
    expect(html).toContain('XStore');
    expect(html).toContain('Admin phải chọn một chi nhánh cụ thể');
  });
});
