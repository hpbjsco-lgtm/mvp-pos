/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Product, ProductSize } from '../types';
import { cleanSizes, hasSizes } from '../utils/sizes';
import { logOperation } from '../utils/logger';
import { categoryBadgeColor } from '../utils/categoryColor';
import { fileToResizedDataUrl } from '../utils/imageUpload';
import ToppingDialog from './ToppingDialog';
import DishDialog from './DishDialog';
import PageCard from './ui/PageCard';
import FilterPills from './ui/FilterPills';
import ListToolbar from './ui/ListToolbar';
import DataTable, { RoundThumb, RowActions } from './ui/DataTable';

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
  /** Yêu cầu mở sẵn form thêm món / topping (khi chuyển từ màn Kho hàng sang). */
  startAction?: 'dish' | 'topping' | null;
  onActionHandled?: () => void;
  /** Nguyên vật liệu trong kho (thành phần công thức món, F&B). */
  ingredients?: Product[];
}

export default function MenuManagement({
  simProducts,
  setSimProducts,
  triggerBeep,
  storeType = 'fnb',
  startAction,
  onActionHandled,
  ingredients = []
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
  // Sửa món đang chọn (null = đang thêm mới) + size / biến thể giá tùy chỉnh
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sizesOn, setSizesOn] = useState(false);
  const [newItemSizes, setNewItemSizes] = useState<ProductSize[]>([]);
  // Topping (chỉ F&B): hộp chọn loại cần thêm + hộp tạo / sửa topping
  const [chooserOpen, setChooserOpen] = useState(false);
  const [toppingDialog, setToppingDialog] = useState<{ topping?: Product } | null>(null);
  const [dishDialog, setDishDialog] = useState<{ dish?: Product } | null>(null);

  // Lưu món (F&B) và cập nhật danh sách món được gắn của từng topping
  const handleSaveDish = (dish: Product, toppingIds: string[]) => {
    logOperation('Quản lý thực đơn', simProducts.some(p => p.id === dish.id) ? 'Sửa món' : 'Thêm món', dish);
    setSimProducts(prev => {
      const next = prev.some(p => p.id === dish.id) ? prev.map(p => (p.id === dish.id ? dish : p)) : [dish, ...prev];
      return next.map(p => (p.isTopping
        ? { ...p, toppingFor: toppingIds.includes(p.id) ? [...new Set([...(p.toppingFor || []), dish.id])] : (p.toppingFor || []).filter(id => id !== dish.id) }
        : p));
    });
    triggerBeep(true);
  };

  const handleSaveTopping = (t: Product) => {
    logOperation('Quản lý thực đơn', simProducts.some(p => p.id === t.id) ? 'Sửa topping' : 'Thêm topping', t);
    setSimProducts(prev => (prev.some(p => p.id === t.id) ? prev.map(p => (p.id === t.id ? t : p)) : [t, ...prev]));
    triggerBeep(true);
  };

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
  const resetForm = () => {
    setEditingId(null);
    setNewItemName('');
    setNewItemCategory('');
    setNewItemSku('');
    setNewItemUnit('');
    setNewItemImageUrl('');
    setImageError('');
    setNewItemPrice(30000);
    setNewItemCost(10000);
    setSizesOn(false);
    setNewItemSizes([]);
  };

  const openNewItem = () => {
    if (!isRetail) { setDishDialog({}); return; }
    resetForm();
    setAddModalOpen(true);
  };

  const openEditItem = (p: Product) => {
    if (!isRetail) { setDishDialog({ dish: p }); triggerBeep(true); return; }
    setEditingId(p.id);
    setNewItemName(p.name);
    setNewItemCategory(p.category);
    setNewItemSku(p.sku);
    setNewItemUnit(p.unit || '');
    setNewItemImageUrl(p.imageUrl || '');
    setImageError('');
    setNewItemPrice(p.price);
    setNewItemCost(p.cost);
    setSizesOn(hasSizes(p));
    setNewItemSizes(hasSizes(p) ? p.sizes.map(s => ({ ...s })) : []);
    setAddModalOpen(true);
    triggerBeep(true);
  };

  // Bật "nhiều mức giá": tạo sẵn 2 size để chỉnh sửa
  const toggleSizes = (on: boolean) => {
    setSizesOn(on);
    if (on && newItemSizes.length === 0) {
      setNewItemSizes([{ name: 'Nhỏ', price: newItemPrice }, { name: 'Lớn', price: newItemPrice + 10000 }]);
    }
  };

  // Mở sẵn form theo yêu cầu từ màn khác (vd Kho hàng -> + Món / + Topping)
  React.useEffect(() => {
    if (!startAction) return;
    if (startAction === 'dish') openNewItem();
    else setToppingDialog({});
    onActionHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAction]);

  const handleSubmitMenuItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) {
      alert('Vui lòng nhập tên món ăn/thức uống!');
      return;
    }

    const sizes = !isRetail && sizesOn ? cleanSizes(newItemSizes) : [];
    if (!isRetail && sizesOn && sizes.length === 0) {
      alert('Vui lòng nhập ít nhất một size (tên và giá).');
      return;
    }
    // Giá gốc của món = giá của size mặc định (size đầu tiên)
    const price = sizes.length > 0 ? sizes[0].price : newItemPrice;

    const existing = editingId ? simProducts.find(p => p.id === editingId) : undefined;
    const sku = newItemSku.trim() || existing?.sku || `MN-${Date.now().toString().slice(-6)}`;

    const product: Product = {
      ...(existing || { id: `P-${Date.now()}`, isAvailable: true, createdAt: new Date().toISOString() }),
      sku,
      name: newItemName.trim(),
      price,
      cost: newItemCost,
      category: newItemCategory.trim() || 'Khác',
      unit: newItemUnit.trim() || undefined,
      imageUrl: newItemImageUrl || undefined,
      sizes: sizes.length > 0 ? sizes : undefined,
    };

    logOperation('Quản lý thực đơn', existing ? 'Sửa món trong thực đơn' : 'Thêm món vào thực đơn', product);
    setSimProducts(prev => (existing ? prev.map(p => (p.id === product.id ? product : p)) : [product, ...prev]));

    resetForm();
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
      <PageCard title={isRetail ? 'Quản lý sản phẩm' : 'Thực đơn & Menu'}>
        <ListToolbar
          filters={<FilterPills options={['all', ...existingCategories].map(cat => ({ value: cat, label: cat === 'all' ? 'Tất cả' : cat }))} value={selectedCategory} onChange={setSelectedCategory} />}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder={isRetail ? 'Tìm theo tên sản phẩm hoặc mã SKU/Barcode...' : 'Tìm tên món hoặc mã món...'}
          addLabel="Thêm mới"
          onAdd={() => { if (isRetail) openNewItem(); else setChooserOpen(true); triggerBeep(true); }}
        />
        <DataTable
          rows={filteredProducts}
          rowKey={p => p.id}
          emptyMessage={`Không tìm thấy ${isRetail ? 'sản phẩm' : 'món ăn'} nào`}
          columns={[
            { key: 'available', header: '', className: 'w-28', render: p => (
              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={() => handleToggleAvailability(p.id)}
                  role="switch"
                  aria-checked={p.isAvailable}
                  title="Bấm để đổi trạng thái"
                  className={`relative w-12 h-7 rounded-full transition-colors cursor-pointer shrink-0 ${p.isAvailable ? 'bg-primary' : 'bg-outline-variant'}`}
                >
                  <span className={`absolute left-0 top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${p.isAvailable ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className="text-sm font-semibold text-on-surface-variant">{p.isAvailable ? (isRetail ? 'Còn hàng' : 'Còn món') : (isRetail ? 'Hết hàng' : 'Hết món')}</span>
              </div>
            ) },
            { key: 'image', header: 'Ảnh', className: 'w-16', render: p => (
              <label className="relative block w-10 h-10 cursor-pointer" title="Chạm để đổi ảnh">
                <RoundThumb imageUrl={p.imageUrl} name={p.name} />
                <input type="file" accept="image/*" className="hidden" onChange={e => { void handleReplaceImage(p.id, e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            ) },
            { key: 'sku', header: 'Mã món', render: p => <span className="font-bold">{p.sku}</span> },
            { key: 'name', header: 'Tên món', render: p => (
              <div>
                <span className={`font-bold ${!p.isAvailable ? 'line-through' : ''}`}>{p.name}</span>
                {hasSizes(p) && <span className="block text-sm text-on-surface-variant">{p.sizes.map(z => `${z.name} ${z.price.toLocaleString('vi-VN')}`).join(' · ')}</span>}
                {p.isTopping && <span className="m3-badge m3-badge-warning mt-1">Topping · {(p.toppingFor || []).length} món</span>}
              </div>
            ) },
            { key: 'category', header: 'Loại menu', render: p => <span className={`m3-badge ${categoryBadgeColor(p.category)}`}>{p.category}</span> },
            { key: 'cost', header: 'Giá vốn', className: 'text-right', render: p => (p.cost || 0).toLocaleString('vi-VN') },
            { key: 'price', header: 'Giá bán', className: 'text-right font-bold', render: p => `${hasSizes(p) ? 'từ ' : ''}${(hasSizes(p) ? Math.min(...p.sizes.map(z => z.price)) : p.price).toLocaleString('vi-VN')}${isRetail && p.unit ? ` / ${p.unit}` : ''}` },
            { key: 'status', header: 'Trạng thái', render: p => <span className="font-bold">{p.isActive === false ? 'Tạm ẩn' : 'Đang kinh doanh'}</span> },
          ]}
          renderActions={p => (
            <RowActions
              onEdit={() => (p.isTopping ? setToppingDialog({ topping: p }) : openEditItem(p))}
              editLabel={p.isTopping ? 'Sửa topping' : isRetail ? 'Sửa sản phẩm' : 'Sửa món'}
              onDelete={() => handleDeleteItem(p.id)}
              deleteLabel={isRetail ? 'Xóa khỏi danh mục sản phẩm' : 'Xóa khỏi thực đơn'}
            />
          )}
        />
      </PageCard>

      {/* Chọn loại cần thêm (F&B): Món hoặc Topping */}
      {chooserOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setChooserOpen(false)}>
          <div className="bg-surface w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 space-y-2" onClick={e => e.stopPropagation()}>
            <p className="text-lg font-bold text-on-surface pb-1">Thêm mới</p>
            <button onClick={() => { setChooserOpen(false); openNewItem(); }} className="w-full min-h-14 px-4 rounded-xl border border-outline-variant text-left text-base font-bold hover:bg-surface-container cursor-pointer">
              + Món <span className="block text-sm font-normal text-on-surface-variant">Món ăn, đồ uống bán trên màn hình bán hàng</span>
            </button>
            <button onClick={() => { setChooserOpen(false); setToppingDialog({}); }} className="w-full min-h-14 px-4 rounded-xl border border-outline-variant text-left text-base font-bold hover:bg-surface-container cursor-pointer">
              + Topping <span className="block text-sm font-normal text-on-surface-variant">Bán kèm món (trân châu, thạch, kem...)</span>
            </button>
          </div>
        </div>
      )}

      {dishDialog && (
        <DishDialog dish={dishDialog.dish} menuProducts={simProducts} ingredients={ingredients} onSave={handleSaveDish} onClose={() => setDishDialog(null)} />
      )}

      {toppingDialog && (
        <ToppingDialog topping={toppingDialog.topping} products={simProducts} onSave={handleSaveTopping} onClose={() => setToppingDialog(null)} />
      )}

      {/* Modal thêm món / sản phẩm mới */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="m3-card !bg-surface-container-lowest max-w-md w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
              <h3 className="text-base font-bold text-on-surface">
                {editingId ? (isRetail ? 'Sửa sản phẩm' : 'Sửa món') : (isRetail ? 'Thêm sản phẩm mới' : 'Thêm món mới')}
              </h3>
              <button onClick={() => { setAddModalOpen(false); resetForm(); }} className="m3-icon-btn">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitMenuItem} className="space-y-3">
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
                  <label className="text-sm font-semibold text-on-surface-variant">{sizesOn ? 'Giá bán (theo size bên dưới)' : 'Giá bán (đ)'}</label>
                  <input
                    type="number"
                    value={sizesOn && newItemSizes[0] ? newItemSizes[0].price : newItemPrice}
                    onChange={(e) => setNewItemPrice(parseInt(e.target.value) || 0)}
                    className="m3-input font-mono"
                    min="0"
                    disabled={sizesOn}
                    required={!sizesOn}
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

              {!isRetail && (
                <div className="rounded-xl border border-outline-variant p-3 space-y-3">
                  <label className="flex items-start justify-between gap-3 cursor-pointer">
                    <span>
                      <span className="block text-sm font-bold text-on-surface">Nhiều mức giá / size</span>
                      <span className="block text-sm text-on-surface-variant">Tự đặt tên size và giá bán riêng cho từng size của món này</span>
                    </span>
                    <input type="checkbox" checked={sizesOn} onChange={(e) => toggleSizes(e.target.checked)} className="w-6 h-6 accent-primary mt-0.5" />
                  </label>

                  {sizesOn && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[1fr_7.5rem_2.5rem] gap-2 text-xs font-bold uppercase text-on-surface-variant px-1">
                        <span>Tên size</span><span className="text-right">Giá bán</span><span />
                      </div>
                      {newItemSizes.map((sz, i) => (
                        <div key={i} className="grid grid-cols-[1fr_7.5rem_2.5rem] gap-2 items-center">
                          <input
                            value={sz.name}
                            onChange={(e) => setNewItemSizes(list => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                            placeholder={i === 0 ? 'vd: Nhỏ (mặc định)' : 'vd: Lớn'}
                            className="m3-input !min-h-11"
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            value={sz.price ? sz.price.toLocaleString('vi-VN') : ''}
                            placeholder="0"
                            onChange={(e) => setNewItemSizes(list => list.map((x, j) => (j === i ? { ...x, price: parseInt(e.target.value.replace(/\D/g, '').slice(0, 9)) || 0 } : x)))}
                            className="m3-input !min-h-11 text-right font-bold"
                          />
                          <button
                            type="button"
                            onClick={() => setNewItemSizes(list => list.filter((_, j) => j !== i))}
                            disabled={newItemSizes.length <= 1}
                            className="m3-icon-btn !w-10 !h-10 hover:text-error disabled:opacity-30"
                            aria-label="Xóa size"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setNewItemSizes(list => [...list, { name: '', price: list[list.length - 1]?.price || newItemPrice }])}
                        className="m3-btn-tonal !min-h-10 text-sm"
                      >
                        <Plus className="w-4 h-4" /> Thêm size
                      </button>
                      <p className="text-sm text-on-surface-variant">Size đầu tiên là mặc định khi thêm món vào đơn.</p>
                    </div>
                  )}
                </div>
              )}

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
                {editingId ? 'Lưu thay đổi' : (isRetail ? 'Tạo & Thêm sản phẩm mới' : 'Tạo & Thêm món vào Menu')}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
