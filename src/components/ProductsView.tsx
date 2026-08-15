import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Plus, 
  Box, 
  Layers, 
  MoreVertical, 
  Trash2, 
  Edit2, 
  Package, 
  Tag, 
  AlertCircle,
  X,
  Check,
  TrendingUp,
  ShoppingCart
} from 'lucide-react';
import { ProductItem } from '../types';

interface ProductsViewProps {
  products: ProductItem[];
  onAddProduct: (product: ProductItem) => void;
  onUpdateProduct: (product: ProductItem) => void;
  onDeleteProduct: (productId: string) => void;
}

export const ProductsView: React.FC<ProductsViewProps> = ({
  products,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  
  // Basic form state
  const [formData, setFormData] = useState<Partial<ProductItem>>({
    category: 'Phụ kiện',
    status: 'active',
    stockQuantity: 1,
    minStockLevel: 5
  });

  const categories = ['ALL', 'Phụ kiện', 'Linh kiện', 'Dịch vụ'];

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.sku.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCategory = selectedCategory === 'ALL' || p.category === selectedCategory;
      return matchSearch && matchCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const stats = useMemo(() => {
    const totalItems = products.length;
    const totalValue = products.reduce((sum, p) => sum + (p.buyPrice * p.stockQuantity), 0);
    const lowStock = products.filter(p => p.stockQuantity <= p.minStockLevel).length;
    return { totalItems, totalValue, lowStock };
  }, [products]);

  const handleSave = () => {
    if (!formData.name || !formData.sku || !formData.buyPrice || !formData.sellPrice) return;
    
    if (formData.id) {
      onUpdateProduct(formData as ProductItem);
    } else {
      onAddProduct({
        ...formData,
        id: `PROD-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      } as ProductItem);
    }
    setIsAddModalOpen(false);
    setFormData({ category: 'Phụ kiện', status: 'active', stockQuantity: 1, minStockLevel: 5 });
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-[1600px] mx-auto pb-24 sm:pb-8">
      
      {/* 1. Header Area */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-lg sm:text-2xl font-black text-zinc-900 flex items-center space-x-2 tracking-tight">
            <Box className="w-6 h-6 sm:w-7 sm:h-7 text-[#F94A1F]" />
            <span>Kho Linh Kiện & Phụ Kiện</span>
            <span className="bg-orange-50 text-orange-700 border border-orange-200 text-xs px-2.5 py-0.5 rounded-full font-bold ml-2">
              {filteredProducts.length} SKU
            </span>
          </h2>
          <p className="text-[11px] sm:text-xs text-zinc-500 mt-1 font-medium">
            Quản lý mã vạch (SKU) cho ốp lưng, sạc, pin thay thế, linh kiện sửa chữa và dịch vụ
          </p>
        </div>
        
        <button
          onClick={() => {
            setFormData({ category: 'Phụ kiện', status: 'active', stockQuantity: 1, minStockLevel: 5 });
            setIsAddModalOpen(true);
          }}
          className="w-full sm:w-auto bg-gradient-to-r from-orange-500 to-[#F94A1F] hover:from-orange-600 hover:to-orange-700 text-white px-5 py-2.5 rounded-2xl font-bold flex items-center justify-center space-x-2 shadow-lg shadow-orange-500/25 transition-all active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
          <span>Thêm SKU Mới</span>
        </button>
      </div>

      {/* 2. Top Stats - Matching InventoryView */}
      <div className="bg-white rounded-3xl p-3.5 sm:p-4 border border-zinc-100/90 shadow-2xs space-y-3 relative overflow-hidden">
        {/* Ambient background decoration */}
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
          <Box className="w-48 h-48" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 relative z-10 lg:divide-x divide-zinc-100">
          
          <div className="p-2 sm:p-3 bg-zinc-50/50 lg:bg-transparent rounded-2xl lg:rounded-none border lg:border-none border-zinc-100/80">
            <div className="flex items-center space-x-2 text-zinc-500 mb-1.5 sm:mb-2">
              <div className="p-1.5 bg-blue-100/50 rounded-lg">
                <Layers className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-xs font-semibold">Tổng số SKU</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
              {stats.totalItems} <span className="text-sm font-semibold text-zinc-400">mã</span>
            </div>
          </div>

          <div className="p-2 sm:p-3 bg-zinc-50/50 lg:bg-transparent rounded-2xl lg:rounded-none border lg:border-none border-zinc-100/80 lg:pl-6">
            <div className="flex items-center space-x-2 text-zinc-500 mb-1.5 sm:mb-2">
              <div className="p-1.5 bg-rose-100/50 rounded-lg">
                <AlertCircle className="w-4 h-4 text-rose-600" />
              </div>
              <span className="text-xs font-semibold">Sắp hết hàng</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-rose-600 tracking-tight flex items-baseline gap-2">
              {stats.lowStock} <span className="text-sm font-semibold text-rose-400">cảnh báo</span>
            </div>
          </div>

          <div className="p-2 sm:p-3 bg-zinc-50/50 lg:bg-transparent rounded-2xl lg:rounded-none border lg:border-none border-zinc-100/80 lg:pl-6">
            <div className="flex items-center space-x-2 text-zinc-500 mb-1.5 sm:mb-2">
              <div className="p-1.5 bg-purple-100/50 rounded-lg">
                <Package className="w-4 h-4 text-purple-600" />
              </div>
              <span className="text-xs font-semibold">Tồn kho phụ kiện</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
              {products.filter(p => p.category === 'Phụ kiện').reduce((a,b) => a + b.stockQuantity, 0)} <span className="text-sm font-semibold text-zinc-400">món</span>
            </div>
          </div>

          <div className="p-2 sm:p-3 bg-zinc-50/50 lg:bg-transparent rounded-2xl lg:rounded-none border lg:border-none border-zinc-100/80 lg:pl-6">
            <div className="flex items-center space-x-2 text-zinc-500 mb-1.5 sm:mb-2">
              <div className="p-1.5 bg-orange-100/50 rounded-lg">
                <TrendingUp className="w-4 h-4 text-[#F94A1F]" />
              </div>
              <span className="text-xs font-semibold">Giá trị tồn (Vốn)</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-[#F94A1F] tracking-tight font-mono">
              {stats.totalValue.toLocaleString('vi-VN')} <span className="text-sm font-semibold text-orange-400">đ</span>
            </div>
          </div>

        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="bg-white border border-orange-100/60 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-sm relative z-20">
        <div className="flex flex-col sm:flex-row gap-3">
          
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-orange-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-4 py-2.5 sm:py-3 bg-orange-50/30 border border-orange-100 rounded-xl text-sm font-medium text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#F94A1F]/20 focus:border-[#F94A1F] transition-all"
              placeholder="Tìm theo tên sản phẩm, mã SKU, thương hiệu..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Category Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none shrink-0">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-orange-50 text-[#F94A1F] border border-orange-200 shadow-sm'
                    : 'bg-white text-zinc-500 border border-zinc-200 hover:border-orange-200 hover:text-orange-600 hover:bg-orange-50/50'
                }`}
              >
                {cat === 'ALL' ? 'Tất cả' : cat}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* 4. List View */}
      <div className="space-y-3">
        {filteredProducts.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-3xl border border-zinc-100 text-zinc-500 text-xs">
            Không tìm thấy sản phẩm nào khớp điều kiện.
          </div>
        ) : (
          <div className="bg-white border border-zinc-100/80 rounded-3xl overflow-hidden shadow-2xs hidden md:block">
            {/* Desktop Table */}
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50/80 border-b border-zinc-100/80">
                  <th className="px-5 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">SKU</th>
                  <th className="px-5 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Tên sản phẩm</th>
                  <th className="px-5 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Phân loại</th>
                  <th className="px-5 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-right">Tồn kho</th>
                  <th className="px-5 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-right">Giá bán</th>
                  <th className="px-5 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100/80">
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-orange-50/30 transition-colors group">
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs font-extrabold text-zinc-800 bg-zinc-100 px-2 py-1 rounded-md">{product.sku}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-bold text-sm text-zinc-900 group-hover:text-[#F94A1F] transition-colors line-clamp-1">{product.name}</div>
                      {product.brand && <div className="text-xs text-zinc-500 font-medium mt-0.5">{product.brand}</div>}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                        product.category === 'Phụ kiện' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                        product.category === 'Linh kiện' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                        'bg-purple-50 text-purple-700 border border-purple-100'
                      }`}>
                        {product.category}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex flex-col items-end justify-center">
                        <span className={`font-bold text-sm ${product.stockQuantity <= product.minStockLevel ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {product.stockQuantity}
                        </span>
                        {product.stockQuantity <= product.minStockLevel && (
                          <span className="text-[10px] text-rose-500 font-medium">Sắp hết</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="text-[#F94A1F] font-extrabold text-sm font-mono tracking-tight">
                        {product.sellPrice.toLocaleString('vi-VN')} đ
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono mt-0.5">Vốn: {product.buyPrice.toLocaleString('vi-VN')} đ</div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setFormData(product);
                            setIsAddModalOpen(true);
                          }}
                          className="p-1.5 text-zinc-400 hover:text-[#F94A1F] bg-white border border-zinc-200 hover:border-orange-200 rounded-lg transition-colors cursor-pointer shadow-2xs"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteProduct(product.id)}
                          className="p-1.5 text-zinc-400 hover:text-red-600 bg-white border border-zinc-200 hover:border-red-200 rounded-lg transition-colors cursor-pointer shadow-2xs"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile Cards View */}
        <div className="md:hidden space-y-3">
          {filteredProducts.map(product => (
            <div 
              key={product.id}
              className="bg-white rounded-3xl p-3.5 sm:p-4 border border-zinc-100/90 shadow-2xs hover:border-orange-200/80 transition-all space-y-3 relative"
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="flex-1 min-w-0">
                  <h3 className="font-extrabold text-zinc-900 text-sm tracking-tight line-clamp-2">
                    {product.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-[10px] font-extrabold text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded-md border border-zinc-200">{product.sku}</span>
                    {product.brand && <span className="text-[11px] text-zinc-500 font-medium">{product.brand}</span>}
                  </div>
                </div>

                <div className="relative shrink-0">
                  <button 
                    onClick={() => setActiveMenuId(activeMenuId === product.id ? null : product.id)}
                    className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  
                  {activeMenuId === product.id && (
                    <div className="absolute right-0 top-8 w-36 bg-white border border-zinc-200 rounded-2xl shadow-xl z-20 p-1 space-y-0.5 text-xs">
                      <button
                        onClick={() => {
                          setFormData(product);
                          setIsAddModalOpen(true);
                          setActiveMenuId(null);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-orange-50 text-zinc-700 rounded-xl flex items-center space-x-2 font-medium cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-orange-600" />
                        <span>Sửa thông tin</span>
                      </button>
                      <button
                        onClick={() => {
                          onDeleteProduct(product.id);
                          setActiveMenuId(null);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 rounded-xl flex items-center space-x-2 font-medium cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa sản phẩm</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
                  product.category === 'Phụ kiện' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                  product.category === 'Linh kiện' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                  'bg-purple-50 text-purple-700 border-purple-100'
                }`}>
                  {product.category}
                </span>
                
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
                  product.stockQuantity <= product.minStockLevel 
                    ? 'bg-rose-50 text-rose-700 border-rose-100' 
                    : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                }`}>
                  Tồn: {product.stockQuantity}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2 mt-1 border-t border-zinc-100/80">
                <div>
                  <div className="text-[#F94A1F] font-extrabold text-base tracking-tight font-mono">
                    {product.sellPrice.toLocaleString('vi-VN')} đ
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono">Vốn: {product.buyPrice.toLocaleString('vi-VN')} đ</div>
                </div>
                
                <button className="bg-white hover:bg-orange-50 text-[#F94A1F] border border-orange-200/90 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center space-x-1 shadow-2xs transition-all cursor-pointer">
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>Bán</span>
                </button>
              </div>

            </div>
          ))}
        </div>
      </div>

      {/* 5. Add / Edit Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-white sm:bg-zinc-900/60 sm:backdrop-blur-sm z-50 flex items-center justify-center sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:rounded-[2rem] sm:max-w-2xl shadow-none sm:shadow-2xl flex flex-col overflow-hidden">
            
            <div className="px-4 py-3.5 sm:px-6 sm:py-5 bg-gradient-to-r from-orange-500 to-[#F94A1F] flex items-center shrink-0 gap-3">
              <button 
                onClick={() => setIsAddModalOpen(false)} 
                className="text-white/90 hover:text-white p-1.5 sm:p-2 sm:bg-white/10 sm:hover:bg-white/20 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 sm:hidden" />
                <X className="w-5 h-5 hidden sm:block" />
              </button>
              <h2 className="text-base sm:text-xl font-black text-white flex items-center gap-2 flex-1">
                <Box className="w-5 h-5 sm:w-6 sm:h-6" />
                {formData.id ? 'Sửa thông tin SKU' : 'Thêm mới SKU'}
              </h2>
            </div>
            
            <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto custom-scrollbar flex-1 bg-white">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-zinc-700">Mã SKU <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    value={formData.sku || ''}
                    onChange={(e) => setFormData({...formData, sku: e.target.value.toUpperCase()})}
                    className="w-full px-4 py-2.5 sm:py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono text-sm uppercase placeholder:normal-case"
                    placeholder="VD: OP-IP15PM-TR"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-zinc-700">Phân loại <span className="text-rose-500">*</span></label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value as any})}
                    className="w-full px-4 py-2.5 sm:py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-bold text-sm text-zinc-700"
                  >
                    <option value="Phụ kiện">Phụ kiện (Ốp, Sạc, Cáp...)</option>
                    <option value="Linh kiện">Linh kiện (Pin, Màn hình...)</option>
                    <option value="Dịch vụ">Dịch vụ (Dán màn, Sửa chữa...)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-zinc-700">Tên sản phẩm <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2.5 sm:py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-medium text-sm text-zinc-900"
                  placeholder="VD: Ốp lưng Torras Trong Suốt Magsafe iPhone 15 Pro Max"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-zinc-700">Thương hiệu</label>
                  <input
                    type="text"
                    value={formData.brand || ''}
                    onChange={(e) => setFormData({...formData, brand: e.target.value})}
                    className="w-full px-4 py-2.5 sm:py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-medium text-sm"
                    placeholder="VD: Torras, Apple, Spigen..."
                  />
                </div>
                
                <div className="space-y-1.5 flex flex-col justify-end">
                  <label className="text-sm font-bold text-zinc-700 mb-1.5">Trạng thái kinh doanh</label>
                  <div className="flex bg-zinc-100/80 p-1 rounded-xl h-[46px] sm:h-[50px]">
                    <button
                      onClick={() => setFormData({...formData, status: 'active'})}
                      className={`flex-1 rounded-lg text-sm font-bold transition-all cursor-pointer ${
                        formData.status === 'active' ? 'bg-white text-emerald-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                      }`}
                    >
                      Đang bán
                    </button>
                    <button
                      onClick={() => setFormData({...formData, status: 'inactive'})}
                      className={`flex-1 rounded-lg text-sm font-bold transition-all cursor-pointer ${
                        formData.status === 'inactive' ? 'bg-white text-rose-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                      }`}
                    >
                      Ngừng bán
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:gap-5 pt-2 border-t border-zinc-100">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-zinc-700">Giá vốn (VNĐ)</label>
                  <input
                    type="number"
                    value={formData.buyPrice || ''}
                    onChange={(e) => setFormData({...formData, buyPrice: Number(e.target.value)})}
                    className="w-full px-4 py-2.5 sm:py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono text-sm font-bold text-zinc-700"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-zinc-700">Giá bán (VNĐ) <span className="text-rose-500">*</span></label>
                  <input
                    type="number"
                    value={formData.sellPrice || ''}
                    onChange={(e) => setFormData({...formData, sellPrice: Number(e.target.value)})}
                    className="w-full px-4 py-2.5 sm:py-3 bg-orange-50/50 border border-orange-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono text-sm font-bold text-[#F94A1F]"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:gap-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-zinc-700">Tồn kho hiện tại</label>
                  <input
                    type="number"
                    value={formData.stockQuantity === undefined ? '' : formData.stockQuantity}
                    onChange={(e) => setFormData({...formData, stockQuantity: Number(e.target.value)})}
                    className="w-full px-4 py-2.5 sm:py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono text-sm font-bold text-emerald-700"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-zinc-700">Cảnh báo sắp hết</label>
                  <input
                    type="number"
                    value={formData.minStockLevel === undefined ? '' : formData.minStockLevel}
                    onChange={(e) => setFormData({...formData, minStockLevel: Number(e.target.value)})}
                    className="w-full px-4 py-2.5 sm:py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 font-mono text-sm font-bold text-rose-600"
                    placeholder="VD: 5"
                  />
                </div>
              </div>

            </div>

            <div className="px-4 py-3.5 sm:px-6 sm:py-5 border-t border-zinc-100 flex gap-3 bg-zinc-50/80 shrink-0 pb-[max(env(safe-area-inset-bottom),1rem)] sm:pb-5">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="flex-1 px-4 py-3 bg-white border border-zinc-200 text-zinc-700 rounded-xl font-bold hover:bg-zinc-50 transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-[#F94A1F] hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-bold shadow-lg shadow-orange-500/25 transition-all cursor-pointer flex items-center justify-center space-x-2"
              >
                <Check className="w-5 h-5" />
                <span>{formData.id ? 'Lưu Thay Đổi' : 'Tạo SKU Mới'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
