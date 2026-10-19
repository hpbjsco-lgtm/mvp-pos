/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Layers, Package, Plus, Search, Trash2, X } from 'lucide-react';
import { Product, InventoryBatch, InventoryTransaction, InventoryTransactionType } from '../types';
import { logOperation } from '../utils/logger';

interface InventoryScreenProps {
  simProducts: Product[];
  setSimProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  simBatches: InventoryBatch[];
  setSimBatches: React.Dispatch<React.SetStateAction<InventoryBatch[]>>;
  simTransactions: InventoryTransaction[];
  setSimTransactions: React.Dispatch<React.SetStateAction<InventoryTransaction[]>>;
  triggerBeep: (success: boolean) => void;
  fbUserProfile: any;
  simStoreType?: 'fnb' | 'retail';
  isOffline?: boolean;
  storeId?: string;
}

export default function InventoryScreen({
  simProducts,
  simBatches,
  setSimBatches,
  setSimTransactions,
  triggerBeep,
  fbUserProfile,
  simStoreType = 'fnb'
}: InventoryScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'expired' | 'near_expiry' | 'healthy'>('all');
  const [addModalOpen, setAddModalOpen] = useState(false);

  const isFnB = simStoreType === 'fnb';

  // Custom batch entry form states
  const [selectedProductId, setSelectedProductId] = useState(simProducts[0]?.id || '');
  const [newBatchCode, setNewBatchCode] = useState('');
  const [newExpiryDate, setNewExpiryDate] = useState('');
  const [newManufactureDate, setNewManufactureDate] = useState('');
  const [newImportPrice, setNewImportPrice] = useState(0);
  const [newQuantity, setNewQuantity] = useState(0);

  // Expiry Checker helper
  const getExpiryStatus = (expiryDateStr: string) => {
    const today = new Date();
    const expiry = new Date(expiryDateStr);
    const diffMs = expiry.getTime() - today.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays <= 0) return 'expired';
    if (diffDays <= 90) return 'near_expiry'; // Less than 3 months
    return 'healthy';
  };

  // Capital Valuation Calculation
  const totalStockValuation = simBatches.reduce((sum, b) => {
    const cost = b.importPrice || 10000;
    return sum + cost * b.quantity;
  }, 0);

  const totalQuantity = simBatches.reduce((sum, b) => sum + b.quantity, 0);
  const expiringCount = simBatches.filter(b => getExpiryStatus(b.expiryDate) !== 'healthy').length;

  // Add a new batch (import operation)
  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !newBatchCode.trim() || !newExpiryDate || newQuantity <= 0) {
      alert('Vui lòng điền đầy đủ thông tin mã lô, hạn dùng và số lượng lớn hơn 0!');
      return;
    }

    const prod = simProducts.find(p => p.id === selectedProductId);
    if (!prod) return;

    const newId = `B-${Date.now()}`;
    const batch: InventoryBatch = {
      id: newId,
      productId: selectedProductId,
      batchCode: newBatchCode.trim().toUpperCase(),
      expiryDate: newExpiryDate,
      manufactureDate: newManufactureDate || undefined,
      importPrice: newImportPrice || prod.cost,
      quantity: newQuantity,
      originalQuantity: newQuantity,
      createdAt: new Date().toISOString()
    };

    logOperation('Quản lý kho', 'Nhập lô hàng tồn kho mới', batch);

    // Log the transaction
    const tx: InventoryTransaction = {
      id: `TX-${Date.now()}`,
      transactionNumber: `PNK-${Date.now().toString().slice(-5)}`,
      type: InventoryTransactionType.IMPORT,
      items: [{
        productId: selectedProductId,
        batchCode: batch.batchCode,
        quantity: newQuantity,
        price: batch.importPrice
      }],
      totalAmount: (batch.importPrice || 0) * newQuantity,
      staffId: fbUserProfile?.uid || 'staff-01',
      note: `Nhập tay lô mới ${batch.batchCode}`,
      createdAt: new Date().toISOString()
    };

    setSimBatches(prev => [batch, ...prev]);
    setSimTransactions(prev => [tx, ...prev]);

    // Reset Form
    setNewBatchCode('');
    setNewExpiryDate('');
    setNewManufactureDate('');
    setNewImportPrice(0);
    setNewQuantity(0);
    setAddModalOpen(false);
    triggerBeep(true);
  };

  // Delete/Discard a batch
  const handleDeleteBatch = async (id: string) => {
    const batch = simBatches.find(b => b.id === id);
    if (confirm('Bạn có chắc chắn muốn hủy bỏ lô hàng tồn kho này khỏi danh sách?')) {
      if (batch) {
        logOperation('Quản lý kho', 'Hủy bỏ lô hàng tồn kho', batch);
        setSimBatches(prev => prev.filter(b => b.id !== id));
      }
      triggerBeep(true);
    }
  };

  // Filtered list
  const filteredBatches = simBatches.filter(b => {
    const prod = simProducts.find(p => p.id === b.productId);
    const prodName = prod?.name || '';
    const matchesSearch = prodName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          b.batchCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          prod?.sku.includes(searchQuery);

    const status = getExpiryStatus(b.expiryDate);
    const matchesStatus = statusFilter === 'all' || status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const statusFilters: { id: 'all' | 'expired' | 'near_expiry' | 'healthy'; label: string }[] = [
    { id: 'all', label: 'Tất cả' },
    { id: 'expired', label: 'Hết hạn' },
    { id: 'near_expiry', label: 'Cận hạn' },
    { id: 'healthy', label: 'An toàn' }
  ];

  return (
    <div id="inventory-screen-panel" className="space-y-4 pb-20">

      <div className="flex items-center gap-2">
        <Layers className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-on-surface">{isFnB ? 'Kho nguyên liệu' : 'Kho hàng'}</h2>
      </div>

      {/* Thống kê nhanh */}
      <div className="grid grid-cols-2 gap-3">
        <div className="m3-card p-4 space-y-1">
          <span className="text-sm text-on-surface-variant font-semibold flex items-center gap-1.5">
             Giá trị tồn kho
          </span>
          <span className="text-lg font-bold text-on-surface">{totalStockValuation.toLocaleString('vi-VN')} đ</span>
        </div>
        <div className={`m3-card p-4 space-y-1 ${expiringCount > 0 ? '!bg-error-container' : ''}`}>
          <span className={`text-sm font-semibold flex items-center gap-1.5 ${expiringCount > 0 ? 'text-on-error-container' : 'text-on-surface-variant'}`}>
             Cận hạn / hết hạn
          </span>
          <span className={`text-lg font-bold ${expiringCount > 0 ? 'text-on-error-container' : 'text-on-surface'}`}>{expiringCount} lô</span>
        </div>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={isFnB ? 'Tìm theo tên nguyên liệu hoặc mã lô...' : 'Tìm theo tên sản phẩm hoặc mã lô...'}
          className="m3-input !rounded-full pl-10"
        />
      </div>

      <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-none">
        {statusFilters.map(f => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            className={`m3-chip !rounded-full whitespace-nowrap ${statusFilter === f.id ? 'm3-chip-selected' : ''}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Danh sách lô hàng đang lưu kho */}
      {filteredBatches.length === 0 ? (
        <div className="py-16 text-center text-on-surface-variant flex flex-col items-center justify-center gap-2">
          <Package className="w-8 h-8 text-outline-variant" />
          <p className="text-base font-bold">Không tìm thấy lô hàng nào</p>
          <p className="text-sm">Thử đổi từ khóa hoặc bộ lọc trạng thái hạn dùng.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filteredBatches.map(b => {
            const prod = simProducts.find(p => p.id === b.productId);
            const status = getExpiryStatus(b.expiryDate);
            const ratio = Math.max(0, Math.min(100, (b.quantity / b.originalQuantity) * 100));

            const statusBadge = status === 'expired' ? 'm3-badge-error' : status === 'near_expiry' ? 'm3-badge-warning' : 'm3-badge-success';
            const statusLabel = status === 'expired' ? 'Đã hết hạn' : status === 'near_expiry' ? 'Cận hạn' : 'An toàn';
            const barColor = status === 'expired' ? 'border-l-error' : status === 'near_expiry' ? 'border-l-tertiary' : 'border-l-secondary';
            const meterColor = status === 'expired' ? 'bg-error' : status === 'near_expiry' ? 'bg-tertiary' : 'bg-primary';

            return (
              <div key={b.id} className={`m3-card p-4 border-l-4 ${barColor} space-y-2.5`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-base font-bold text-on-surface truncate">{prod?.name || 'Sản phẩm lỗi'}</h4>
                    <span className="text-sm text-on-surface-variant font-mono">Lô: {b.batchCode}</span>
                  </div>
                  <span className={`m3-badge shrink-0 ${statusBadge}`}>{statusLabel}</span>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-on-surface-variant">
                  <span className="flex items-center gap-1"> HSD: {b.expiryDate}</span>
                  {b.manufactureDate && <span className="flex items-center gap-1"> NSX: {b.manufactureDate}</span>}
                  <span className="font-semibold text-on-surface">{(b.importPrice || 10000).toLocaleString('vi-VN')} đ/{isFnB ? 'đv' : 'sp'}</span>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-sm text-on-surface-variant">
                    <span>Tồn: {b.quantity}/{b.originalQuantity}</span>
                    <span>{Math.round(ratio)}% còn lại</span>
                  </div>
                  <div className="h-1.5 w-full bg-surface-container-high rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${meterColor}`} style={{ width: `${ratio}%` }} />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-base font-bold text-on-surface">{b.quantity} {isFnB ? 'đơn vị' : 'sản phẩm'}</span>
                  <button onClick={() => handleDeleteBatch(b.id)} className="m3-icon-btn hover:text-error" title="Xóa lô hàng lỗi">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Nút nổi nhập kho lô mới */}
      <button
        onClick={() => { setAddModalOpen(true); triggerBeep(true); }}
        className="fixed right-5 bottom-[calc(5.5rem+var(--safe-bottom))] lg:bottom-8 z-30 w-14 h-14 rounded-2xl bg-primary text-on-primary shadow-xl flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
        title={`Nhập kho lô ${isFnB ? 'nguyên liệu' : 'hàng'} mới`}
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Modal nhập kho lô mới */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="m3-card !bg-surface-container-lowest max-w-md w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
              <h3 className="text-base font-bold text-on-surface">
                Khai báo lô {isFnB ? 'nguyên liệu' : 'hàng'} mới
              </h3>
              <button onClick={() => setAddModalOpen(false)} className="m3-icon-btn">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddBatch} className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">
                  {isFnB ? 'Nguyên vật liệu liên kết' : 'Sản phẩm liên kết'}
                </label>
                <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} className="m3-input">
                  {simProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Mã lô nhập</label>
                <input
                  type="text"
                  value={newBatchCode}
                  onChange={(e) => setNewBatchCode(e.target.value)}
                  placeholder="LOT-2026-07A"
                  className="m3-input font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-on-surface-variant">Ngày sản xuất</label>
                  <input
                    type="date"
                    value={newManufactureDate}
                    onChange={(e) => setNewManufactureDate(e.target.value)}
                    className="m3-input"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-on-surface-variant">Hạn sử dụng</label>
                  <input
                    type="date"
                    value={newExpiryDate}
                    onChange={(e) => setNewExpiryDate(e.target.value)}
                    className="m3-input"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-on-surface-variant">Giá nhập (vốn)</label>
                  <input
                    type="number"
                    value={newImportPrice}
                    onChange={(e) => setNewImportPrice(parseInt(e.target.value) || 0)}
                    className="m3-input font-mono"
                    min="0"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-on-surface-variant">Số lượng nhập</label>
                  <input
                    type="number"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(parseInt(e.target.value) || 0)}
                    className="m3-input font-mono"
                    min="1"
                    required
                  />
                </div>
              </div>

              <button type="submit" className="m3-btn-filled w-full !min-h-12 mt-1">
                Nhập kho lô {isFnB ? 'nguyên liệu' : 'hàng'} mới (FIFO/FEFO)
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
