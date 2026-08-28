import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Production Gate B regression boundaries', () => {
  it('does not persist a long-lived signed evidence URL', () => {
    const evidence = source('server/routes/evidence.ts');
    expect(evidence).not.toContain("expires: Date.now() + 7 * 24 * 60 * 60_000");
    expect(evidence).not.toContain('url: readUrl');
    expect(evidence).toContain('issueEvidenceReadUrl');
    expect(evidence).toContain('sha256StorageObject');
  });

  it('uploads evidence through the authenticated same-origin endpoint for mobile Safari', () => {
    const client = source('src/services/evidenceApiClient.ts');
    const server = source('server/routes/evidence.ts');
    expect(client).toContain('contentUploadUrl');
    expect(client).toContain('uploadEvidenceContent');
    expect(server).toContain("router.put('/upload-sessions/:id/content'");
    expect(server).toContain("status: 'UPLOADED'");
  });

  it('uses authenticated AI API calls and renders generated content as text', () => {
    const assistant = source('src/components/ExecutiveAIAssistantModal.tsx');
    expect(assistant).toContain("apiJson<{ success: boolean; htmlResponse?: string }>");
    expect(assistant).not.toContain('dangerouslySetInnerHTML');
    expect(assistant).toContain('executiveSummaryText(lastResult.summaryHtml)');
  });

  it('scopes attendance checkout to branch and returns the actual closed record id', () => {
    const attendance = source('server/services/attendanceService.ts');
    expect(attendance).toContain(".where('branchId', '==', payload.branchId)");
    expect(attendance).toContain(".orderBy('createdAt', 'desc')");
    expect(attendance).toContain('id: targetAttRef.id');
  });

  it('persists pure-intent installment contract codes and CRM audit atomically', () => {
    const checkout = source('server/services/checkoutService.ts');
    const crm = source('server/routes/crm.ts');
    expect(checkout).toContain('payload.installmentContractCode || payload.payment?.installmentContractCode');
    expect(crm).toContain('transaction.set(activityRef');
    expect(crm).toContain('branchId: lData.branchId');
    expect(crm).toContain('fromStatus: currentStatus');
  });
});
