import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { CatalogPublicContent } from '../../shared/catalogPublicContent';

/** Public fields are intentionally separate from the catalogue's private notes. */
export function CatalogPublicContentFields({ value, onChange, model = false }: { value: CatalogPublicContent; onChange: (patch: CatalogPublicContent) => void; model?: boolean }) {
  const inputClass = 'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-800';
  return <fieldset className="mt-4 space-y-3 rounded-xl border border-sky-200 bg-sky-50/40 p-3">
    <legend className="px-1 text-xs font-bold text-sky-900">Nội dung công khai trên website</legend>
    <p className="text-[11px] leading-5 text-zinc-600">{model ? 'Nhập một lần để các cấu hình điện thoại cùng model dùng chung. Ảnh model luôn được ghi là ảnh tham khảo, không cam kết màu hoặc tình trạng máy.' : 'Nội dung riêng của mã hàng được ưu tiên. Để trống để kế thừa nội dung công khai sẵn có; ghi chú nội bộ không đưa lên website.'}</p>
    <label className="block text-xs font-semibold">Ảnh chính<input className={inputClass} value={value.imageUrl || ''} maxLength={2000} onChange={event => onChange({ imageUrl: event.target.value })} placeholder="https://firebasestorage.googleapis.com/…" /></label>
    <label className="block text-xs font-semibold">Thư viện ảnh (tối đa 8 đường dẫn)<textarea className={inputClass} rows={3} value={(value.imageUrls || []).join('\n')} onChange={event => onChange({ imageUrls: event.target.value.split('\n') })} placeholder="Mỗi dòng một URL HTTPS hoặc đường dẫn /…" /></label>
    <p className="text-[10px] leading-4 text-zinc-500">Website hiển thị tối đa 8 ảnh khác nhau, gồm ảnh chính trước rồi đến các ảnh trong thư viện.</p>
    <p className="text-[10px] leading-4 text-zinc-500">Dùng ảnh bạn có quyền công khai, ưu tiên Firebase Storage của cửa hàng. Không dùng ảnh chứa IMEI, hóa đơn hay thông tin khách hàng. Tên miền ảnh ngoài phải được cấu hình trong chính sách bảo mật của website.</p>
    <label className="block text-xs font-semibold">Mô tả sản phẩm<textarea className={inputClass} rows={5} maxLength={6000} value={value.publicDescription || ''} onChange={event => onChange({ publicDescription: event.target.value })} placeholder="Nội dung khách hàng sẽ đọc trên trang chi tiết" /></label>
    <label className="block text-xs font-semibold">Điểm nổi bật (tối đa 8 dòng)<textarea className={inputClass} rows={3} value={(value.publicHighlights || []).join('\n')} onChange={event => onChange({ publicHighlights: event.target.value.split('\n') })} placeholder="Chỉ nhập thông tin đã được xác nhận" /></label>
    <div className="space-y-2"><p className="text-xs font-semibold">Thông số công khai</p>{(value.publicSpecifications || []).map((spec, index) => <div className="flex items-start gap-2" key={index}>
      <input aria-label={`Tên thông số ${index + 1}`} className={`${inputClass} min-w-0 flex-1`} maxLength={80} value={spec.label} placeholder="Ví dụ: Cổng kết nối" onChange={event => onChange({ publicSpecifications: value.publicSpecifications!.map((row, i) => i === index ? { ...row, label: event.target.value } : row) })} />
      <input aria-label={`Giá trị thông số ${index + 1}`} className={`${inputClass} min-w-0 flex-[2]`} maxLength={400} value={spec.value} placeholder="Giá trị đã xác nhận" onChange={event => onChange({ publicSpecifications: value.publicSpecifications!.map((row, i) => i === index ? { ...row, value: event.target.value } : row) })} />
      <button type="button" className="mt-1 rounded-lg p-2 text-zinc-500 hover:bg-white" aria-label={`Xóa thông số ${index + 1}`} onClick={() => onChange({ publicSpecifications: value.publicSpecifications!.filter((_, i) => i !== index) })}><Trash2 size={16} /></button>
    </div>)}<button type="button" disabled={(value.publicSpecifications?.length || 0) >= 24} className="flex items-center gap-1 text-xs font-semibold text-sky-800 disabled:opacity-50" onClick={() => onChange({ publicSpecifications: [...(value.publicSpecifications || []), { label: '', value: '' }] })}><Plus size={14} />Thêm thông số</button></div>
  </fieldset>;
}
