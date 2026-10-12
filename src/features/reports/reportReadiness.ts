export type ReportReadinessStatus = 'PREVIEW' | 'PARTIAL' | 'COMPLETE';

export interface ReportReadinessInput {
  /** The selected period is syntactically valid and fully specified. */
  rangeValid: boolean;
  /** True while the server-authoritative report requests are in flight. */
  loading: boolean;
  /** Error from either remote report source. */
  error?: string | null;
  /** A report snapshot must belong to the current branch + period. */
  snapshotMatchesSelection: boolean;
  repairReportLoaded: boolean;
  repairCoverage?: 'COMPLETE' | 'PARTIAL' | string | null;
  cashReportLoaded: boolean;
  /** Local listener/admin snapshot can be explicitly partial. */
  localPartialDomainCount?: number;
}

export interface ReportReadiness {
  status: ReportReadinessStatus;
  canExport: boolean;
  reasons: string[];
}

/**
 * Central policy for report actions. A visible report may be useful as a
 * preview, but CSV/print must be disabled until every authoritative source is
 * loaded for the selected period and no source advertises partial coverage.
 */
export function evaluateReportReadiness(input: ReportReadinessInput): ReportReadiness {
  const reasons: string[] = [];
  if (!input.rangeValid) reasons.push('Khoảng thời gian chưa hợp lệ hoặc chưa đủ ngày.');
  if (input.loading) reasons.push('Đang tải dữ liệu server theo kỳ đã chọn.');
  if (!input.snapshotMatchesSelection) reasons.push('Snapshot hiện tại không còn khớp chi nhánh/kỳ đang chọn.');
  if (!input.repairReportLoaded) reasons.push('Chưa có báo cáo sửa chữa theo kỳ.');
  if (!input.cashReportLoaded) reasons.push('Chưa có sổ quỹ theo kỳ.');
  if (input.repairCoverage === 'PARTIAL') reasons.push('Báo cáo sửa chữa mới chỉ bao phủ một phần dữ liệu.');
  if (Number(input.localPartialDomainCount || 0) > 0) reasons.push('Một hoặc nhiều nhóm dữ liệu vận hành đang tải chưa đầy đủ.');
  if (input.error) reasons.push(input.error);

  const hasBlockingIssue = reasons.length > 0;
  const status: ReportReadinessStatus = hasBlockingIssue
    ? (input.repairReportLoaded && input.cashReportLoaded && !input.loading ? 'PARTIAL' : 'PREVIEW')
    : 'COMPLETE';
  return { status, canExport: status === 'COMPLETE', reasons };
}
