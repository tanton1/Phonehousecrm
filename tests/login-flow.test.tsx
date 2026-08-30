import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PhoneHouseLoginPage } from '../src/components/PhoneHouseLoginPage';
import {
  assertValidAuthenticatedProfile,
  getLoginErrorMessage
} from '../src/services/authApiClient';

describe('PhoneHouse authentication flow', () => {
  it('maps Firebase and PhoneHouse profile failures to actionable Vietnamese messages', () => {
    expect(getLoginErrorMessage({ code: 'auth/invalid-credential' })).toContain('Email hoặc mật khẩu');
    expect(getLoginErrorMessage(new Error('USER_NOT_PROVISIONED'))).toContain('chưa có hồ sơ nhân viên');
    expect(getLoginErrorMessage(new Error('USER_INACTIVE'))).toContain('tạm khóa');
    expect(getLoginErrorMessage(new Error('BRANCH_NOT_ASSIGNED'))).toContain('chưa được gán chi nhánh');
    expect(getLoginErrorMessage({ code: 'auth/unauthorized-domain' })).toContain('Tên miền');
  });

  it('accepts only complete, active authoritative profiles', () => {
    const profile = {
      id: 'firebase-uid-1',
      email: 'staff@phonehouse.vn',
      displayName: 'Nhân viên PhoneHouse',
      role: 'SALES' as const,
      branchId: 'PH109',
      assignedBranchIds: ['PH109'],
      active: true,
      createdAt: '2026-08-30'
    };

    expect(assertValidAuthenticatedProfile(profile)).toEqual(profile);
    expect(() => assertValidAuthenticatedProfile({ ...profile, active: false })).toThrow('USER_PROFILE_INVALID');
    expect(() => assertValidAuthenticatedProfile({ ...profile, displayName: '' })).toThrow('USER_PROFILE_INVALID');
  });

  it('shows a persisted bootstrap error on the login screen', () => {
    const html = renderToStaticMarkup(
      <PhoneHouseLoginPage
        initialError="Tài khoản PhoneHouse này đã bị tạm khóa."
        onLoginSuccess={() => undefined}
      />
    );

    expect(html).toContain('Tài khoản PhoneHouse này đã bị tạm khóa.');
    expect(html).toContain('Đăng Nhập Hệ Thống');
    expect(html).toContain('Quên mật khẩu?');
  });
});
