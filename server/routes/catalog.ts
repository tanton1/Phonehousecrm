import { Request, Response, Router } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';
import {
  getCatalogBootstrap,
  listCatalogItems,
  previewCatalogCandidates,
  previewCatalogBulk,
  previewCatalogClone,
  previewCatalogImport,
  processArchiveCatalogItem,
  processCatalogCandidates,
  processCatalogBulkCreate,
  processCatalogClone,
  processCatalogImport,
  processRollbackCatalogOperation,
  processCreateCatalogDictionary,
  processCreateCatalogItem,
  processCreateCatalogModel,
  processUpdateCatalogDictionary,
  processUpdateCatalogItem,
  processUpdateCatalogModel
} from '../services/catalogService';

const READ_ROLES = ['ADMIN', 'MANAGER', 'INVENTORY_MANAGER', 'ACCOUNTANT'] as const;
const WRITE_ROLES = ['ADMIN', 'MANAGER', 'INVENTORY_MANAGER'] as const;

function statusForCatalogError(error: any) {
  const message = String(error?.message || 'CATALOG_REQUEST_FAILED');
  if (/FORBIDDEN|UNAUTHENTICATED/.test(message)) return 403;
  if (/DUPLICATE|IDEMPOTENCY|COLLISION|EXISTING/.test(message)) return 409;
  if (/NOT_FOUND/.test(message)) return 404;
  return 400;
}

function sendError(res: Response, error: any) {
  return res.status(statusForCatalogError(error)).json({
    success: false,
    error: error?.message || 'CATALOG_REQUEST_FAILED'
  });
}

function previewPayload(result: any) {
  return {
    items: result.candidates,
    existing: result.existing,
    invalid: result.invalid,
    nearDuplicates: result.nearDuplicates,
    summary: {
      total: result.totalCount,
      new: result.newCount,
      existing: result.existingCount,
      duplicateInRequest: result.duplicateCount,
      invalid: Array.isArray(result.invalid) ? result.invalid.length : 0
    }
  };
}

function createPayload(result: any) {
  return {
    created: result.created || [],
    skipped: result.skipped || [],
    invalid: result.invalid || [],
    nearDuplicates: result.nearDuplicates || [],
    idempotentReplay: result.idempotentReplay === true,
    operationKey: result.operationKey,
    summary: {
      total: result.totalCount || 0,
      created: result.createdCount || 0,
      skippedExisting: result.skippedExistingCount || 0,
      invalid: Array.isArray(result.invalid) ? result.invalid.length : 0
    }
  };
}

/**
 * Server-authoritative Product Master and SKU-generator API. The router does
 * not touch products, spareParts or device inventory collections.
 */
export function createCatalogRouter(db: Firestore | null): Router {
  const router = Router();
  router.use(authenticateFirebase);

  router.get('/bootstrap', requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await getCatalogBootstrap(db, { limit: req.query.limit ? Number(req.query.limit) : undefined });
      return res.json({
        success: true,
        data: {
          models: result.models,
          dictionaries: result.dictionaries,
          items: result.items,
          itemSummary: {
            total: result.itemCount,
            loaded: result.items.length,
            hasMore: result.hasMoreItems
          }
        }
      });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.get('/items', requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await listCatalogItems(db, {
        limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
        cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        kind: typeof req.query.kind === 'string' ? req.query.kind as any : undefined,
        includeArchived: req.query.includeArchived === 'true' || req.query.includeArchived === '1',
        activeOnly: req.query.activeOnly === 'true' || req.query.activeOnly === '1'
      });
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.post('/models', requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      return res.status(201).json({ success: true, data: await processCreateCatalogModel(db, req.body, req.user!) });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.patch('/models/:modelId', requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      return res.json({ success: true, data: await processUpdateCatalogModel(db, req.params.modelId, req.body, req.user!) });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.post('/dictionaries', requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      return res.status(201).json({ success: true, data: await processCreateCatalogDictionary(db, req.body, req.user!) });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.patch('/dictionaries/:dictionaryId', requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      return res.json({ success: true, data: await processUpdateCatalogDictionary(db, req.params.dictionaryId, req.body, req.user!) });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.post('/items', requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processCreateCatalogItem(db, req.body, req.user!);
      return res.status(201).json({ success: true, data: createPayload(result) });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.patch('/items/:itemId', requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      return res.json({ success: true, data: await processUpdateCatalogItem(db, req.params.itemId, req.body, req.user!) });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.post('/items/:itemId/archive', requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      return res.json({ success: true, data: await processArchiveCatalogItem(db, req.params.itemId, req.body?.reason, req.user!) });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.post('/operations/:operationKey/rollback', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processRollbackCatalogOperation(db, req.params.operationKey, req.user!);
      return res.json({
        success: true,
        data: {
          operationKey: result.operationKey,
          archived: result.archived || [],
          blocked: result.blocked || [],
          summary: {
            archived: result.archivedCount || 0,
            blocked: result.blockedCount || 0
          },
          idempotentReplay: result.idempotentReplay === true
        }
      });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.post('/bulk/preview', requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = Array.isArray(req.body?.items)
        ? await previewCatalogCandidates(db, req.body)
        : await previewCatalogBulk(db, req.body);
      return res.json({ success: true, data: previewPayload(result) });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.post('/bulk/create', requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = Array.isArray(req.body?.items)
        ? await processCatalogCandidates(db, req.body, req.user!)
        : await processCatalogBulkCreate(db, req.body, req.user!);
      return res.status(201).json({ success: true, data: createPayload(result) });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.post('/import/preview', requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      return res.json({ success: true, data: previewPayload(await previewCatalogCandidates(db, req.body)) });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.post('/import/create', requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      return res.status(201).json({ success: true, data: createPayload(await processCatalogCandidates(db, req.body, req.user!)) });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.post('/clone/preview', requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      return res.json({ success: true, data: previewPayload(await previewCatalogClone(db, req.body)) });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.post('/clone/create', requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      return res.status(201).json({ success: true, data: createPayload(await processCatalogClone(db, req.body, req.user!)) });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  return router;
}
