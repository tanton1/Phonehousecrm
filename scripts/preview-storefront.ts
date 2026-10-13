/** Local visual QA, synthetic data only. Never imported into the production server. */
import express from 'express';
import { createServer } from 'vite';
import { createStorefrontRouter } from '../server/routes/storefront';
import { storefrontMemoryDb } from '../tests/helpers/storefrontMemoryDb';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw new Error('Local preview only');
const catalogItems = Object.fromEntries(Array.from({ length: 32 }, (_, index) => {
  const id = `QA_${index.toString().padStart(3, '0')}`;
  const accessory = index >= 24, part = index >= 29;
  const model = `iPhone ${12 + index % 4}${index % 3 === 0 ? ' Pro Max' : ''}`;
  const color = ['Xanh', 'Đen', 'Trắng'][index % 3];
  return [id, { sku: `TEST-${index}`, name: part ? `Màn hình ${model}` : accessory ? `Cáp sạc USB-C ${index - 23}m` : `${model} ${index % 2 ? '256GB' : '128GB'} ${color}`, category: part ? 'PART' : accessory ? 'ACCESSORY' : 'DEVICE', brand: 'Apple', model, modelId: model.replaceAll(' ', '_'), storage: accessory ? '' : index % 2 ? '256GB' : '128GB', color: accessory ? '' : color, condition: accessory ? '' : '99%', defaultRetailPrice: index % 9 === 0 ? 0 : accessory ? 150000 + (index - 23) * 100000 : 7900000 + index * 500000, status: 'active', warrantyPeriodMonths: 6 }];
}));
for (const item of Object.values(catalogItems)) {
  if (item.category !== 'DEVICE') Object.assign(item, {
    imageUrl: '/__preview/media/cable.svg',
    publicDescription: 'Nội dung phụ kiện giả lập để kiểm thử đồng bộ. Chưa phải thông tin sản phẩm đang bán.',
    compatibleModelIds: ['iPhone_14'], compatibleModels: ['iPhone 14'],
    publicSpecifications: [{ label: 'Nguồn dữ liệu', value: 'Bản xem trước giả lập' }]
  });
}
const catalogModels = Object.fromEntries(Object.values(catalogItems).filter(item => item.category === 'DEVICE').map(item => [item.modelId, {
  modelName: item.model, brandName: 'Apple', modelCode: item.modelId, active: true,
  imageUrl: '/__preview/media/phone-front.svg', imageUrls: ['/__preview/media/phone-back.svg'],
  publicDescription: `Nội dung mẫu của ${item.model}, được kế thừa từ bản ghi Model. Khi kết nối hệ thống thật, ảnh và thông tin đã được duyệt trong CRM sẽ xuất hiện tại đây. Đây là dữ liệu kiểm thử, không phải mô tả bán hàng.`,
  publicHighlights: ['Kế thừa thông tin từ Model trong CRM', 'Ảnh minh họa kiểm thử, không phải ảnh máy thực tế'],
  publicSpecifications: [{ label: 'Model', value: item.model }, { label: 'Nguồn nội dung', value: 'Dữ liệu giả lập để kiểm thử' }]
}]));
const memory = storefrontMemoryDb({
  catalogItems, catalogModels,
  branches: { QA_DN: { name: 'Đà Nẵng · Kiểm thử', isActive: true }, QA_HCM: { name: 'TP.HCM · Kiểm thử', isActive: true } },
  devices: Object.fromEntries(Object.keys(catalogItems).slice(0, 24).filter((_, index) => index % 4 !== 0).map(id => [`D_${id}`, { catalogItemId: id, status: 'in_stock', branchId: 'QA_DN' }]))
});
const app = express();
app.use(express.json());
const previewImages: Record<string, string> = {
  'phone-front.svg': fileURLToPath(new URL('../tests/fixtures/storefront-phone-front.svg', import.meta.url)),
  'phone-back.svg': fileURLToPath(new URL('../tests/fixtures/storefront-phone-back.svg', import.meta.url)),
  'cable.svg': fileURLToPath(new URL('../tests/fixtures/storefront-cable.svg', import.meta.url))
};
app.get('/__preview/media/:name', (req, res) => {
  const path = previewImages[req.params.name];
  if (!path) return res.sendStatus(404);
  return res.sendFile(path);
});
app.use('/api/storefront', createStorefrontRouter(memory.db));
app.get('/api/customer-portal/public/bootstrap', (_req, res) => res.json({ success: true, data: {
  brand: { name: 'PhoneHouse · Dữ liệu kiểm thử', slogan: 'Bản xem thử local — dữ liệu giả lập, không phải hàng đang bán', hotline: '', supportEmail: '' },
  branches: [{ id: 'QA_DN', name: 'Đà Nẵng · Kiểm thử', address: 'Địa chỉ giả lập để kiểm thử giao diện', phone: '', openingHours: 'Dữ liệu kiểm thử' }, { id: 'QA_HCM', name: 'TP.HCM · Kiểm thử', address: 'Địa chỉ giả lập', phone: '', openingHours: '' }], promotions: [], generatedAt: new Date().toISOString()
} }));
app.post('/api/observability/client-errors', (_req, res) => res.json({ success: true }));
app.all('/api/*', (_req, res) => res.status(503).json({ success: false, message: 'Endpoint không được bật trong bản xem thử giả lập.' }));
const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
app.use(vite.middlewares);
app.listen(3100, '127.0.0.1', () => console.log('Synthetic storefront preview: http://localhost:3100/cua-hang — no production writes'));
