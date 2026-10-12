import { describe, expect, it } from 'vitest';
import { buildReportCsv, dateOnlyInVietnam, isPostedCashTransaction, isPostedInvoice } from '../src/features/reports/ReportsPage';
import { evaluateReportReadiness } from '../src/features/reports/reportReadiness';

describe('reports data integrity helpers', () => {
  it('converts UTC timestamps to the Vietnam business date', () => {
    expect(dateOnlyInVietnam('2026-09-01T17:30:00.000Z')).toBe('2026-09-02');
    expect(dateOnlyInVietnam('2026-09-02')).toBe('2026-09-02');
    expect(dateOnlyInVietnam('2026-09-02 08:15:00')).toBe('2026-09-02');
  });

  it('does not treat missing or invalid dates as report dates', () => {
    expect(dateOnlyInVietnam(undefined)).toBe('');
    expect(dateOnlyInVietnam('not-a-date')).toBe('');
  });

  it('only includes posted invoices and excludes cancellation/reversal states', () => {
    const base = { id: 'INV-1', customerName: 'Test', totalAmount: 100, discountAmount: 0, finalAmount: 100 } as any;
    expect(isPostedInvoice({ ...base, status: 'completed' })).toBe(true);
    expect(isPostedInvoice({ ...base, status: 'CANCELLED' })).toBe(false);
    expect(isPostedInvoice({ ...base, status: 'refunded' })).toBe(false);
    expect(isPostedInvoice({ ...base, status: 'pending' })).toBe(false);
    // Legacy records without a status represented a completed sale.
    expect(isPostedInvoice({ ...base })).toBe(true);
  });

  it('exports aggregate rows as an Excel-friendly UTF-8 CSV', () => {
    const csv = buildReportCsv([
      ['Chi nhánh', 'Đà Nẵng; trung tâm'],
      ['Ghi chú', 'Dòng "đã chốt"'],
      ['Doanh thu thuần', 1250000]
    ]);
    expect(csv.startsWith('\uFEFFChỉ tiêu;Giá trị\r\n')).toBe(true);
    expect(csv).toContain('Chi nhánh;"Đà Nẵng; trung tâm"');
    expect(csv).toContain('Ghi chú;"Dòng ""đã chốt"""');
    expect(csv).toContain('Doanh thu thuần;1250000');
  });

  it('excludes pending, cancelled and reversed cash movements', () => {
    const base = { id: 'PT-1', status: 'COMPLETED', recordStatus: 'POSTED' } as any;
    expect(isPostedCashTransaction(base)).toBe(true);
    expect(isPostedCashTransaction({ ...base, status: 'PENDING' })).toBe(false);
    expect(isPostedCashTransaction({ ...base, status: 'CANCELLED' })).toBe(false);
    expect(isPostedCashTransaction({ ...base, recordStatus: 'DRAFT' })).toBe(false);
    expect(isPostedCashTransaction({ ...base, recordStatus: 'REVERSED' })).toBe(false);
    // Older posted vouchers did not carry recordStatus.
    expect(isPostedCashTransaction({ ...base, recordStatus: undefined })).toBe(true);
  });

  it('keeps export disabled while the selected report snapshot is loading or partial', () => {
    const base = {
      rangeValid: true,
      loading: false,
      snapshotMatchesSelection: true,
      repairReportLoaded: true,
      cashReportLoaded: true,
      repairCoverage: 'COMPLETE' as const
    };
    expect(evaluateReportReadiness({ ...base, loading: true }).canExport).toBe(false);
    expect(evaluateReportReadiness({ ...base, repairCoverage: 'PARTIAL' }).status).toBe('PARTIAL');
    expect(evaluateReportReadiness({ ...base, snapshotMatchesSelection: false }).reasons).toContain('Snapshot hiện tại không còn khớp chi nhánh/kỳ đang chọn.');
  });

  it('allows export only when both server reports match the selected period', () => {
    const readiness = evaluateReportReadiness({
      rangeValid: true,
      loading: false,
      snapshotMatchesSelection: true,
      repairReportLoaded: true,
      repairCoverage: 'COMPLETE',
      cashReportLoaded: true,
      localPartialDomainCount: 0
    });
    expect(readiness).toMatchObject({ status: 'COMPLETE', canExport: true, reasons: [] });
  });
});
