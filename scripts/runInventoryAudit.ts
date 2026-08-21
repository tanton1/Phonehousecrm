import { adminDb } from '../server/firebaseAdmin';
import { buildInventoryAuditReport } from '../server/services/inventoryDeviceService';

async function main() {
  const report = await buildInventoryAuditReport(adminDb);
  console.log(JSON.stringify({
    dryRun: report.dryRun,
    generatedAt: report.generatedAt,
    scanned: report.scanned,
    issueCount: report.issueCount,
    counts: report.counts
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
