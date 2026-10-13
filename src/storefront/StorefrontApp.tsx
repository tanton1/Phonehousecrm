import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Cpu, Headphones, House, MapPin, Menu, MessageCircle, Minus, PackageCheck, Plus, RefreshCw, Search, Send, ShieldCheck, ShoppingBag, ShoppingCart, Smartphone, Sparkles, Store, Truck, UserRound, Wrench, X } from 'lucide-react';
import { normalizeStorefrontCart, STOREFRONT_KIND_NAMES } from '../../shared/storefront';
import type { StorefrontCartLine, StorefrontOrderReceipt, StorefrontPage, StorefrontProduct, StorefrontProductDetail } from '../../shared/storefront';
import { customerPublicBootstrap } from '../services/customerPortalApiClient';
import type { CustomerBootstrap, CustomerPromotion } from '../services/customerPortalApiClient';
import { askStorefrontAssistant, storefrontProduct, storefrontProducts, submitStorefrontOrder } from '../services/storefrontApiClient';
import './storefront.css';

const ROOT = '/cua-hang';
const CART_KEY = 'phonehouse.storefront.cart.v1';
const money = (price: number | null) => price === null ? 'Liên hệ báo giá' : `${price.toLocaleString('vi-VN')}đ`;
const productUrl = (product: StorefrontProduct) => `${ROOT}/san-pham/${encodeURIComponent(product.id)}`;
function safeReadCart() { try { return normalizeStorefrontCart(JSON.parse(localStorage.getItem(CART_KEY) || '[]')); } catch { return []; } }
function safeReadBranch() { try { return localStorage.getItem('phonehouse.storefront.branch') || ''; } catch { return ''; } }
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Chưa kết nối được cửa hàng. Vui lòng thử lại.';
const IconFor = ({ kind, ...props }: { kind: string; size?: number; className?: string }) => kind === 'DEVICE' ? <Smartphone {...props} /> : kind === 'PART' ? <Cpu {...props} /> : <Headphones {...props} />;

function ProductImage({ product, large = false }: { product: StorefrontProduct; large?: boolean }) {
  const [failed, setFailed] = useState<string[]>([]);
  const imageKey = JSON.stringify([product.imageUrl, product.images]);
  useEffect(() => setFailed([]), [imageKey]);
  const source = [...new Set([product.imageUrl, ...(product.images || [])])].find(url => url && !failed.includes(url));
  return <div className={`sf-product-image ${large ? 'sf-product-image-large' : ''}`}>
    {source ? <img src={source} alt={product.name} loading={large ? 'eager' : 'lazy'} onError={() => setFailed(values => [...values, source])} /> : <div className="sf-image-placeholder"><IconFor kind={product.kind} /><span>Ảnh đang cập nhật</span></div>}
  </div>;
}

function ProductGallery({ product }: { product: StorefrontProduct }) {
  const [selected, setSelected] = useState(''), [failed, setFailed] = useState<string[]>([]);
  const imageKey = JSON.stringify([product.id, product.imageUrl, product.images]);
  useEffect(() => { setSelected(''); setFailed([]); }, [imageKey]);
  const images = [...new Set([product.imageUrl, ...(product.images || [])])].filter((url): url is string => !!url && !failed.includes(url));
  const current = images.includes(selected) ? selected : images[0];
  return <>
    {current ? <div className="sf-product-image sf-product-image-large"><img src={current} alt={`${product.name} — ảnh ${images.indexOf(current) + 1}`} onError={() => setFailed(values => [...values, current])} /></div> : <ProductImage product={{ ...product, images: [], imageUrl: null }} large />}
    {images.length > 1 && <div className="sf-gallery-thumbs" aria-label="Thư viện ảnh sản phẩm">{images.map((url, index) => <button key={url} type="button" aria-label={`Xem ảnh ${index + 1} của ${product.name}`} aria-pressed={current === url} onClick={() => setSelected(url)}><img src={url} alt="" loading="lazy" onError={() => setFailed(values => [...values, url])} /></button>)}</div>}
    <p>{product.imageNote || 'Hình ảnh danh mục đang được cập nhật.'} {product.kind === 'DEVICE' ? 'Với máy đã qua sử dụng, cửa hàng gửi ảnh và tình trạng máy thực tế để bạn xác nhận.' : 'Nhân viên xác nhận phiên bản, phụ kiện đi kèm và khả năng tương thích trước khi mua.'}</p>
  </>;
}

function Modal({ title, children, close, wide = false }: { title: string; children: React.ReactNode; close: () => void; wide?: boolean }) {
  const root = useRef<HTMLDivElement>(null), heading = useId();
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab') return;
      const nodes = [...(root.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex="0"]') || [])].filter(node => node.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (!nodes.length) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', onKey); prior?.focus(); };
  }, []);
  return <div className="sf-overlay" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div className={`sf-modal ${wide ? 'sf-modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={heading} ref={root} tabIndex={-1}>
      <div className="sf-modal-heading"><h2 id={heading}>{title}</h2><button type="button" className="sf-icon-button" onClick={close} aria-label="Đóng"><X /></button></div>
      {children}
    </div>
  </div>;
}

const ProductCard: React.FC<{ product: StorefrontProduct; navigate: (url: string) => void; add: (id: string) => void }> = ({ product, navigate, add }) => {
  return <article className="sf-product-card">
    <a href={productUrl(product)} onClick={event => { event.preventDefault(); navigate(productUrl(product)); }}>
      <div className="sf-card-top"><span>{product.condition || STOREFRONT_KIND_NAMES[product.kind]}</span><ChevronRight size={15} /></div>
      <ProductImage product={product} />
      <div className="sf-spec-chips">{[product.storage, product.color].filter(Boolean).slice(0, 2).map(value => <span key={value}>{value}</span>)}</div>
      <h3>{product.name}</h3>
      <div className="sf-product-price">{product.priceIsStartingFrom && <small>Từ </small>}{money(product.price)}</div>
      <p className={`sf-availability ${product.inStock ? 'is-available' : ''}`}><span />{product.inStock ? 'Có hàng tại cửa hàng' : 'Liên hệ đặt hàng'}</p>
    </a>
    <div className="sf-card-bottom"><span>{product.warrantyMonths ? `Bảo hành ${product.warrantyMonths} tháng` : 'Tư vấn theo nhu cầu'}</span><button className="sf-icon-button" aria-label={`Thêm ${product.name} vào giỏ`} onClick={() => add(product.id)}><Plus size={19} /></button></div>
  </article>;
}

function Cart({ lines, setLines, branchId, setBranch, bootstrap, close }: { lines: StorefrontCartLine[]; setLines: (lines: StorefrontCartLine[]) => void; branchId: string; setBranch: (id: string) => void; bootstrap: CustomerBootstrap | null; close: () => void }) {
  const [products, setProducts] = useState<StorefrontProduct[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [revision, setRevision] = useState(0), [sending, setSending] = useState(false), [receipt, setReceipt] = useState<StorefrontOrderReceipt | null>(null);
  const [form, setForm] = useState({ customerName: '', customerPhone: '', fulfillment: 'PICKUP' as 'PICKUP' | 'DELIVERY', address: '', note: '', contactConsent: false, website: '' });
  const submission = useRef({ fingerprint: '', id: '' });
  const ids = lines.map(line => line.productId).join('|');
  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    Promise.allSettled(ids.split('|').filter(Boolean).map(id => storefrontProduct(id, branchId))).then(results => {
      if (!alive) return;
      setProducts(results.flatMap(result => result.status === 'fulfilled' ? [result.value.product] : []));
      if (results.some(result => result.status === 'rejected')) setError('Có sản phẩm không tải được hoặc đã ngừng kinh doanh. Hãy tải lại hoặc bỏ sản phẩm đó trước khi gửi.');
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [ids, branchId, revision]);
  const total = lines.reduce((sum, line) => sum + (products.find(item => item.id === line.productId)?.price || 0) * line.quantity, 0);
  const missingPrice = products.some(product => product.price === null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending || loading || products.length !== lines.length) return;
    const payload = { ...form, branchId, lines: lines.map(line => ({ ...line, expectedPrice: products.find(product => product.id === line.productId)!.price })) };
    const fingerprint = JSON.stringify(payload);
    if (submission.current.fingerprint !== fingerprint) submission.current = { fingerprint, id: crypto.randomUUID() };
    setSending(true); setError('');
    try {
      const result = await submitStorefrontOrder({ ...payload, idempotencyKey: submission.current.id });
      setReceipt(result); setLines([]);
    } catch (err) { setError(messageOf(err)); }
    finally { setSending(false); }
  };
  return <Modal title={receipt ? 'Đã nhận yêu cầu của bạn' : `Giỏ hàng (${lines.reduce((sum, line) => sum + line.quantity, 0)})`} close={() => { if (!sending) close(); }} wide>
    {receipt ? <div className="sf-order-success"><CheckCircle2 size={56} /><h3>{receipt.code}</h3><p>PhoneHouse sẽ liên hệ để xác nhận cấu hình, máy thực tế, giá và cách nhận hàng.</p><strong>{receipt.hasUnpricedItems && receipt.estimatedTotal === 0 ? 'Chờ cửa hàng báo giá' : `${money(receipt.estimatedTotal)}${receipt.hasUnpricedItems ? ' + sản phẩm cần báo giá' : ''}`}</strong><p>Đây là yêu cầu đặt mua. Chưa thu tiền và chưa giữ hàng.</p><button className="sf-primary" onClick={close}>Tiếp tục mua sắm</button></div> : !lines.length ? <div className="sf-empty"><ShoppingBag size={44} /><h3>Giỏ hàng chưa có sản phẩm</h3><p>Chọn cấu hình bạn thích, PhoneHouse sẽ tư vấn máy phù hợp.</p><button className="sf-primary" onClick={close}>Khám phá sản phẩm</button></div> : <form className="sf-checkout" onSubmit={submit}>
      <div className="sf-cart-items" aria-busy={loading}>{lines.map(line => {
        const product = products.find(item => item.id === line.productId);
        return <div className="sf-cart-item" key={line.productId}>
          {product && <ProductImage product={product} />}
          <div className="sf-cart-item-main"><h3>{product?.name || (loading ? 'Đang cập nhật sản phẩm…' : 'Sản phẩm không còn khả dụng')}</h3><strong>{loading ? 'Đang kiểm tra giá…' : money(product?.price ?? null)}</strong><p>{product && !product.inStock ? 'Cần liên hệ kiểm tra nguồn hàng' : 'Cửa hàng xác nhận máy thực tế trước khi giao'}</p>
            <div className="sf-quantity"><button type="button" aria-label={`Giảm số lượng ${product?.name || ''}`} disabled={sending || line.quantity <= 1} onClick={() => setLines(lines.map(item => item.productId === line.productId ? { ...item, quantity: item.quantity - 1 } : item))}><Minus size={15} /></button><span>{line.quantity}</span><button type="button" aria-label={`Tăng số lượng ${product?.name || ''}`} disabled={sending || line.quantity >= 10} onClick={() => setLines(lines.map(item => item.productId === line.productId ? { ...item, quantity: item.quantity + 1 } : item))}><Plus size={15} /></button><button type="button" className="sf-remove" disabled={sending} onClick={() => setLines(lines.filter(item => item.productId !== line.productId))}>Xóa</button></div>
          </div>
        </div>;
      })}<button type="button" className="sf-text-button" disabled={loading || sending} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} />Cập nhật giá và tồn kho</button></div>
      <fieldset disabled={sending} className="sf-checkout-fields"><legend>Thông tin nhận tư vấn</legend>
        <label>Chi nhánh phục vụ<select required value={branchId} onChange={event => setBranch(event.target.value)}><option value="">Chọn chi nhánh</option>{bootstrap?.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <div className="sf-form-row"><label>Họ và tên<input required minLength={2} maxLength={120} autoComplete="name" value={form.customerName} onChange={event => setForm({ ...form, customerName: event.target.value })} /></label><label>Số điện thoại<input required type="tel" autoComplete="tel" maxLength={16} value={form.customerPhone} onChange={event => setForm({ ...form, customerPhone: event.target.value })} placeholder="09xx xxx xxx" /></label></div>
        <div className="sf-delivery-options"><label><input type="radio" name="fulfillment" checked={form.fulfillment === 'PICKUP'} onChange={() => setForm({ ...form, fulfillment: 'PICKUP' })} /><Store size={18} />Nhận tại cửa hàng</label><label><input type="radio" name="fulfillment" checked={form.fulfillment === 'DELIVERY'} onChange={() => setForm({ ...form, fulfillment: 'DELIVERY' })} /><Truck size={18} />Giao tận nơi</label></div>
        {form.fulfillment === 'DELIVERY' && <label>Địa chỉ đầy đủ<input required minLength={12} maxLength={500} autoComplete="street-address" placeholder="Số nhà, đường, phường/xã, tỉnh/thành" value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} /></label>}
        <label>Ghi chú<textarea maxLength={1000} value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} placeholder="Màu sắc, tình trạng máy, thời gian tiện liên hệ…" /></label>
        <label className="sf-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={event => setForm({ ...form, website: event.target.value })} /></label>
        <label className="sf-consent"><input type="checkbox" required checked={form.contactConsent} onChange={event => setForm({ ...form, contactConsent: event.target.checked })} />Tôi đồng ý để PhoneHouse sử dụng thông tin trên để liên hệ xử lý yêu cầu này.</label>
      </fieldset>
      <div className="sf-cart-total"><span>Tạm tính</span><strong>{loading ? 'Đang cập nhật…' : total === 0 && missingPrice ? 'Chờ báo giá' : money(total)}</strong></div>
      {missingPrice && <p className="sf-notice">Chưa gồm sản phẩm cần báo giá.</p>}
      <p className="sf-checkout-note">Chưa bao gồm phí giao hàng. Cửa hàng xác nhận giá, tồn kho, phí vận chuyển và phương thức thanh toán trước khi bạn quyết định mua. Gửi yêu cầu không giữ hàng và không phát sinh thanh toán.</p>
      {error && <p className="sf-error" role="alert">{error}</p>}
      <button className="sf-primary sf-full" disabled={sending || loading || !branchId || products.length !== lines.length}>{sending ? 'Đang gửi yêu cầu…' : 'Gửi yêu cầu đặt mua'}</button>
    </form>}
  </Modal>;
}

function Assistant({ branchId, navigate, close }: { branchId: string; navigate: (url: string) => void; close: () => void }) {
  const [question, setQuestion] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [history, setHistory] = useState<{ question: string; reply: string; products: StorefrontProduct[]; handoff: boolean }[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { void bottom.current?.scrollIntoView({ block: 'nearest' }); }, [history, busy]);
  const ask = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy || !question.trim()) return;
    const content = question.trim(); setBusy(true); setError('');
    try { const result = await askStorefrontAssistant(content, branchId); setHistory(items => [...items, { question: content, ...result }].slice(-12)); setQuestion(''); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  };
  return <Modal title="Trợ lý mua sắm PhoneHouse" close={close}>
    <div className="sf-chat-intro"><Sparkles size={28} /><div><strong>Bạn nói nhu cầu, mình tìm sản phẩm.</strong><p>AI hiểu câu hỏi; giá và tình trạng lấy từ danh mục cửa hàng. Không tự chốt đơn hay thu tiền.</p></div></div>
    <div className="sf-chat-history" aria-live="polite">
      {!history.length && <div className="sf-chat-suggestions">{['iPhone 13 dưới 10 triệu', 'Tìm cáp sạc iPhone', 'Tôi muốn gặp nhân viên'].map(value => <button key={value} onClick={() => setQuestion(value)}>{value}<ArrowRight size={16} /></button>)}</div>}
      {history.map((item, index) => <div key={index}><div className="sf-chat-question">{item.question}</div><p className="sf-chat-answer">{item.reply}</p>{item.products.map(product => <button className="sf-chat-product" key={product.id} onClick={() => { close(); navigate(productUrl(product)); }}><ProductImage product={product} /><span><strong>{product.name}</strong><b>{money(product.price)}</b><small>{product.inStock ? 'Có hàng' : 'Liên hệ đặt hàng'}</small></span><ChevronRight size={18} /></button>)}{item.handoff && <a className="sf-text-button" href="/khach-hang?chat=1">Mở chat chăm sóc khách hàng <ArrowRight size={16} /></a>}</div>)}
      {busy && <p className="sf-muted">Đang tìm trong danh mục…</p>}<div ref={bottom} />
    </div>
    {error && <p className="sf-error" role="alert">{error}</p>}
    <form className="sf-chat-form" onSubmit={ask}><input aria-label="Câu hỏi cho trợ lý" maxLength={1000} value={question} onChange={event => setQuestion(event.target.value)} placeholder="Bạn cần máy nào, tầm giá bao nhiêu?" /><button className="sf-primary" disabled={busy || !question.trim()} aria-label="Gửi câu hỏi"><Send size={20} /></button></form>
    <a href="/khach-hang?chat=1" className="sf-chat-handoff">Cần người hỗ trợ? Đăng nhập OTP để gặp nhân viên.</a>
  </Modal>;
}

function ProductDetail({ id, branchId, bootstrap, navigate, add, openChat }: { id: string; branchId: string; bootstrap: CustomerBootstrap | null; navigate: (url: string) => void; add: (id: string) => void; openChat: () => void }) {
  const [data, setData] = useState<StorefrontProductDetail | null>(null), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true; setData(null); setError('');
    storefrontProduct(id, branchId).then(result => { if (alive) setData(result); }).catch(err => { if (alive) setError(messageOf(err)); });
    return () => { alive = false; };
  }, [id, branchId, revision]);
  useEffect(() => { if (data) document.title = `${data.product.name} | PhoneHouse`; }, [data]);
  if (error) return <div className="sf-empty"><CircleHelp size={36} /><h2>Chưa tải được sản phẩm</h2><p>{error}</p><button className="sf-secondary" onClick={() => setRevision(value => value + 1)}>Thử lại</button></div>;
  if (!data) return <div className="sf-detail-loading" role="status">Đang cập nhật cấu hình, giá và tồn kho…</div>;
  const { product, variants } = data;
  return <>
    <div className="sf-breadcrumb"><a href={ROOT} onClick={event => { event.preventDefault(); navigate(ROOT); }}>Trang chủ</a><ChevronRight size={14} /><a href={`${ROOT}?kind=${product.kind}`} onClick={event => { event.preventDefault(); navigate(`${ROOT}?kind=${product.kind}`); }}>{STOREFRONT_KIND_NAMES[product.kind]}</a><ChevronRight size={14} /><span>{product.name}</span></div>
    <section className="sf-detail"><div className="sf-detail-title"><h1>{product.name}</h1><span>Mã sản phẩm: {product.sku}</span><button className="sf-text-button" onClick={() => setRevision(value => value + 1)}><RefreshCw size={14} />Cập nhật thông tin</button></div>
      <div className="sf-detail-grid"><div className="sf-detail-gallery"><ProductGallery product={product} /><div className="sf-detail-assurance"><span><ShieldCheck />Thông tin rõ ràng</span><span><PackageCheck />Kiểm tra trước khi chốt</span><span><Headphones />Hỗ trợ sau mua</span></div></div>
        <div className="sf-detail-buy"><div className="sf-detail-price"><span>Giá tham khảo {branchId ? 'tại chi nhánh đã chọn' : 'trong hệ thống'}</span><strong>{product.priceIsStartingFrom && 'Từ '}{money(product.price)}</strong><p className={`sf-availability ${product.inStock ? 'is-available' : ''}`}><span />{product.inStock ? 'Có hàng — cửa hàng xác nhận máy cụ thể' : 'Chưa có hàng — có thể gửi yêu cầu tìm hàng'}</p></div>
          {variants.length > 1 && <label className="sf-variant-label">Chọn cấu hình ({variants.length})<select aria-label="Chọn cấu hình sản phẩm" value={product.id} onChange={event => navigate(`${ROOT}/san-pham/${encodeURIComponent(event.target.value)}`)}>{variants.map(item => <option key={item.id} value={item.id}>{item.name} — {money(item.price)}</option>)}</select></label>}
          <dl className="sf-spec-table">{[['Thương hiệu', product.brand], ['Model', product.model], ['Dung lượng', product.storage], ['Màu sắc', product.color], ['Tình trạng', product.condition], ['Phiên bản', product.region], ['Bảo hành', product.warrantyMonths ? `${product.warrantyMonths} tháng` : 'Nhân viên xác nhận theo sản phẩm']].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <button className="sf-primary sf-full sf-buy-button" onClick={() => add(product.id)}><ShoppingCart size={21} />{product.inStock && product.price !== null ? 'Thêm vào giỏ hàng' : 'Thêm vào yêu cầu tư vấn'}</button><button className="sf-secondary sf-full" onClick={openChat}><MessageCircle size={19} />Hỏi trợ lý mua sắm</button>
          {product.availableBranchIds.length > 0 && <details className="sf-stock-details"><summary><MapPin size={17} />Cửa hàng có sản phẩm ({product.availableBranchIds.length})</summary>{bootstrap?.branches.filter(branch => product.availableBranchIds.includes(branch.id)).map(branch => <div key={branch.id}><strong>{branch.name}</strong><p>{branch.address}</p>{branch.phone && <a href={`tel:${branch.phone}`}>{branch.phone}</a>}</div>)}</details>}
        </div></div>
    </section>
    <div className="sf-product-information">
      <section className="sf-panel sf-description"><h2>Thông tin sản phẩm</h2>{!!product.highlights?.length && <ul className="sf-product-highlights">{product.highlights.map(value => <li key={value}><CheckCircle2 size={17} /><span>{value}</span></li>)}</ul>}<p>{product.description || 'Bạn cần biết thêm về cấu hình, phụ kiện đi kèm hoặc tình trạng máy? Hãy gửi yêu cầu, nhân viên PhoneHouse sẽ kiểm tra và tư vấn thông tin chính xác của sản phẩm.'}</p></section>
      <section className="sf-panel sf-technical-specs"><h2>Thông số & tương thích</h2>{product.specifications?.length ? <dl>{product.specifications.map(spec => <div key={spec.label}><dt>{spec.label}</dt><dd>{spec.value}</dd></div>)}</dl> : <p>Thông số chi tiết chưa được cập nhật. Hãy hỏi cửa hàng trước khi chọn mua.</p>}{!!product.compatibleModels?.length && <div className="sf-compatible-models"><h3>Model đã khai báo tương thích</h3><div>{product.compatibleModels.map(value => <span key={value}>{value}</span>)}</div></div>}</section>
    </div>
    {product.kind === 'DEVICE' && <section className="sf-related-products"><div className="sf-section-heading"><div><h2>Phụ kiện tương thích</h2><p>Ghép theo model đã được cửa hàng khai báo; giá và tồn kho theo chi nhánh đang chọn.</p></div><a className="sf-text-button" href={`${ROOT}?kind=ACCESSORY`} onClick={event => { event.preventDefault(); navigate(`${ROOT}?kind=ACCESSORY`); }}>Xem tất cả phụ kiện<ChevronRight size={16} /></a></div>{data.relatedAccessories?.length ? <div className="sf-product-grid">{data.relatedAccessories.map(item => <ProductCard key={item.id} product={item} navigate={navigate} add={add} />)}</div> : <p className="sf-related-empty">Chưa có phụ kiện được xác nhận tương thích với model này. Bạn có thể hỏi nhân viên để được kiểm tra.</p>}</section>}
    {!!data.compatibleDevices?.length && <section className="sf-related-products"><div className="sf-section-heading"><div><h2>Thiết bị tương thích</h2><p>Một số cấu hình trong danh mục phù hợp với danh sách model được khai báo.</p></div></div><div className="sf-product-grid">{data.compatibleDevices.map(item => <ProductCard key={item.id} product={item} navigate={navigate} add={add} />)}</div></section>}
  </>;
}

export default function StorefrontApp() {
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);
  const navigate = useCallback((url: string) => { window.history.pushState(null, '', url); setLocation(window.location.pathname + window.location.search); window.scrollTo({ top: 0 }); }, []);
  useEffect(() => { const onPop = () => setLocation(window.location.pathname + window.location.search); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, []);
  const params = new URLSearchParams(location.split('?')[1] || '');
  const productId = location.split('?')[0].startsWith(`${ROOT}/san-pham/`) ? decodeURIComponent(location.split('?')[0].slice(`${ROOT}/san-pham/`.length)) : '';
  const kind = params.get('kind') || '', query = params.get('q') || '', brand = params.get('brand') || '', price = params.get('price') || '', onlyStock = params.get('stock') === '1', sort = params.get('sort') || 'name';
  const [search, setSearch] = useState(query), [branchId, setBranchId] = useState(safeReadBranch);
  const [bootstrap, setBootstrap] = useState<CustomerBootstrap | null>(null), [page, setPage] = useState<StorefrontPage | null>(null), [loading, setLoading] = useState(true), [moreLoading, setMoreLoading] = useState(false), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  const [cart, setCart] = useState<StorefrontCartLine[]>(safeReadCart), [cartOpen, setCartOpen] = useState(false), [chatOpen, setChatOpen] = useState(false), [branchesOpen, setBranchesOpen] = useState(false), [menuOpen, setMenuOpen] = useState(false), [promotion, setPromotion] = useState<CustomerPromotion | null>(null), [notice, setNotice] = useState('');
  const catalogueEpoch = useRef(0);
  useEffect(() => { document.title = 'PhoneHouse | Điện thoại, phụ kiện & chăm sóc thiết bị'; }, [location]);
  useEffect(() => { setSearch(query); setMenuOpen(false); }, [query, location]);
  useEffect(() => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* Shopping remains usable without storage. */ } }, [cart]);
  useEffect(() => { try { localStorage.setItem('phonehouse.storefront.branch', branchId); } catch { /* Optional preference only. */ } }, [branchId]);
  useEffect(() => { if (bootstrap && branchId && !bootstrap.branches.some(branch => branch.id === branchId)) setBranchId(''); }, [bootstrap, branchId]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 3500); return () => window.clearTimeout(timer); }, [notice]);
  useEffect(() => {
    let alive = true;
    customerPublicBootstrap().then(result => { if (alive) setBootstrap(result.data); }).catch(() => { /* Catalogue has its own recoverable error state. */ });
    return () => { alive = false; };
  }, [revision]);
  const apiQuery = { branchId, search: query, kind, brand, sort, inStock: String(onlyStock), ...(price === 'under5' ? { maxPrice: '5000000' } : price === '5to10' ? { minPrice: '5000000', maxPrice: '10000000' } : price === '10to20' ? { minPrice: '10000000', maxPrice: '20000000' } : price === 'over20' ? { minPrice: '20000000' } : {}), limit: '24' };
  const queryKey = JSON.stringify(apiQuery);
  const catalogueQuery = useRef(queryKey);
  useEffect(() => {
    const epoch = ++catalogueEpoch.current;
    let alive = true;
    setLoading(true); setError(''); setMoreLoading(false);
    if (catalogueQuery.current !== queryKey) { setPage(null); catalogueQuery.current = queryKey; }
    storefrontProducts(JSON.parse(queryKey)).then(result => { if (alive && epoch === catalogueEpoch.current) setPage(result); }).catch(err => { if (alive) setError(messageOf(err)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [queryKey, revision]);
  const loadedProductCount = page?.items.length || 0;
  useEffect(() => {
    // Keep the customer's expanded list and open dialogs stable. The cart always rechecks prices.
    const refresh = () => { if (document.visibilityState === 'visible' && !cartOpen && !chatOpen && !branchesOpen && !promotion && !productId && !moreLoading && loadedProductCount <= 24) setRevision(value => value + 1); };
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, [cartOpen, chatOpen, branchesOpen, promotion, productId, moreLoading, loadedProductCount]);
  const filter = (updates: Record<string, string>) => {
    const next = new URLSearchParams(location.includes('?') ? location.split('?')[1] : '');
    Object.entries(updates).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key); });
    navigate(`${ROOT}${next.size ? `?${next}` : ''}`);
  };
  const add = (id: string) => {
    if (!cart.some(line => line.productId === id) && cart.length >= 20) { setNotice('Mỗi yêu cầu tối đa 20 sản phẩm'); return; }
    if ((cart.find(line => line.productId === id)?.quantity || 0) >= 10) { setNotice('Mỗi sản phẩm tối đa 10 chiếc'); return; }
    setCart(items => normalizeStorefrontCart([...items, { productId: id, quantity: 1 }]));
    setNotice('Đã thêm vào giỏ hàng');
  };
  const loadMore = async () => {
    if (!page?.nextCursor || moreLoading) return;
    const epoch = catalogueEpoch.current; setMoreLoading(true);
    try { const result = await storefrontProducts({ ...apiQuery, cursor: page.nextCursor }); if (epoch === catalogueEpoch.current) setPage(previous => previous ? { ...result, items: [...new Map([...previous.items, ...result.items].map(item => [item.id, item])).values()] } : result); }
    catch (err) { if (epoch === catalogueEpoch.current) setError(messageOf(err)); }
    finally { if (epoch === catalogueEpoch.current) setMoreLoading(false); }
  };
  const filtered = Boolean(kind || query || brand || price || onlyStock || params.get('sort'));
  const activeBranch = bootstrap?.branches.find(branch => branch.id === branchId);
  const categoryName = STOREFRONT_KIND_NAMES[kind as keyof typeof STOREFRONT_KIND_NAMES] || 'Tất cả sản phẩm';
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  const featuredPromotion = bootstrap?.promotions.find(item => item.bannerUrl && (!branchId || item.allBranches || item.branchIds.includes(branchId)));
  return <div className="sf-app">
    <a className="sf-skip-link" href="#sf-main">Đến nội dung chính</a>
    <header className="sf-header"><div className="sf-container sf-header-main">
      <a className="sf-logo" href={ROOT} onClick={event => { event.preventDefault(); navigate(ROOT); }} aria-label="PhoneHouse trang chủ"><span className="sf-logo-icon"><House size={28} strokeWidth={2.8} /></span><span>Phone<span>House</span><small>Điện thoại & hơn thế nữa</small></span></a>
      <button className="sf-category-button" aria-label="Danh mục sản phẩm" onClick={() => setMenuOpen(value => !value)} aria-expanded={menuOpen}><Menu size={21} /><span>Danh mục</span></button>
      <div className="sf-header-search"><form onSubmit={event => { event.preventDefault(); filter({ q: search.trim() }); }} role="search"><input aria-label="Tìm sản phẩm" placeholder="Nhập tên điện thoại, phụ kiện… cần tìm" value={search} onChange={event => setSearch(event.target.value)} maxLength={150} /><button aria-label="Tìm kiếm"><Search size={23} /></button></form><div className="sf-search-trends">{['iPhone', 'iPhone 15', 'iPhone 14', 'iPhone 13', 'Sạc', 'Tai nghe'].map(term => <button key={term} onClick={() => filter({ q: term, kind: '', brand: '' })}>{term}</button>)}</div></div>
      <a className="sf-account-button" href="/khach-hang/tai-khoan" aria-label="Đăng nhập và tài khoản khách hàng"><UserRound size={23} /></a><button className="sf-header-cart" onClick={() => setCartOpen(true)} aria-label={`Giỏ hàng, ${count} sản phẩm`}><ShoppingCart size={21} /><span>Giỏ hàng</span>{count > 0 && <b>{count}</b>}</button>
    </div>
    {menuOpen && <div className="sf-menu"><div className="sf-container sf-menu-inner">{Object.entries(STOREFRONT_KIND_NAMES).map(([id, name]) => <button key={id} onClick={() => navigate(`${ROOT}?kind=${id}`)}><IconFor kind={id} size={27} /><span>{name}</span><ChevronRight size={17} /></button>)}<a href="/khach-hang/bao-gia"><Wrench size={27} />Dịch vụ sửa chữa<ChevronRight size={17} /></a><button onClick={() => { setMenuOpen(false); setChatOpen(true); }}><Sparkles size={27} />Trợ lý mua sắm<ChevronRight size={17} /></button></div></div>}
    </header>
    <div className="sf-subnav"><div className="sf-container"><a href="/khach-hang"><ShieldCheck size={18} />Chăm sóc thiết bị trọn vòng đời</a><button onClick={() => setChatOpen(true)}><Sparkles size={18} />Tìm máy theo nhu cầu cùng AI</button><button className="sf-location-button" onClick={() => setBranchesOpen(true)}><MapPin size={18} /><span>{activeBranch?.name || 'Chọn cửa hàng gần bạn'}</span><ChevronDown size={15} /></button></div></div>
    <main id="sf-main" className="sf-container sf-main">
      {productId ? <ProductDetail id={productId} branchId={branchId} bootstrap={bootstrap} navigate={navigate} add={add} openChat={() => setChatOpen(true)} /> : <>
        {!filtered && <>
          <section className="sf-shortcuts" aria-label="Dịch vụ PhoneHouse">
            {[{ icon: Smartphone, title: 'Chọn điện thoại', detail: 'Đủ cấu hình, dễ lựa chọn', action: () => navigate(`${ROOT}?kind=DEVICE`), color: 'coral' }, { icon: Headphones, title: 'Phụ kiện mỗi ngày', detail: 'Kết nối theo cách của bạn', action: () => navigate(`${ROOT}?kind=ACCESSORY`), color: 'blue' }, { icon: ShieldCheck, title: 'PhoneHouse Care', detail: 'Tra cứu máy & bảo hành', action: () => window.location.assign('/khach-hang/thiet-bi'), color: 'green' }, { icon: Wrench, title: 'Dịch vụ sửa chữa', detail: 'Theo dõi ngay trên web', action: () => window.location.assign('/khach-hang/bao-gia'), color: 'violet' }, { icon: Sparkles, title: 'Trợ lý mua sắm AI', detail: 'Nói nhu cầu, tìm đúng máy', action: () => setChatOpen(true), color: 'amber' }].map(item => <button key={item.title} onClick={item.action}><span className={`sf-shortcut-art ${item.color}`}><item.icon size={38} strokeWidth={1.7} /></span><strong>{item.title}</strong><small>{item.detail}</small></button>)}
          </section>
          <section className="sf-hero-grid" aria-label="Khám phá PhoneHouse">
            {featuredPromotion ? <button className="sf-promotion-hero" onClick={() => setPromotion(featuredPromotion)}><img src={featuredPromotion.bannerUrl!} alt={featuredPromotion.title} /><span>{featuredPromotion.title}<ChevronRight size={20} /></span></button> : <div className="sf-hero sf-hero-red"><div className="sf-hero-copy"><span className="sf-hero-brand">PhoneHouse</span><h1>Máy bạn thích.<br />Giá bạn chọn.</h1><p>Tìm chiếc điện thoại hợp với bạn<br />trong toàn bộ danh mục cửa hàng.</p><button onClick={() => navigate(`${ROOT}?kind=DEVICE`)}>Khám phá ngay<ArrowRight size={17} /></button></div><div className="sf-phone-art" aria-hidden="true"><div className="sf-phone-back"><div className="sf-camera"><i /><i /><i /><b /></div><House /></div><div className="sf-phone-front"><span /><div /><small>PhoneHouse</small></div><div className="sf-phone-plinth" /></div></div>}
            <div className="sf-hero sf-hero-blue"><div className="sf-hero-copy"><span className="sf-hero-brand">Chọn dễ hơn cùng AI</span><h2>Hiểu nhu cầu.<br />Tìm đúng lựa chọn.</h2><p>Chỉ cần nói dòng máy và ngân sách.<br />Mình tìm trong danh mục cho bạn.</p><button onClick={() => setChatOpen(true)}>Hỏi trợ lý ngay<Sparkles size={17} /></button></div><div className="sf-ai-art" aria-hidden="true"><div className="sf-ai-orb"><Sparkles size={57} /></div><span>“iPhone 13 dưới 10 triệu”</span><div className="sf-ai-result"><CheckCircle2 size={21} /><div>Giá từ hệ thống<small>Kiểm tra tình trạng thực tế</small></div></div></div></div>
          </section>
          <section className="sf-panel sf-categories"><h2>Danh mục nổi bật</h2><div>{(page?.facets.kinds || Object.entries(STOREFRONT_KIND_NAMES).map(([id, name]) => ({ id, name, count: null }))).map(item => <button key={item.id} onClick={() => navigate(`${ROOT}?kind=${item.id}`)}><span className={`sf-category-art sf-category-${item.id.toLowerCase()}`}><IconFor kind={item.id} size={38} /></span><span><strong>{item.name}</strong><small>{item.count !== null ? `${item.count} cấu hình trong danh mục` : 'Khám phá danh mục'}</small></span><ChevronRight size={18} /></button>)}<a href="/khach-hang/bao-gia"><span className="sf-category-art sf-category-service"><Wrench size={35} /></span><span><strong>Sửa chữa</strong><small>Tra cứu và yêu cầu dịch vụ</small></span><ChevronRight size={18} /></a></div></section>
        </>}
        <section className={`sf-catalog-section ${filtered ? '' : 'sf-catalog-featured'}`}>
          <div className="sf-section-heading"><div>{filtered && <div className="sf-breadcrumb"><button onClick={() => navigate(ROOT)}>Trang chủ</button><ChevronRight size={14} /><span>{categoryName}</span></div>}<h2>{query ? `Kết quả cho “${query}”` : filtered ? categoryName : 'Sắm công nghệ · Chọn theo bạn'}</h2><p>{filtered ? 'Tìm sản phẩm theo nhu cầu của bạn' : 'Toàn bộ danh mục. Cập nhật cùng hệ thống cửa hàng.'}</p></div>{!filtered && <span className="sf-live-label"><span />Liên kết tồn kho</span>}</div>
          <div className="sf-filter-bar"><div className="sf-kind-tabs"><button className={!kind ? 'active' : ''} onClick={() => filter({ kind: '', brand: '' })}>Tất cả</button>{Object.entries(STOREFRONT_KIND_NAMES).map(([id, label]) => <button className={kind === id ? 'active' : ''} key={id} onClick={() => filter({ kind: id, brand: '' })}>{label}</button>)}</div>
            <div className="sf-filter-controls"><label className="sf-select-label"><span>Thương hiệu</span><select aria-label="Lọc thương hiệu" value={brand} onChange={event => filter({ brand: event.target.value })}><option value="">Tất cả thương hiệu</option>{page?.facets.brands.map(value => <option key={value}>{value}</option>)}</select></label><label className="sf-select-label"><span>Mức giá</span><select aria-label="Lọc mức giá" value={price} onChange={event => filter({ price: event.target.value })}><option value="">Tất cả mức giá</option><option value="under5">Dưới 5 triệu</option><option value="5to10">5 – 10 triệu</option><option value="10to20">10 – 20 triệu</option><option value="over20">Trên 20 triệu</option></select></label><label className="sf-stock-toggle"><input type="checkbox" checked={onlyStock} onChange={event => filter({ stock: event.target.checked ? '1' : '' })} />Chỉ xem có hàng</label><label className="sf-sort-label">Sắp xếp<select aria-label="Sắp xếp sản phẩm" value={sort} onChange={event => filter({ sort: event.target.value })}><option value="name">Tên sản phẩm</option><option value="price-asc">Giá thấp đến cao</option><option value="price-desc">Giá cao đến thấp</option></select></label></div>
          </div>
          <div className="sf-catalog-summary"><span>{loading ? 'Đang tải danh mục…' : `${page?.total || 0} cấu hình${activeBranch ? ` tại ${activeBranch.name}` : ''}`}</span><button className="sf-text-button" onClick={() => setRevision(value => value + 1)} disabled={loading}><RefreshCw size={14} />Làm mới</button></div>
          {error && <div className="sf-error" role="alert"><p>{error}</p><button onClick={() => setRevision(value => value + 1)}>Thử lại</button></div>}
          {loading && !page ? <div className="sf-product-grid" aria-label="Đang tải sản phẩm">{Array.from({ length: 5 }, (_, index) => <div key={index} className="sf-skeleton"><div /><span /><span /></div>)}</div> : <div className="sf-product-grid">{page?.items.map(product => <ProductCard key={product.id} product={product} navigate={navigate} add={add} />)}</div>}
          {!loading && !error && !page?.items.length && <div className="sf-empty"><Search size={38} /><h3>{filtered ? 'Chưa có sản phẩm phù hợp' : 'Danh mục đang được cập nhật'}</h3><p>{filtered ? 'Thử tên model ngắn hơn hoặc bỏ bớt bộ lọc.' : 'Sản phẩm sẽ xuất hiện khi danh mục trong hệ thống được kích hoạt.'}</p>{filtered && <button className="sf-secondary" onClick={() => navigate(ROOT)}>Xem toàn bộ danh mục</button>}</div>}
          {page?.nextCursor && <button className="sf-load-more" disabled={loading || moreLoading} onClick={() => void loadMore()}>{moreLoading ? 'Đang tải…' : `Xem thêm sản phẩm (${page.items.length}/${page.total})`}<ChevronDown size={17} /></button>}
          <p className="sf-catalog-footnote">Sản phẩm hết hàng hoặc chưa có giá vẫn nằm trong danh mục. Giá và hàng thực tế được cửa hàng xác nhận trước khi mua.</p>
        </section>
        {!filtered && <>
          <section className="sf-service-band"><div><Wrench size={38} /><span><h2>Mua máy là khởi đầu.<br />Chăm sóc mới là dài lâu.</h2><p>Thiết bị, bảo hành, phiếu sửa chữa — xem ngay trong tài khoản của bạn.</p></span></div><a href="/khach-hang">Khám phá PhoneHouse Care<ArrowRight size={18} /></a></section>
          {!!bootstrap?.promotions.length && <section className="sf-news"><div className="sf-section-heading"><h2>Ưu đãi & tin từ PhoneHouse</h2><a href="/khach-hang/uu-dai">Xem tất cả<ChevronRight size={17} /></a></div><div className="sf-news-grid">{bootstrap.promotions.filter(item => !branchId || item.allBranches || item.branchIds.includes(branchId)).slice(0, 3).map(item => <button key={item.id} onClick={() => setPromotion(item)}>{item.bannerUrl ? <img src={item.bannerUrl} alt={item.title} loading="lazy" /> : <div className="sf-news-placeholder"><ShoppingBag size={40} /></div>}<h3>{item.title}</h3><p>{item.summary}</p><span>Xem chi tiết<ArrowRight size={15} /></span></button>)}</div></section>}
        </>}
      </>}
    </main>
    <section className="sf-trust-strip"><div className="sf-container">{[{ icon: Store, title: 'Kết nối cửa hàng', text: 'Chọn nơi phục vụ gần bạn' }, { icon: ShieldCheck, title: 'Thông tin minh bạch', text: 'Xác nhận tình trạng trước khi mua' }, { icon: Truck, title: 'Linh hoạt nhận hàng', text: 'Tại cửa hàng hoặc giao tận nơi' }, { icon: Headphones, title: 'Đồng hành sau mua', text: 'Theo dõi bảo hành và sửa chữa' }].map(item => <div key={item.title}><item.icon size={31} /><span><strong>{item.title}</strong><small>{item.text}</small></span></div>)}</div></section>
    <footer className="sf-footer"><div className="sf-container"><div className="sf-store-directory"><div><h2>Hệ thống cửa hàng PhoneHouse</h2><p>Ghé cửa hàng để trải nghiệm và nhận tư vấn trực tiếp.</p></div><button className="sf-secondary" onClick={() => setBranchesOpen(true)}>Xem danh sách cửa hàng<MapPin size={17} /></button></div><div className="sf-footer-grid"><div><div className="sf-footer-brand">PhoneHouse<span>Điện thoại & hơn thế nữa</span></div><p>{bootstrap?.brand.slogan || 'An tâm mua sắm. Tận tâm hậu mãi.'}</p><button className="sf-text-button" onClick={() => setChatOpen(true)}><MessageCircle size={18} />Chat với PhoneHouse</button></div><div><h3>Tư vấn & hỗ trợ</h3>{bootstrap?.brand.hotline && <a className="sf-hotline" href={`tel:${bootstrap.brand.hotline}`}>{bootstrap.brand.hotline}</a>}{bootstrap?.brand.supportEmail && <a href={`mailto:${bootstrap.brand.supportEmail}`}>{bootstrap.brand.supportEmail}</a>}<a href="/khach-hang?chat=1">Gặp nhân viên chăm sóc khách hàng</a><button onClick={() => setBranchesOpen(true)}>Địa chỉ & giờ mở cửa</button></div><div><h3>Khám phá PhoneHouse</h3><a href={`${ROOT}?kind=DEVICE`}>Điện thoại</a><a href={`${ROOT}?kind=ACCESSORY`}>Phụ kiện</a><a href={`${ROOT}?kind=PART`}>Linh kiện</a><a href="/khach-hang/uu-dai">Ưu đãi & bài viết</a></div><div><h3>Dành cho khách hàng</h3><a href="/khach-hang/tai-khoan">Tài khoản của tôi</a><a href="/khach-hang/thiet-bi">Thiết bị & bảo hành</a><a href="/khach-hang/sua-chua">Theo dõi sửa chữa</a><a href="/khach-hang/bao-gia">Báo giá dịch vụ</a><button onClick={() => setCartOpen(true)}>Hướng dẫn đặt mua</button></div></div><div className="sf-footer-bottom"><span>© {new Date().getFullYear()} PhoneHouse</span><span>Giá, tình trạng máy và điều kiện mua được xác nhận tại thời điểm xử lý yêu cầu.</span></div></div></footer>
    <button className="sf-floating-chat" aria-label="Tư vấn mua sắm AI" onClick={() => setChatOpen(true)}><MessageCircle size={23} /><span>Tư vấn mua sắm</span><span className="sf-ai-tag">AI</span></button>
    <nav className="sf-mobile-nav" aria-label="Điều hướng nhanh"><button onClick={() => navigate(ROOT)}><House size={21} />Trang chủ</button><button onClick={() => setMenuOpen(value => !value)}><Menu size={21} />Danh mục</button><button onClick={() => setCartOpen(true)}><ShoppingBag size={21} />Giỏ hàng {count || ''}</button><a href="/khach-hang/tai-khoan"><UserRound size={21} />Tài khoản</a></nav>
    {notice && <div className="sf-toast" role="status"><CheckCircle2 size={19} />{notice}<button onClick={() => { setNotice(''); setCartOpen(true); }}>Xem giỏ</button></div>}
    {cartOpen && <Cart lines={cart} setLines={setCart} branchId={branchId} setBranch={setBranchId} bootstrap={bootstrap} close={() => setCartOpen(false)} />}
    {chatOpen && <Assistant branchId={branchId} navigate={navigate} close={() => setChatOpen(false)} />}
    {branchesOpen && <Modal title="Chọn cửa hàng phục vụ" close={() => setBranchesOpen(false)}><div className="sf-branches"><button className={!branchId ? 'selected' : ''} onClick={() => { setBranchId(''); setBranchesOpen(false); }}><Store /><span><strong>Tất cả cửa hàng</strong><small>Xem danh mục toàn hệ thống</small></span>{!branchId && <Check size={18} />}</button>{bootstrap?.branches.map(branch => <button key={branch.id} className={branchId === branch.id ? 'selected' : ''} onClick={() => { setBranchId(branch.id); setBranchesOpen(false); }}><MapPin /><span><strong>{branch.name}</strong><small>{branch.address}</small><small>{[branch.openingHours, branch.phone].filter(Boolean).join(' · ')}</small></span>{branchId === branch.id && <Check size={18} />}</button>)}{!bootstrap && <p className="sf-error">Chưa tải được chi nhánh. <button onClick={() => setRevision(value => value + 1)}>Thử lại</button></p>}</div></Modal>}
    {promotion && <Modal title={promotion.title} close={() => setPromotion(null)}>{promotion.bannerUrl && <img className="sf-promotion-image" src={promotion.bannerUrl} alt={promotion.title} />}<div className="sf-promotion-content"><p>{promotion.summary}</p><p>{promotion.details}</p>{promotion.conditions.length > 0 && <ul>{promotion.conditions.map(value => <li key={value}>{value}</li>)}</ul>}{promotion.voucherCode && <strong>Mã ưu đãi: {promotion.voucherCode}</strong>}<a className="sf-primary" href={`/khach-hang/uu-dai?promotion=${encodeURIComponent(promotion.id)}`}>Xem trong cổng khách hàng<ArrowRight size={17} /></a></div></Modal>}
  </div>;
}
