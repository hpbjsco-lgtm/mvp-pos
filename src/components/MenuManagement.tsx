/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import DragScrollRow from './DragScrollRow';
import React, { useMemo, useState } from 'react';
import { Coffee, Plus, Search, ShoppingBasket, Trash2, X } from 'lucide-react';
import { Product } from '../types';
import { logOperation } from '../utils/logger';
import { categoryBadgeColor } from '../utils/categoryColor';
import { fileToResizedDataUrl } from '../utils/imageUpload';

const CATEGORIES_BY_STORE_TYPE: Record<'fnb' | 'retail', string[]> = {
  fnb: ['Đồ uống', 'Món ăn', 'Khác'],
  retail: [
    'Nhu yếu phẩm',
    'Gia vị',
    'Mì ăn liền',
    'Bánh kẹo',
    'Đồ uống',
    'Sữa & Sản phẩm từ sữa',
    'Đông lạnh',
    'Hóa mỹ phẩm',
    'Vệ sinh nhà cửa',
    'Gia dụng',
    'Văn phòng phẩm',
    'Khác'
  ]
};

interface MenuManagementProps {
  simProducts: Product[];
  setSimProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  triggerBeep: (success: boolean) => void;
  isOffline?: boolean;
  storeId?: string;
  storeType?: 'fnb' | 'retail';
}

export default function MenuManagement({
  simProducts,
  setSimProducts,
  triggerBeep,
  storeType = 'fnb'
}: MenuManagementProps) {
  const categorySuggestions = CATEGORIES_BY_STORE_TYPE[storeType];
  const isRetail = storeType === 'retail';

  // Danh mục lọc lấy từ dữ liệu thực tế, vì người dùng có thể nhập danh mục tự do
  const existingCategories = useMemo(
    () => Array.from(new Set(simProducts.map(p => p.category))).sort((a, b) => a.localeCompare(b, 'vi')),
    [simProducts]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | string>('all');
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Form states to add new menu item
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<string>('');
  const [newItemPrice, setNewItemPrice] = useState<number>(30000);
  const [newItemCost, setNewItemCost] = useState<number>(10000);
  const [newItemSku, setNewItemSku] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('');
  const [newItemImageUrl, setNewItemImageUrl] = useState('');
  const [imageError, setImageError] = useState('');

  // Chọn ảnh cho món đang thêm (thu nhỏ + nén trước khi lưu)
  const handlePickNewImage = async (file?: File | null) => {
    if (!file) return;
    try {
      setNewItemImageUrl(await fileToResizedDataUrl(file));
      setImageError('');
    } catch (err: any) {
      setImageError(err?.message || 'Không đọc được ảnh.');
    }
  };

  // Đổi ảnh cho món đã có ngay trên danh sách
  const handleReplaceImage = async (productId: string, file?: File | null) => {
    if (!file) return;
    try {
      const imageUrl = await fileToResizedDataUrl(file);
      const product = simProducts.find(p => p.id === productId);
      if (product) logOperation('Quản lý thực đơn', 'Đổi ảnh món', { id: product.id, name: product.name });
      setSimProducts(prev => prev.map(p => (p.id === productId ? { ...p, imageUrl } : p)));
      triggerBeep(true);
    } catch (err: any) {
      alert(err?.message || 'Không đọc được ảnh.');
      triggerBeep(false);
    }
  };

  // Auto generate SKU if empty
  const handleAddMenuItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) {
      alert('Vui lòng nhập tên món ăn/thức uống!');
      return;
    }

    const sku = newItemSku.trim() || `MN-${Date.now().toString().slice(-6)}`;

    const newProduct: Product = {
      id: `P-${Date.now()}`,
      sku,
      name: newItemName.trim(),
      price: newItemPrice,
      cost: newItemCost,
      category: newItemCategory.trim() || 'Khác',
      unit: newItemUnit.trim() || undefined,
      imageUrl: newItemImageUrl || undefined,
      isAvailable: true,
      createdAt: new Date().toISOString()
    };

    logOperation('Quản lý thực đơn', 'Thêm món vào thực đơn', newProduct);
    setSimProducts(prev => [newProduct, ...prev]);

    // Reset fields
    setNewItemName('');
    setNewItemCategory('');
    setNewItemSku('');
    setNewItemUnit('');
    setNewItemImageUrl('');
    setImageError('');
    setNewItemPrice(30000);
    setNewItemCost(10000);
    setAddModalOpen(false);
    triggerBeep(true);
  };

  // Toggle availability state
  const handleToggleAvailability = async (productId: string) => {
    const product = simProducts.find(p => p.id === productId);
    if (!product) return;

    logOperation('Quản lý thực đơn', 'Thay đổi trạng thái phục vụ', { ...product, isAvailable: !product.isAvailable });
    setSimProducts(prev => prev.map(p => (p.id === productId ? { ...p, isAvailable: !p.isAvailable } : p)));
    triggerBeep(true);
  };

  // Delete item
  const handleDeleteItem = async (productId: string) => {
    const product = simProducts.find(p => p.id === productId);
    if (confirm('Bạn có chắc chắn muốn xóa món này khỏi danh mục thực đơn?')) {
      if (product) {
        logOperation('Quản lý thực đơn', 'Xóa món khỏi thực đơn', product);
      }
      setSimProducts(prev => prev.filter(p => p.id !== productId));
      triggerBeep(true);
    }
  };

  // Filtered Products
  const filteredProducts = simProducts.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.sku.includes(searchQuery);
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div id="menu-management-panel" className="space-y-4 pb-20">

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isRetail ? <ShoppingBasket className="w-5 h-5 text-primary" /> : <Coffee className="w-5 h-5 text-primary" />}
          <h2 className="text-lg font-bold text-on-surface">{isRetail ? 'Sản phẩm' : 'Thực đơn'}</h2>
        </div>
        <span className="m3-badge m3-badge-neutral">{simProducts.length} {isRetail ? 'sản phẩm' : 'món'}</span>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={isRetail ? 'Tìm theo tên sản phẩm hoặc mã SKU/Barcode...' : 'Tìm theo tên món hoặc mã SKU...'}
          className="m3-input !rounded-full pl-10"
        />
      </div>

      <DragScrollRow className="gap-2 pb-1">
        {['all', ...existingCategories].map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`m3-chip !rounded-full whitespace-nowrap ${selectedCategory === cat ? 'm3-chip-selected' : ''}`}
          >
            {cat === 'all' ? 'Tất cả' : cat}
          </button>
        ))}
      </DragScrollRow>

      {filteredProducts.length === 0 ? (
        <div className="py-16 text-center text-on-surface-variant flex flex-col items-center justify-center gap-2">
          <Search className="w-8 h-8 text-outline-variant" />
          <p className="text-base font-bold">Không tìm thấy {isRetail ? 'sản phẩm' : 'món ăn'} nào</p>
          <p className="text-sm">Thử đổi từ khóa hoặc danh mục lọc.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filteredProducts.map(p => (
            <div
              key={p.id}
              className={`m3-card p-3.5 flex items-center gap-3 ${!p.isAvailable ? 'opacity-60' : ''}`}
            >
              <label className="relative w-16 h-16 rounded-xl shrink-0 overflow-hidden cursor-pointer block border border-outline-variant" title="Chạm để đổi ảnh">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.name} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${categoryBadgeColor(p.category)}`}>
                    + Ảnh
                  </span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { void handleReplaceImage(p.id, e.target.files?.[0]); e.target.value = ''; }}
                />
              </label>

              <div className="flex-1 min-w-0 space-y-1">
                <h4 className={`text-base font-bold text-on-surface truncate ${!p.isAvailable ? 'line-through' : ''}`}>{p.name}</h4>
                <p className="text-base font-bold text-primary">
                  {p.price.toLocaleString('vi-VN')} đ{isRetail && p.unit ? ` / ${p.unit}` : ''}
                </p>
                <span className={`m3-badge ${categoryBadgeColor(p.category)}`}>{p.category}</span>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <button
                  onClick={() => handleToggleAvailability(p.id)}
                  role="switch"
                  aria-checked={p.isAvailable}
                  title="Bấm để đổi trạng thái"
                  className={`relative w-12 h-7 rounded-full transition-colors cursor-pointer shrink-0 ${
                    p.isAvailable ? 'bg-primary' : 'bg-outline-variant'
                  }`}
                >
                  <span className={`absolute left-0 top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    p.isAvailable ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
                <span className="text-sm font-semibold text-on-surface-variant">
                  {p.isAvailable ? (isRetail ? 'Còn hàng' : 'Còn món') : (isRetail ? 'Hết hàng' : 'Hết món')}
                </span>
                <button
                  onClick={() => handleDeleteItem(p.id)}
                  className="m3-icon-btn !w-8 !h-8 hover:text-error"
                  title={isRetail ? 'Xóa khỏi danh mục sản phẩm' : 'Xóa khỏi thực đơn'}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Nút nổi thêm món / sản phẩm mới */}
      <button
        onClick={() => { setAddModalOpen(true); triggerBeep(true); }}
        className="fixed right-5 bottom-[calc(5.5rem+var(--safe-bottom))] lg:bottom-8 z-30 w-14 h-14 rounded-2xl bg-primary text-on-primary shadow-xl flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
        title={isRetail ? 'Thêm sản phẩm mới' : 'Thêm món mới'}
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Modal thêm món / sản phẩm mới */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="m3-card !bg-surface-container-lowest max-w-md w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
              <h3 className="text-base font-bold text-on-surface">
                {isRetail ? 'Thêm sản phẩm mới' : 'Thêm món mới'}
              </h3>
              <button onClick={() => setAddModalOpen(false)} className="m3-icon-btn">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddMenuItem} className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Tên món / Sản phẩm</label>
                <input
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="Ví dụ: Bạc Xỉu Sương Sáo"
                  className="m3-input"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">{isRetail ? 'Danh mục hàng hóa' : 'Phân loại Menu'}</label>
                <input
                  type="text"
                  list="category-suggestions"
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value)}
                  placeholder="Nhập tự do, ví dụ: Bánh kẹo..."
                  className="m3-input"
                />
                <datalist id="category-suggestions">
                  {Array.from(new Set([...existingCategories, ...categorySuggestions])).map(cat => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-on-surface-variant">Giá bán (đ)</label>
                  <input
                    type="number"
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(parseInt(e.target.value) || 0)}
                    className="m3-input font-mono"
                    min="0"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-semibold text-on-surface-variant">Giá vốn (đ)</label>
                  <input
                    type="number"
                    value={newItemCost}
                    onChange={(e) => setNewItemCost(parseInt(e.target.value) || 0)}
                    className="m3-input font-mono"
                    min="0"
                    required
                  />
                </div>
              </div>

              {isRetail && (
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-on-surface-variant">Đơn vị tính</label>
                  <input
                    type="text"
                    value={newItemUnit}
                    onChange={(e) => setNewItemUnit(e.target.value)}
                    placeholder="Ví dụ: cái, kg, lốc, thùng..."
                    className="m3-input"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-on-surface-variant">Ảnh {isRetail ? 'sản phẩm' : 'món'} (tùy chọn)</label>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-24 rounded-xl overflow-hidden border border-outline-variant bg-surface-container flex items-center justify-center shrink-0">
                    {newItemImageUrl ? (
                      <img src={newItemImageUrl} alt="Ảnh xem trước" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm font-semibold text-on-surface-variant">Chưa có ảnh</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="m3-btn-tonal !min-h-11 text-sm">
                      {newItemImageUrl ? 'Đổi ảnh' : 'Tải ảnh lên'}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { void handlePickNewImage(e.target.files?.[0]); e.target.value = ''; }} />
                    </label>
                    {newItemImageUrl && (
                      <button type="button" onClick={() => setNewItemImageUrl('')} className="m3-btn-text !min-h-10 text-sm">Xóa ảnh</button>
                    )}
                  </div>
                </div>
                {imageError && <p className="text-sm font-semibold text-error">{imageError}</p>}
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Mã SKU / Barcode (Tùy chọn)</label>
                <input
                  type="text"
                  value={newItemSku}
                  onChange={(e) => setNewItemSku(e.target.value)}
                  placeholder="Tự động tạo nếu bỏ trống"
                  className="m3-input font-mono uppercase"
                />
              </div>

              <button type="submit" className="m3-btn-filled w-full !min-h-12 mt-1">
                {isRetail ? 'Tạo & Thêm sản phẩm mới' : 'Tạo & Thêm món vào Menu'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
