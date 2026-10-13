import React, { useEffect, useMemo, useState } from 'react';
import { Check, Filter, Image as ImageIcon, Loader2, RefreshCw, Save, Search, ShieldCheck, Sparkles } from 'lucide-react';
import type { CatalogPublicContent } from '../../shared/catalogPublicContent';
import { CatalogPublicContentFields } from './CatalogPublicContentFields';
import { catalogApi } from '../services/catalogApiClient';
import { WEBSITE_CONTENT_ISSUES, type WebsiteContentIssue, type WebsiteContentPage } from '../../shared/catalogWebsiteContent';

const kinds = [
  { value: '', label: 'Tất cả nhóm' },
  { value: 'DEVICE', label: 'Điện thoại' },
  { value: 'ACCESSORY', label: 'Phụ kiện' },
  { value: 'PART', label: 'Linh kiện' }
] as const;

function emptyContent(value?: CatalogPublicContent): CatalogPublicContent {
  return {
    imageUrl: value?.imageUrl || '', imageUrls: [...(value?.imageUrls || [])],
    publicDescription: value?.publicDescription || '', publicHighlights: [...(value?.publicHighlights || [])],
    publicSpecifications: (value?.publicSpecifications || []).map(row => ({ ...row }))
  };
}

function issueTone(issue: WebsiteContentIssue) {
  return issue === 'IMAGE' ? 'border-violet-200 bg-violet-50 text-violet-700'
    : issue === 'PRICE' ? 'border-amber-200 bg-amber-50 text-amber-700'
      : issue === 'COMPATIBILITY' ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-zinc-200 bg-zinc-50 text-zinc-600';
}

export function WebsiteContentManagerView() {
  const [page, setPage] = useState<WebsiteContentPage | null>(null);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [issue, setIssue] = useState<WebsiteContentIssue | ''>('');
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [target, setTarget] = useState<'items' | 'models'>('items');
  const [draft, setDraft] = useState<CatalogPublicContent>({});
  const [compatibleModelIds, setCompatibleModelIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async (keepSelection = true) => {
    setLoading(true); setError('');
    try {
      const next = await catalogApi.listWebsiteContent({ search, kind: kind as any, issue });
      setPage(next);
      if (!keepSelection || !next.items.some(row => row.product.id === selectedId)) {
        setSelectedId(next.items[0]?.product.id || '');
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'Không tải được danh sách nội dung website.');
    } finally { setLoading(false); }
  };

  useEffect(() => { const timer = window.setTimeout(() => void load(false), 220); return () => window.clearTimeout(timer); }, [search, kind, issue]);
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setError('');
    void catalogApi.getWebsiteContent(selectedId).then(value => {
      setDetail(value); setTarget('items'); setDraft(emptyContent(value.item.content)); setCompatibleModelIds(value.item.compatibleModelIds || []);
    }).catch(loadError => setError(loadError?.message || 'Không tải được nội dung sản phẩm.'));
  }, [selectedId]);

  const activeEditor = target === 'models' ? detail?.model : detail?.item;
  const issueLabels = useMemo(() => Object.entries(WEBSITE_CONTENT_ISSUES) as [WebsiteContentIssue, string][], []);
  const changeTarget = (next: 'items' | 'models') => {
    if (next === 'models' && !detail?.model) return;
    setTarget(next);
    const editor = next === 'models' ? detail.model : detail.item;
    setDraft(emptyContent(editor?.content));
    setCompatibleModelIds(editor?.compatibleModelIds || []);
  };
  const save = async () => {
    if (!activeEditor || !detail) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await catalogApi.updateWebsiteContent(target, activeEditor.id, {
        confirmed: true, expectedRevision: activeEditor.revision, content: draft,
        ...(target === 'items' && detail.product.kind !== 'DEVICE' ? { compatibleModelIds } : {})
      });
      setNotice('Đã lưu nội dung công khai. Website sẽ cập nhật sau lần tải kế tiếp.');
      const refreshed = await catalogApi.getWebsiteContent(selectedId);
      setDetail(refreshed);
      const editor = target === 'models' ? refreshed.model : refreshed.item;
      setDraft(emptyContent(editor?.content)); setCompatibleModelIds(editor?.compatibleModelIds || []);
      await load(true);
    } catch (saveError: any) {
      setError(saveError?.code === 'CATALOG_WEBSITE_CONTENT_CONFLICT' ? 'Nội dung đã được người khác cập nhật. Mình đã giữ bản đang mở; hãy tải lại rồi sửa tiếp.' : saveError?.message || 'Không thể lưu nội dung.');
    } finally { setSaving(false); }
  };

  return <section className="space-y-3 rounded-2xl border border-sky-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
      <div><div className="flex items-center gap-2 text-sky-700"><Sparkles className="h-5 w-5" /><h2 className="text-base font-black text-zinc-950">Nội dung sản phẩm trên website</h2></div><p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">Theo dõi nhanh ảnh, mô tả, thông số và tương thích còn thiếu. Giá và tồn kho vẫn lấy từ hệ thống, không chỉnh tại màn hình này.</p></div>
      <button type="button" onClick={() => void load(true)} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-zinc-200 px-3 text-xs font-black text-zinc-700"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới</button>
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {issueLabels.map(([value, label]) => <button type="button" key={value} onClick={() => setIssue(current => current === value ? '' : value)} className={`rounded-xl border p-3 text-left transition ${issue === value ? 'border-zinc-950 ring-2 ring-zinc-200' : 'border-zinc-200 hover:border-sky-300'}`}><p className="text-[10px] font-bold text-zinc-500">{label}</p><p className="mt-1 text-xl font-black text-zinc-950">{page?.counts?.[value] ?? '—'}</p></button>)}
    </div>
    <div className="flex flex-col gap-2 sm:flex-row">
      <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm tên, SKU, model…" className="min-h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-9 pr-3 text-xs outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" /></label>
      <label className="flex min-w-44 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3"><Filter className="h-4 w-4 text-zinc-400" /><select value={kind} onChange={event => setKind(event.target.value)} className="min-h-11 flex-1 bg-transparent text-xs font-bold outline-none">{kinds.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    </div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-700">{notice}</p>}
    <div className="grid gap-3 xl:grid-cols-[minmax(20rem,.8fr)_minmax(0,1.2fr)]">
      <div className="min-h-72 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
        <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-3 py-2"><p className="text-xs font-black text-zinc-800">{page?.total ?? 0} mục cần rà soát</p>{loading && <Loader2 className="h-4 w-4 animate-spin text-sky-600" />}</div>
        <div className="max-h-[34rem] overflow-y-auto p-1.5">{page?.items.length ? page.items.map(row => <button type="button" key={row.product.id} onClick={() => setSelectedId(row.product.id)} className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition ${row.product.id === selectedId ? 'bg-sky-100 ring-1 ring-sky-300' : 'hover:bg-white'}`}>
          <div className="flex h-14 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-white">{row.product.imageUrl ? <img src={row.product.imageUrl} alt="" className="h-full w-full object-contain" /> : <ImageIcon className="h-5 w-5 text-zinc-300" />}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-zinc-800">{row.product.name}</p><p className="mt-0.5 truncate text-[10px] text-zinc-500">{row.product.sku} · {row.product.kind === 'DEVICE' ? [row.product.model, row.product.storage, row.product.color].filter(Boolean).join(' · ') : row.product.category}</p><div className="mt-1 flex flex-wrap gap-1">{row.issues.map(value => <span key={value} className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${issueTone(value)}`}>{WEBSITE_CONTENT_ISSUES[value]}</span>)}</div></div>
        </button>) : <div className="p-8 text-center text-xs font-semibold text-zinc-500">{loading ? 'Đang rà soát…' : 'Không có mục phù hợp bộ lọc.'}</div>}</div>
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-3 sm:p-4">
        {!detail ? <div className="flex min-h-72 flex-col items-center justify-center text-center text-zinc-400"><ShieldCheck className="h-8 w-8" /><p className="mt-2 text-xs font-bold">Chọn một sản phẩm để cập nhật</p></div> : <>
          <div className="flex flex-col justify-between gap-3 border-b border-zinc-100 pb-3 sm:flex-row sm:items-start"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-sky-600">{detail.product.kind === 'DEVICE' ? 'Điện thoại' : detail.product.kind === 'ACCESSORY' ? 'Phụ kiện' : 'Linh kiện'}</p><h3 className="mt-1 truncate text-base font-black text-zinc-950">{detail.product.name}</h3><p className="mt-1 text-[10px] text-zinc-500">{detail.product.sku} · {detail.product.inStock ? 'Đang có hàng' : 'Chưa có hàng'} · {detail.product.price === null ? 'Chưa có giá' : 'Đã có giá'}</p></div><div className="flex shrink-0 gap-1 rounded-xl bg-zinc-100 p-1"><button type="button" onClick={() => changeTarget('items')} className={`rounded-lg px-3 py-2 text-[10px] font-black ${target === 'items' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500'}`}>SKU này</button>{detail.model && <button type="button" onClick={() => changeTarget('models')} className={`rounded-lg px-3 py-2 text-[10px] font-black ${target === 'models' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500'}`}>Model dùng chung</button>}</div></div>
          <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/60 p-3 text-[11px] leading-5 text-sky-900">{target === 'models' ? `Nội dung này dùng chung cho ${detail.model.affectedProducts} cấu hình cùng model. Ảnh được ghi là ảnh tham khảo.` : 'Nội dung riêng của SKU sẽ được ưu tiên. Không nhập IMEI, giá vốn, ghi chú nội bộ hoặc ảnh kiểm tra máy.'}</div>
          <CatalogPublicContentFields value={draft} onChange={patch => setDraft(current => ({ ...current, ...patch }))} model={target === 'models'} />
          {target === 'items' && detail.product.kind !== 'DEVICE' && <label className="mt-3 block text-xs font-bold text-zinc-800">Model tương thích đã xác nhận<select multiple value={compatibleModelIds} onChange={event => setCompatibleModelIds([...event.target.selectedOptions].map(option => option.value))} className="mt-1 min-h-24 w-full rounded-xl border border-zinc-200 bg-white p-2 text-xs font-normal"><option value="" disabled>Chọn một hoặc nhiều model</option>{detail.models.map((model: { id: string; name: string }) => <option key={model.id} value={model.id}>{model.name}</option>)}</select><span className="mt-1 block text-[10px] font-normal text-zinc-500">Website chỉ gợi ý phụ kiện khi có khai báo tương thích chính xác.</span></label>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] text-zinc-500">Đang sửa: {activeEditor?.name || '—'} · Có kiểm tra phiên bản khi lưu</p><button type="button" disabled={saving || !activeEditor} onClick={() => void save()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-zinc-950 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu nội dung</button></div>
        </>}
      </div>
    </div>
    <p className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-[10px] leading-4 text-zinc-500"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> Ảnh, mô tả và thông số công khai được tách khỏi dữ liệu kiểm kê. Website không tự lấy ảnh riêng tư của từng máy và không suy đoán phụ kiện theo tên gần giống.</p>
  </section>;
}

export default WebsiteContentManagerView;
