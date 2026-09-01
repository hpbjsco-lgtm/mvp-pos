/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  Coffee, ShoppingBasket, Utensils, Package, Tag, Plus, Search,
  ToggleLeft, ToggleRight, Check, AlertCircle, Trash2, DollarSign
} from 'lucide-react';
import { Product } from '../types';
import { logOperation } from '../utils/logger';
import { categoryBadgeColor } from '../utils/categoryColor';

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
  isOffline = true,
  storeId = 'Sandbox',
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

  // Form states to add new menu item
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<string>('');
  const [newItemPrice, setNewItemPrice] = useState<number>(30000);
  const [newItemCost, setNewItemCost] = useState<number>(10000);
  const [newItemSku, setNewItemSku] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('');
  const [newItemImageUrl, setNewItemImageUrl] = useState('');

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
      imageUrl: newItemImageUrl.trim() || undefined,
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
    setNewItemPrice(30000);
    setNewItemCost(10000);
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
    <div id="menu-management-panel" className="space-y-6">
      
      {/* Visual Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-surface-container-lowest border border-outline-variant rounded-3xl p-6 shadow-sm gap-4">
        <div>
          <h2 className="text-xl font-black text-on-surface tracking-tight uppercase flex items-center gap-2">
            {isRetail ? <ShoppingBasket className="w-6 h-6 text-secondary" /> : <Coffee className="w-6 h-6 text-secondary" />}
            {isRetail ? 'Quản lý Sản phẩm' : 'Quản lý Menu & Thực đơn quán'}
          </h2>
          <p className="text-xs text-on-surface-variant mt-1">
            {isRetail
              ? 'Thiết lập danh mục hàng hóa, mã SKU/barcode, đơn vị tính; bật/tắt trạng thái còn hàng để đồng bộ tức thì sang quầy thu ngân.'
              : 'Thiết lập danh mục đồ ăn, nước uống, hạt đóng gói; bật/tắt trạng thái còn món để đồng bộ tức thì sang quầy thu ngân.'}
          </p>
        </div>
        <div className="flex items-center space-x-2 bg-surface-container px-3 py-2 border border-outline-variant rounded-2xl">
          <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider block">{isRetail ? 'Tổng số sản phẩm:' : 'Tổng số món:'}</span>
          <span className="text-sm font-extrabold text-on-surface">{simProducts.length}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left column: Add Menu Item form */}
        <div className="lg:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-3xl p-5 space-y-4 shadow-sm h-fit">
          <div className="border-b border-outline-variant pb-3">
            <h3 className="text-sm font-extrabold text-on-surface uppercase flex items-center gap-2">
              <Plus className="w-4 h-4 text-secondary" />
              {isRetail ? 'Thêm Sản Phẩm Mới' : 'Thêm Món Mới'}
            </h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {isRetail ? 'Thêm hàng hóa mới vào danh mục bán lẻ' : 'Thêm món ăn, đồ uống hoặc gói sản phẩm bán kèm'}
            </p>
          </div>

          <form onSubmit={handleAddMenuItem} className="space-y-3.5">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase">Tên món / Sản phẩm</label>
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="Ví dụ: Bạc Xỉu Sương Sáo"
                className="w-full px-3 py-2 border border-outline-variant rounded-xl text-xs font-semibold focus:ring-1 focus:ring-primary"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase">{isRetail ? 'Danh mục hàng hóa' : 'Phân loại Menu'}</label>
              <input
                type="text"
                list="category-suggestions"
                value={newItemCategory}
                onChange={(e) => setNewItemCategory(e.target.value)}
                placeholder="Nhập tự do, ví dụ: Bánh kẹo..."
                className="w-full px-3 py-2 border border-outline-variant rounded-xl text-xs font-semibold focus:ring-1 focus:ring-primary"
              />
              <datalist id="category-suggestions">
                {Array.from(new Set([...existingCategories, ...categorySuggestions])).map(cat => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Giá bán (đ)</label>
                <input
                  type="number"
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-outline-variant rounded-xl text-xs font-bold focus:ring-1 focus:ring-primary"
                  min="0"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Giá vốn (đ)</label>
                <input
                  type="number"
                  value={newItemCost}
                  onChange={(e) => setNewItemCost(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-outline-variant rounded-xl text-xs font-bold focus:ring-1 focus:ring-primary"
                  min="0"
                  required
                />
              </div>
            </div>

            {isRetail && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Đơn vị tính</label>
                <input
                  type="text"
                  value={newItemUnit}
                  onChange={(e) => setNewItemUnit(e.target.value)}
                  placeholder="Ví dụ: cái, kg, lốc, thùng..."
                  className="w-full px-3 py-2 border border-outline-variant rounded-xl text-xs font-semibold focus:ring-1 focus:ring-primary"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase">Ảnh sản phẩm (URL, tùy chọn)</label>
              <input
                type="text"
                value={newItemImageUrl}
                onChange={(e) => setNewItemImageUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 border border-outline-variant rounded-xl text-xs font-semibold focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase">Mã SKU / Barcode (Tùy chọn)</label>
              <input
                type="text"
                value={newItemSku}
                onChange={(e) => setNewItemSku(e.target.value)}
                placeholder="Tự động tạo nếu bỏ trống"
                className="w-full px-3 py-2 border border-outline-variant rounded-xl text-xs font-mono font-bold uppercase focus:ring-1 focus:ring-primary"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-primary hover:brightness-110 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-98 cursor-pointer mt-2"
            >
              {isRetail ? '+ Tạo & Thêm sản phẩm mới' : '+ Tạo & Thêm món vào Menu'}
            </button>
          </form>
        </div>

        {/* Right column: Menu List with switchable filters */}
        <div className="lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-3xl p-5 space-y-4 shadow-sm">

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-outline-variant pb-4">
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-on-surface uppercase">{isRetail ? 'Danh sách Sản phẩm Hiện tại' : 'Danh sách Thực đơn Hiện tại'}</h3>
              <p className="text-xs text-on-surface-variant">{isRetail ? 'Tìm kiếm nhanh và cài đặt trạng thái còn hàng của sản phẩm' : 'Tìm kiếm nhanh và cài đặt trạng thái hoạt động của món ăn'}</p>
            </div>

            {/* Category tabs */}
            <div className="flex flex-wrap bg-surface-container-high p-1 rounded-xl border border-outline-variant text-[10px]">
              {['all', ...existingCategories].map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1.5 font-bold rounded-lg transition-all ${
                    selectedCategory === cat
                      ? 'bg-surface-container-lowest text-on-surface shadow-sm font-black'
                      : 'text-on-surface-variant'
                  }`}
                >
                  {cat === 'all' ? 'Tất cả' : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Search box */}
          <div className="relative">
            <Search className="w-4 h-4 text-on-surface-variant absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isRetail ? 'Tìm theo tên sản phẩm hoặc mã SKU/Barcode...' : 'Tìm theo tên món hoặc mã SKU...'}
              className="w-full pl-9 pr-4 py-2 border border-outline-variant rounded-xl text-xs focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* List layout */}
          {filteredProducts.length === 0 ? (
            <div className="py-12 text-center text-on-surface-variant text-xs border border-dashed border-outline-variant rounded-2xl">
              🔍 Không tìm thấy {isRetail ? 'sản phẩm' : 'món ăn'} nào tương ứng bộ lọc.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredProducts.map(p => {
                return (
                  <div 
                    key={p.id}
                    className={`p-4 rounded-2xl border transition-all flex justify-between items-center gap-4 hover:shadow-sm ${
                      p.isAvailable 
                        ? 'border-outline-variant bg-white' 
                        : 'border-outline-variant bg-surface-container/70 opacity-75'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-11 h-11 rounded-xl object-cover border border-outline-variant shrink-0" />
                      ) : (
                        <div className={`w-11 h-11 rounded-xl shrink-0 flex items-center justify-center text-sm font-black ${categoryBadgeColor(p.category)}`}>
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-on-surface-variant bg-surface-container-high px-1 py-0.2 rounded font-semibold uppercase">
                            {p.sku}
                          </span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${categoryBadgeColor(p.category)}`}>
                            {p.category}
                          </span>
                        </div>

                        <h4 className="text-xs font-extrabold text-on-surface">{p.name}</h4>

                        <div className="flex items-center gap-2 text-[11px] font-bold text-on-surface">
                          <span className="text-secondary">{p.price.toLocaleString('vi-VN')} đ{isRetail && p.unit ? ` / ${p.unit}` : ''}</span>
                          <span className="text-[9px] text-on-surface-variant font-medium">giá vốn: {p.cost.toLocaleString('vi-VN')} đ</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {/* Availability status toggle switch */}
                      <button
                        onClick={() => handleToggleAvailability(p.id)}
                        className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-extrabold transition-all border ${
                          p.isAvailable
                            ? 'bg-secondary-container text-on-secondary-container border-secondary-container hover:bg-secondary-container'
                            : 'bg-error-container text-on-error-container border-error-container hover:brightness-95'
                        }`}
                        title="Bấm để đổi trạng thái"
                      >
                        {p.isAvailable ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-secondary" />
                            <span>{isRetail ? 'CÒN HÀNG' : 'CÒN MÓN'}</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3.5 h-3.5 text-error" />
                            <span>{isRetail ? 'HẾT HÀNG' : 'HẾT MÓN'}</span>
                          </>
                        )}
                      </button>

                      {/* Delete button */}
                      <button
                        onClick={() => handleDeleteItem(p.id)}
                        className="p-1 text-on-surface-variant hover:text-error hover:bg-error-container rounded-lg transition-colors"
                        title={isRetail ? 'Xóa khỏi danh mục sản phẩm' : 'Xóa khỏi thực đơn'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
