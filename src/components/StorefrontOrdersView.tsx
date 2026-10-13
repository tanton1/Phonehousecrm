import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, PackageCheck, Phone, RefreshCw, ShoppingBag } from 'lucide-react';
import { apiJson } from '../services/apiClient';

type Order = {
  id: string; code: string; status: string; branchName: string; customerName: string; customerPhone: string;
  fulfillment: string; address: string; note: string; createdAt: string; estimatedTotal: number; hasUnpricedItems: boolean;
  lines: { productId: string; name: string; quantity: number; unitPrice: number | null; inStockAtRequest: boolean }[];
};
const statuses: Record<string, string> = { NEW: 'Mới tiếp nhận', CONTACTED: 'Đã liên hệ', CLOSED: 'Đã xử lý', CANCELLED: 'Đã hủy' };
export function StorefrontOrdersView() {
  const [orders, setOrders] = useState<Order[]>([]), [cursor, setCursor] = useState<string | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState('');
  const load = useCallback(async (next = '') => {
    setLoading(true); setError('');
    try {
      const result = await apiJson<{ data: { items: Order[]; nextCursor: string | null } }>(`/api/storefront/staff/orders?${new URLSearchParams({ cursor: next })}`);
      setOrders(previous => [...new Map([...(next ? previous : []), ...result.data.items].map(item => [item.id, item])).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setCursor(result.data.nextCursor);
    } catch (err) { setError(err instanceof Error ? err.message : 'Không tải được yêu cầu.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const update = async (order: Order, status: string) => {
    setBusy(order.id); setError('');
    try {
      await apiJson(`/api/storefront/staff/orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ status, expectedStatus: order.status }) });
      setOrders(previous => previous.map(item => item.id === order.id ? { ...item, status } : item));
    } catch (err) { setError(err instanceof Error ? err.message : 'Không cập nhật được yêu cầu.'); }
    finally { setBusy(''); }
  };
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-5"><div><h2 className="flex items-center gap-2 text-lg font-bold"><ShoppingBag className="h-5 w-5 text-orange-600" />Yêu cầu đặt mua từ website</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Chọn máy thực tế, xác nhận giá và giao nhận với khách, sau đó tạo đơn trong POS. Yêu cầu này chưa giữ kho, chưa thu tiền và chưa tạo doanh thu.</p></div><div className="flex gap-2"><a href="/cua-hang" target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"><ExternalLink size={15} />Mở website</a><button disabled={loading} onClick={() => void load()} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"><RefreshCw size={15} />Làm mới</button></div></div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {!orders.length && <div className="rounded-2xl border bg-white p-10 text-center text-sm text-zinc-500"><PackageCheck className="mx-auto mb-3 h-8 w-8" />{loading ? 'Đang tải yêu cầu…' : 'Chưa có yêu cầu từ website trong phạm vi chi nhánh của bạn.'}</div>}
    {orders.map(order => <article key={order.id} className="rounded-2xl border bg-white p-5">
      <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-bold">{order.code} <span className={`ml-2 rounded-full px-2 py-1 text-[10px] ${order.status === 'NEW' ? 'bg-orange-100 text-orange-800' : 'bg-zinc-100 text-zinc-600'}`}>{statuses[order.status] || order.status}</span></h3><p className="mt-2 text-xs text-zinc-500">{new Date(order.createdAt).toLocaleString('vi-VN')} · {order.branchName}</p></div><div className="text-sm"><b>{order.customerName}</b><a className="mt-1 flex items-center gap-1 text-sky-700" href={`tel:${order.customerPhone}`}><Phone size={14} />{order.customerPhone}</a></div></div>
      <div className="my-4 divide-y rounded-xl bg-zinc-50 px-3">{order.lines.map(line => <div key={line.productId} className="flex flex-wrap justify-between gap-2 py-3 text-xs"><div><b>{line.name}</b><p className="mt-1 text-zinc-500">Số lượng: {line.quantity} · {line.inStockAtRequest ? 'Có hàng khi gửi yêu cầu; kiểm tra lại trước khi chốt' : 'Cần tìm nguồn hàng'}</p></div><span>{line.unitPrice === null ? 'Cần báo giá' : `${line.unitPrice.toLocaleString('vi-VN')}đ`}</span></div>)}</div>
      <div className="flex flex-wrap justify-between gap-4"><div className="max-w-xl text-xs leading-6 text-zinc-600"><p>{order.fulfillment === 'DELIVERY' ? `Giao tận nơi: ${order.address}` : 'Nhận tại cửa hàng'}</p>{order.note && <p>Ghi chú: {order.note}</p>}<p>Tạm tính: <b>{order.hasUnpricedItems && order.estimatedTotal === 0 ? 'Chờ báo giá' : `${order.estimatedTotal.toLocaleString('vi-VN')}đ`}</b>{order.hasUnpricedItems && order.estimatedTotal > 0 && ' + sản phẩm cần báo giá'} · Chưa gồm phí giao</p></div>{!['CLOSED', 'CANCELLED'].includes(order.status) && <div className="flex flex-wrap items-end gap-2">{order.status === 'NEW' && <button disabled={!!busy} onClick={() => void update(order, 'CONTACTED')} className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white">Đánh dấu đã liên hệ</button>}{order.status === 'CONTACTED' && <button disabled={!!busy} onClick={() => void update(order, 'CLOSED')} className="rounded-lg border border-emerald-300 px-3 py-2 text-xs text-emerald-700">Hoàn tất xử lý</button>}<button disabled={!!busy} onClick={() => { if (window.confirm(`Hủy yêu cầu ${order.code}? Thao tác này không thay đổi kho hoặc thanh toán.`)) void update(order, 'CANCELLED'); }} className="rounded-lg border px-3 py-2 text-xs">Hủy yêu cầu</button></div>}</div>
    </article>)}
    {cursor && <button disabled={loading} onClick={() => void load(cursor)} className="mx-auto block rounded-xl border bg-white px-5 py-3 text-sm">{loading ? 'Đang tải…' : 'Tải thêm yêu cầu'}</button>}
  </section>;
}
