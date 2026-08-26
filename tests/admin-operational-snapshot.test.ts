import { describe, expect, it } from 'vitest';
import { normalizeOperationalSnapshotLimit, redactOperationalUser } from '../server/routes/admin';

describe('admin operational snapshot boundary', () => {
  it('uses a bounded page size for every request', () => {
    expect(normalizeOperationalSnapshotLimit(undefined)).toBe(150);
    expect(normalizeOperationalSnapshotLimit('1')).toBe(25);
    expect(normalizeOperationalSnapshotLimit('75')).toBe(75);
    expect(normalizeOperationalSnapshotLimit('9999')).toBe(200);
    expect(normalizeOperationalSnapshotLimit('invalid')).toBe(150);
  });

  it('removes authentication and biometric secrets from user projections', () => {
    const safe = redactOperationalUser({
      id: 'U1',
      email: 'staff@example.com',
      role: 'SALES',
      password: 'secret',
      temporaryPassword: 'temporary',
      passcode: '1234',
      faceEmbedding: [0.1, 0.2],
      faceFeatureVector: [0.3, 0.4],
      facePhotoUrl: 'https://private.example/evidence.jpg',
      biometricProfile: { vector: [1] },
      accessToken: 'token',
      refreshToken: 'refresh'
    });
    expect(safe).toMatchObject({ id: 'U1', email: 'staff@example.com', role: 'SALES' });
    expect(safe).not.toHaveProperty('password');
    expect(safe).not.toHaveProperty('temporaryPassword');
    expect(safe).not.toHaveProperty('passcode');
    expect(safe).not.toHaveProperty('faceEmbedding');
    expect(safe).not.toHaveProperty('faceFeatureVector');
    expect(safe).not.toHaveProperty('facePhotoUrl');
    expect(safe).not.toHaveProperty('biometricProfile');
    expect(safe).not.toHaveProperty('accessToken');
    expect(safe).not.toHaveProperty('refreshToken');
  });
});
