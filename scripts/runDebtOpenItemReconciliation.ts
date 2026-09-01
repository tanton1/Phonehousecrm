import { adminDb } from '../server/firebaseAdmin';
import {
  DebtOpenItemReconciliationOptions,
  reconcileDebtOpenItems
} from '../server/services/debtOpenItemReconciliationService';
import type { DebtOpenItemSourceType } from '../server/services/branchPartyService';

const ALLOWED_SOURCE_TYPES = new Set<DebtOpenItemSourceType>([
  'PURCHASE_ORDER',
  'INVOICE',
  'TECHNICAL_WORK_ORDER'
]);

function argumentValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find(argument => argument.startsWith(prefix))?.slice(prefix.length);
}

function positiveInteger(name: string): number | undefined {
  const raw = argumentValue(name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`ARGUMENT_${name.toUpperCase().replace(/-/g, '_')}_INVALID`);
  return value;
}

function parseSourceTypes(): DebtOpenItemSourceType[] | undefined {
  const raw = argumentValue('source');
  if (!raw) return undefined;
  const values = [...new Set(raw.split(',').map(value => value.trim().toUpperCase()).filter(Boolean))] as DebtOpenItemSourceType[];
  if (!values.length || values.some(value => !ALLOWED_SOURCE_TYPES.has(value))) {
    throw new Error('ARGUMENT_SOURCE_INVALID');
  }
  return values;
}

async function main() {
  const options: DebtOpenItemReconciliationOptions = {
    apply: process.argv.includes('--apply'),
    branchId: argumentValue('branch-id'),
    sourceTypes: parseSourceTypes(),
    pageSize: positiveInteger('page-size'),
    maxDocumentsPerCollection: positiveInteger('max-docs'),
    writeBatchSize: positiveInteger('write-batch-size'),
    actorUid: argumentValue('actor-uid')
  };
  const report = await reconcileDebtOpenItems(adminDb, options);
  console.log(JSON.stringify(report, null, 2));
  if (report.summary.applyFailed > 0) process.exitCode = 2;
}

main().catch(error => {
  console.error(JSON.stringify({
    success: false,
    error: error instanceof Error ? error.message : String(error)
  }));
  process.exitCode = 1;
});
