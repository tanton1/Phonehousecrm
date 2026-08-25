import { describe, expect, it } from 'vitest';
import {
  getStoredMetaPageConnection,
  metaConnectionDocumentId,
  saveManualMetaConnection
} from '../server/services/channelConnectionService';

function connectionDb(seed: Record<string, Record<string, any>>) {
  const store = structuredClone(seed);
  let counter = 0;
  const snapshot = (collectionName: string, id: string) => ({
    id,
    exists: Boolean(store[collectionName]?.[id]),
    data: () => store[collectionName]?.[id]
  });
  const ref = (collectionName: string, id: string) => ({
    id,
    collectionName,
    async get() { return snapshot(collectionName, id); },
    async set(value: Record<string, any>, options?: { merge?: boolean }) {
      store[collectionName] ||= {};
      store[collectionName][id] = options?.merge
        ? { ...(store[collectionName][id] || {}), ...value }
        : value;
    }
  });
  const writes: Array<() => void> = [];
  const db: any = {
    collection(collectionName: string) {
      store[collectionName] ||= {};
      return { doc(id?: string) { return ref(collectionName, id || `AUTO_${++counter}`); } };
    },
    batch() {
      return {
        set(documentRef: any, value: Record<string, any>, options?: { merge?: boolean }) {
          writes.push(() => {
            store[documentRef.collectionName] ||= {};
            store[documentRef.collectionName][documentRef.id] = options?.merge
              ? { ...(store[documentRef.collectionName][documentRef.id] || {}), ...value }
              : value;
          });
        },
        async commit() { writes.splice(0).forEach(write => write()); }
      };
    }
  };
  return { db, store };
}

describe('Multiple Meta Page connection store', () => {
  it('uses a deterministic Page-scoped connection id', () => {
    expect(metaConnectionDocumentId('332799593244601')).toBe('META_332799593244601');
    expect(() => metaConnectionDocumentId('')).toThrow('META_PAGE_ID_REQUIRED');
  });

  it('stores Page tokens encrypted and resolves the correct branch per Page', async () => {
    const previousKey = process.env.CHANNEL_TOKEN_ENCRYPTION_KEY;
    process.env.CHANNEL_TOKEN_ENCRYPTION_KEY = 'phonehouse-channel-token-key-2026-secure';
    const { db, store } = connectionDb({
      branches: { 'BR-PH': { name: 'PhoneHouse', isActive: true } }
    });
    try {
      await saveManualMetaConnection(db, {
        pageId: '332799593244601',
        pageName: 'PhoneHouse 109 Hàm Nghi',
        pageAccessToken: 'EAA_SECRET_PAGE_TOKEN',
        branchId: 'BR-PH',
        historyDays: 30,
        includeComments: true
      }, { uid: 'ADMIN_1', role: 'ADMIN', name: 'Admin' });

      const storedDocument = store.channelConnections.META_332799593244601;
      expect(storedDocument).toMatchObject({
        provider: 'META_MESSENGER',
        externalAccountId: '332799593244601',
        branchId: 'BR-PH',
        hasToken: true
      });
      expect(JSON.stringify(storedDocument)).not.toContain('EAA_SECRET_PAGE_TOKEN');
      expect(storedDocument.encryptedPageAccessToken).toMatchObject({ algorithm: 'aes-256-gcm' });

      const resolved = await getStoredMetaPageConnection(db, '332799593244601');
      expect(resolved).toMatchObject({
        pageId: '332799593244601',
        pageAccessToken: 'EAA_SECRET_PAGE_TOKEN',
        branchId: 'BR-PH'
      });
    } finally {
      if (previousKey === undefined) delete process.env.CHANNEL_TOKEN_ENCRYPTION_KEY;
      else process.env.CHANNEL_TOKEN_ENCRYPTION_KEY = previousKey;
    }
  });

  it('does not allow a manager to create or replace a Page token', async () => {
    const { db } = connectionDb({ branches: { 'BR-PH': { name: 'PhoneHouse', isActive: true } } });
    await expect(saveManualMetaConnection(db, {
      pageId: '332799593244601', pageAccessToken: 'TOKEN', branchId: 'BR-PH'
    }, { uid: 'MANAGER_1', role: 'MANAGER' })).rejects.toThrow('CHANNEL_CONNECTION_ADMIN_REQUIRED');
  });
});
