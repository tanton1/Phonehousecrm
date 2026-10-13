import crypto from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { adminBucket } from '../firebaseAdmin';
import type { AuthenticatedUser } from '../middleware/authenticateFirebase';
import { CATALOG_IMAGE_TYPES, MAX_CATALOG_IMAGE_BYTES } from '../../shared/catalogWebsiteContent';
import { websiteContentReference } from './catalogWebsiteContentService';
import { isPublicStorefrontMaster } from './storefrontService';

export function validateCatalogImage(bytes: unknown, contentType: string): Buffer {
  if (!(CATALOG_IMAGE_TYPES as readonly string[]).includes(contentType)) throw new Error('CATALOG_IMAGE_TYPE_INVALID');
  if (!Buffer.isBuffer(bytes) || bytes.length < 12) throw new Error('CATALOG_IMAGE_BODY_INVALID');
  if (bytes.length > MAX_CATALOG_IMAGE_BYTES) throw new Error('CATALOG_IMAGE_TOO_LARGE');
  const valid = contentType === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9
    : contentType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.subarray(-8, -4).toString('ascii') === 'IEND'
      : bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP' && bytes.readUInt32LE(4) === bytes.length - 8;
  if (!valid) throw new Error('CATALOG_IMAGE_BODY_INVALID');
  return bytes;
}

/** Intentional public assets only. Never repurpose an evidence or inventory object. */
export async function uploadCatalogPublicImage(db: Firestore, target: string, id: string, body: unknown, contentType: string, confirmed: boolean, actor: AuthenticatedUser) {
  if (!['ADMIN', 'MANAGER', 'INVENTORY_MANAGER'].includes(actor.role)) throw new Error('CATALOG_WEBSITE_FORBIDDEN');
  if (!confirmed) throw new Error('CATALOG_IMAGE_CONSENT_REQUIRED');
  const collection = websiteContentReference(target, id);
  const bytes = validateCatalogImage(body, contentType);
  const snap = await db.collection(collection).doc(id).get();
  if (!snap.exists) throw new Error('CATALOG_WEBSITE_NOT_FOUND');
  const record: any = { ...snap.data(), id };
  if (target === 'items' ? !isPublicStorefrontMaster(record) : record.active === false || record.isActive === false || record.isArchived === true || ['inactive', 'INACTIVE'].includes(record.status) || ['ARCHIVED', 'INACTIVE'].includes(record.lifecycleStatus)) throw new Error('CATALOG_WEBSITE_INACTIVE');
  const token = crypto.randomUUID();
  const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1];
  // No user-supplied filename/path; each upload is a new immutable object.
  const objectPath = `catalog-public/${target}/${crypto.randomUUID()}.${extension}`;
  await adminBucket.file(objectPath).save(bytes, {
    resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 },
    metadata: {
      contentType, cacheControl: 'public, max-age=31536000, immutable',
      metadata: { firebaseStorageDownloadTokens: token, uploadedByUid: actor.uid, catalogTarget: target, catalogRecordId: id, purpose: 'public-catalog' }
    }
  });
  return { imageUrl: `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(adminBucket.name)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(token)}` };
}
