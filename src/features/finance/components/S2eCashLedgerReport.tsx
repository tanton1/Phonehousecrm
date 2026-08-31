import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, Download, FileText, Printer, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import type { StoreBranch, StoreSettings } from '../../../types';
import {
  requestS2eCashLedger,
  type S2eCashLedgerReport,
  type S2eCashLedgerSource
} from '../../../services/financeApiClient';
import { getVietnamDateString } from '../../../utils/dateTimeUtils';

interface S2eCashLedgerReportProps {
  branchId: string;
  branches: StoreBranch[];
  storeSettings?: StoreSettings;
}

const money = (value: number) => new Intl.NumberFormat('vi-VN').format(Number(value || 0));

function dateLabel(value: string): string {
  const [year, month, day] = String(value || '').slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function reportErrorMessage(error: any): string {
  const message = String(error?.message || '');
  if (message.includes('S2E_BRANCH_REQUIRED')) return 'Hãy chọn một chi nhánh cụ thể để lập sổ S2e-HKD.';
  if (message.includes('S2E_DATE_RANGE_TOO_LARGE')) return 'Mỗi lần lập sổ tối đa 366 ngày.';
  if (message.includes('S2E_REPORT_TOO_MANY_ROWS')) return 'Kỳ đã chọn có quá nhiều chứng từ. Hãy chia nhỏ theo tháng hoặc quý.';
  if (message.includes('S2E_DATE_RANGE_INVALID')) return 'Khoảng ngày lập sổ không hợp lệ.';
  return error?.message || 'Không tải được Sổ chi tiết tiền S2e-HKD.';
}

export const S2eCashLedgerReportView: React.FC<S2eCashLedgerReportProps> = ({
  branchId,
  branches,
  storeSettings
}) => {
  const today = getVietnamDateString();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<S2eCashLedgerReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState('ALL');

  const selectedBranch = branches.find(branch => branch.id === branchId);
  const businessName = storeSettings?.companyName || storeSettings?.brandName || 'HỘ KINH DOANH PHONEHOUSE';
  const businessAddress = selectedBranch?.address || storeSettings?.headquarterAddress || '';
  const taxCode = selectedBranch?.taxCode || storeSettings?.taxCode || '';

  const loadReport = useCallback(async () => {
    if (!branchId || branchId === 'ALL') {
      setReport(null);
      setError('Hãy chọn một chi nhánh cụ thể để lập sổ S2e-HKD.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const nextReport = await requestS2eCashLedger({ branchId, from, to });
      setReport(nextReport);
      setSelectedSourceId(current => current === 'ALL' || nextReport.sources.some(source => source.id === current) ? current : 'ALL');
    } catch (requestError: any) {
      setError(reportErrorMessage(requestError));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [branchId, from, to]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const displayedSources = useMemo(() => {
    if (!report) return [];
    return selectedSourceId === 'ALL' ? report.sources : report.sources.filter(source => source.id === selectedSourceId);
  }, [report, selectedSourceId]);

  const displayedTotal = useMemo(() => displayedSources.reduce((summary, source) => ({
    openingBalance: summary.openingBalance + source.openingBalance,
    receipts: summary.receipts + source.receipts,
    payments: summary.payments + source.payments,
    closingBalance: summary.closingBalance + source.closingBalance
  }), { openingBalance: 0, receipts: 0, payments: 0, closingBalance: 0 }), [displayedSources]);

  const exportCsv = () => {
    if (!report) return;
    const rows: string[][] = [
      [businessName],
      [`Địa chỉ: ${businessAddress}`],
      [`Mã số thuế: ${taxCode}`],
      ['SỔ CHI TIẾT TIỀN - Mẫu số S2e-HKD'],
      [`Kỳ kê khai: ${dateLabel(from)} - ${dateLabel(to)}`],
      [],
      ['Nguồn tiền', 'Số hiệu chứng từ', 'Ngày tháng', 'Diễn giải', 'Thu/Gửi vào', 'Chi/Rút ra', 'Còn lại']
    ];
    for (const source of displayedSources) {
      rows.push([source.label, '', '', 'Số dư đầu kỳ', '', '', String(source.openingBalance)]);
      for (const row of source.rows) {
        rows.push([
          source.label,
          row.code,
          dateLabel(row.date),
          [row.description, row.partnerName, row.referenceCode].filter(Boolean).join(' • '),
          row.receipt ? String(row.receipt) : '',
          row.payment ? String(row.payment) : '',
          String(row.runningBalance)
        ]);
      }
      rows.push([source.label, '', '', 'Tổng phát sinh trong kỳ', String(source.receipts), String(source.payments), String(source.closingBalance)]);
    }
    rows.push(['TỔNG CỘNG', '', '', '', String(displayedTotal.receipts), String(displayedTotal.payments), String(displayedTotal.closingBalance)]);
    const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `S2e-HKD_${branchId}_${from}_${to}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  if (!branchId || branchId === 'ALL') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <AlertTriangle className="mx-auto h-9 w-9 text-amber-600" />
        <h3 className="mt-3 text-sm font-black text-amber-900">Cần chọn một chi nhánh</h3>
        <p className="mt-1 text-xs text-amber-800">Sổ S2e-HKD được mở theo từng địa điểm và nguồn tiền cụ thể, không lập chung ở chế độ “Tất cả”.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #s2e-print-area, #s2e-print-area * { visibility: visible !important; }
          #s2e-print-area { position: absolute; inset: 0; width: 100%; background: white; padding: 8mm; }
          .s2e-no-print { display: none !important; }
          .s2e-source { break-inside: avoid; box-shadow: none !important; }
          @page { size: A4 landscape; margin: 8mm; }
        }
      `}</style>

      <div className="s2e-no-print rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#ff4b16]" />
              <h3 className="text-base font-black text-zinc-900">S2e-HKD · Sổ chi tiết tiền</h3>
            </div>
            <p className="mt-1 text-xs text-zinc-500">Theo Thông tư 152/2025/TT-BTC · Tiền mặt và tiền gửi thanh toán</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[10px] font-bold uppercase text-zinc-500">Từ ngày
              <input type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} className="mt-1 block h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-xs font-bold text-zinc-800" />
            </label>
            <label className="text-[10px] font-bold uppercase text-zinc-500">Đến ngày
              <input type="date" value={to} min={from} onChange={event => setTo(event.target.value)} className="mt-1 block h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-xs font-bold text-zinc-800" />
            </label>
            <button type="button" onClick={() => void loadReport()} disabled={loading} className="flex h-10 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 hover:border-orange-300 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Làm mới
            </button>
            <button type="button" onClick={exportCsv} disabled={!report} className="flex h-10 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 disabled:opacity-50">
              <Download className="h-3.5 w-3.5" /> Xuất Excel (.csv)
            </button>
            <button type="button" onClick={() => window.print()} disabled={!report} className="flex h-10 items-center gap-1.5 rounded-xl bg-[#ff4b16] px-3 text-xs font-bold text-white disabled:opacity-50">
              <Printer className="h-3.5 w-3.5" /> In / Lưu PDF
            </button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}

      {loading && !report && (
        <div className="flex min-h-52 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-sm font-bold text-zinc-500">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Đang tổng hợp sổ từ dữ liệu máy chủ…
        </div>
      )}

      {report && (
        <div id="s2e-print-area" className="space-y-4 rounded-2xl bg-white p-3 sm:p-5">
          <header className="grid gap-3 border-b-2 border-zinc-900 pb-4 sm:grid-cols-[1fr_auto]">
            <div className="text-xs leading-5 text-zinc-700">
              <p className="font-black uppercase text-zinc-950">{businessName}</p>
              <p>Địa chỉ: {businessAddress || 'Chưa cấu hình'}</p>
              <p>Mã số thuế: {taxCode || 'Chưa cấu hình'}</p>
              <p>Chi nhánh: {selectedBranch?.name || branchId}</p>
            </div>
            <div className="text-right text-[10px] font-semibold text-zinc-500">
              <p>Mẫu số S2e-HKD</p>
              <p>(Kèm theo Thông tư số 152/2025/TT-BTC)</p>
            </div>
            <div className="sm:col-span-2 text-center">
              <h2 className="text-xl font-black uppercase tracking-wide text-zinc-950">Sổ chi tiết tiền</h2>
              <p className="mt-1 text-xs font-bold text-zinc-600">Kỳ kê khai: {dateLabel(report.from)} đến {dateLabel(report.to)} · Đơn vị tính: VNĐ</p>
            </div>
          </header>

          <div className="s2e-no-print flex gap-2 overflow-x-auto pb-1">
            <button type="button" onClick={() => setSelectedSourceId('ALL')} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold ${selectedSourceId === 'ALL' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700'}`}>Tất cả nguồn tiền</button>
            {report.sources.map(source => <button type="button" key={source.id} onClick={() => setSelectedSourceId(source.id)} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold ${selectedSourceId === source.id ? 'bg-[#ff4b16] text-white' : 'bg-orange-50 text-orange-700'}`}>{source.label}</button>)}
          </div>

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              ['Số dư đầu kỳ', displayedTotal.openingBalance, 'text-zinc-900'],
              ['Thu/Gửi vào', displayedTotal.receipts, 'text-emerald-700'],
              ['Chi/Rút ra', displayedTotal.payments, 'text-rose-700'],
              ['Số dư cuối kỳ', displayedTotal.closingBalance, 'text-blue-700']
            ].map(([label, value, tone]) => (
              <div key={String(label)} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-bold uppercase text-zinc-500">{label}</p>
                <p className={`mt-1 font-mono text-base font-black ${tone}`}>{money(Number(value))} đ</p>
              </div>
            ))}
          </div>

          {displayedSources.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-xs font-semibold text-zinc-500">Chi nhánh chưa có quỹ tiền mặt hoặc tài khoản ngân hàng.</div>
          ) : displayedSources.map(source => <SourceLedger key={source.id} source={source} openingDate={report.from} />)}

          {report.excludedSettlementFunds.length > 0 && (
            <div className="s2e-no-print rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-black">Đã loại khỏi S2e-HKD: tiền đang chờ đối soát</p>
                  <p className="mt-1">{report.excludedSettlementFunds.map(fund => `${fund.name}: ${money(fund.currentBalance)} đ`).join(' · ')}</p>
                </div>
              </div>
            </div>
          )}

          {(report.total.internalReceipts > 0 || report.total.internalPayments > 0) && (
            <p className="s2e-no-print text-[11px] text-zinc-500">Luân chuyển nội bộ được thể hiện tại từng nguồn tiền theo mẫu sổ, nhưng không được coi là doanh thu/chi phí. Thu–chi bên ngoài lần lượt là {money(report.total.externalReceipts)} đ và {money(report.total.externalPayments)} đ.</p>
          )}

          <footer className="grid grid-cols-2 gap-8 pt-6 text-center text-xs">
            <div><p className="font-black">NGƯỜI LẬP SỔ</p><p className="mt-12 text-zinc-500">(Ký, họ tên)</p></div>
            <div><p className="font-black">NGƯỜI ĐẠI DIỆN HỘ KINH DOANH</p><p className="mt-12 text-zinc-500">(Ký, họ tên và đóng dấu nếu có)</p></div>
          </footer>
        </div>
      )}
    </div>
  );
};

const SourceLedger: React.FC<{ source: S2eCashLedgerSource; openingDate: string }> = ({ source, openingDate }) => (
  <section className="s2e-source overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-2xs">
    <div className="flex items-center justify-between bg-zinc-100 px-3 py-2.5">
      <div className="flex items-center gap-2">
        {source.kind === 'CASH' ? <Wallet className="h-4 w-4 text-orange-600" /> : <Building2 className="h-4 w-4 text-blue-700" />}
        <div><h3 className="text-xs font-black uppercase text-zinc-900">{source.label}</h3>{source.accountHolder && <p className="text-[10px] text-zinc-500">Chủ tài khoản: {source.accountHolder}</p>}</div>
      </div>
      <p className="font-mono text-xs font-black text-blue-700">Cuối kỳ: {money(source.closingBalance)} đ</p>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-[11px]">
        <thead><tr className="border-y border-zinc-300 bg-white text-left font-black text-zinc-700"><th className="px-2 py-2">Số hiệu</th><th className="px-2 py-2">Ngày tháng</th><th className="px-2 py-2">Diễn giải</th><th className="px-2 py-2 text-right">Thu/Gửi vào</th><th className="px-2 py-2 text-right">Chi/Rút ra</th><th className="px-2 py-2 text-right">Còn lại</th></tr></thead>
        <tbody>
          <tr className="border-b border-zinc-200 bg-amber-50/60 font-bold"><td className="px-2 py-2" /><td className="px-2 py-2">{dateLabel(openingDate)}</td><td className="px-2 py-2">Số dư đầu kỳ</td><td className="px-2 py-2 text-right" /><td className="px-2 py-2 text-right" /><td className="px-2 py-2 text-right font-mono">{money(source.openingBalance)}</td></tr>
          {source.rows.map(row => (
            <tr key={row.id} className="border-b border-zinc-100 align-top">
              <td className="px-2 py-2 font-mono font-bold">{row.code}</td><td className="whitespace-nowrap px-2 py-2">{dateLabel(row.date)}</td>
              <td className="px-2 py-2"><p className="font-semibold text-zinc-900">{row.description}</p><p className="text-[10px] text-zinc-500">{[row.partnerName, row.referenceCode, row.fundName].filter(Boolean).join(' • ')}</p>{row.isInternalTransfer && <span className="s2e-no-print mt-1 inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">Luân chuyển nội bộ</span>}</td>
              <td className="px-2 py-2 text-right font-mono text-emerald-700">{row.receipt ? money(row.receipt) : ''}</td><td className="px-2 py-2 text-right font-mono text-rose-700">{row.payment ? money(row.payment) : ''}</td><td className="px-2 py-2 text-right font-mono font-bold">{money(row.runningBalance)}</td>
            </tr>
          ))}
          <tr className="bg-zinc-100 font-black"><td colSpan={3} className="px-2 py-2 text-right">Tổng phát sinh / Số dư cuối kỳ</td><td className="px-2 py-2 text-right font-mono text-emerald-700">{money(source.receipts)}</td><td className="px-2 py-2 text-right font-mono text-rose-700">{money(source.payments)}</td><td className="px-2 py-2 text-right font-mono text-blue-700">{money(source.closingBalance)}</td></tr>
        </tbody>
      </table>
    </div>
  </section>
);
