/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDocumentNumber } from '../sync/documentNumbers';
import React, { useState } from 'react';
import { Plus, X, ArrowUpFromLine, FileSpreadsheet } from 'lucide-react';
import { Product, InventoryBatch, InventoryTransaction, InventoryTransactionType } from '../types';
import { exportUnitNote, stockOf, toBaseQuantity, unitChoices } from '../utils/inventoryItems';
import { batchesToCsv, batchTemplateCsv, parseBatchImport, parseProductImport, productsToCsv, productTemplateCsv, transactionsToCsv, type BatchImportItem } from '../utils/inventoryCsv';
import { datedFileName, saveTextFile } from '../utils/downloadFile';
import CsvImportDialog from './CsvImportDialog';
import InventoryCatalog from './InventoryCatalog';
import IngredientDialog from './IngredientDialog';
import PageCard from './ui/PageCard';
import PageTabs from './ui/PageTabs';
import FilterPills from './ui/FilterPills';
import ListToolbar from './ui/ListToolbar';
import DataTable, { RoundThumb, RowActions } from './ui/DataTable';
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
  storeId: string;
  /** Món bán + topping (hiện trong danh mục hàng ở chế độ F&B). */
  menuProducts?: Product[];
  /** Chuyển sang Thực đơn để tạo món / topping mới. */
  onCreateDish?: () => void;
  onCreateTopping?: () => void;
}

const NEW_PRODUCT = '__new__';

/** Lý do xuất kho: 'use' ghi nhận là phiếu xuất; các lý do hao hụt ghi nhận là phiếu điều chỉnh. */
const EXPORT_REASONS: { id: string; label: string; adjustment: boolean }[] = [
  { id: 'use', label: 'Dùng chế biến / bán', adjustment: false },
  { id: 'damaged', label: 'Hư hỏng / vỡ', adjustment: true },
  { id: 'expired', label: 'Hết hạn - hủy bỏ', adjustment: true },
  { id: 'other', label: 'Lý do khác', adjustment: false },
];

export default function InventoryScreen({
  simProducts,
  setSimProducts,
  simBatches,
  setSimBatches,
  simTransactions,
  setSimTransactions,
  triggerBeep,
  fbUserProfile,
  storeId,
  simStoreType = 'fnb',
  menuProducts = [],
  onCreateDish,
  onCreateTopping
}: InventoryScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'expired' | 'near_expiry' | 'healthy'>('all');
  const [addModalOpen, setAddModalOpen] = useState(false);

  const isFnB = simStoreType === 'fnb';

  // F&B có 2 chế độ xem: Hàng hóa (danh mục) và Lô hàng & lịch sử; bán lẻ chỉ có lô hàng
  const [view, setView] = useState<'catalog' | 'batches'>(simStoreType === 'fnb' ? 'catalog' : 'batches');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [csvMenuOpen, setCsvMenuOpen] = useState(false);
  /** Which import dialog is open. */
  const [csvImport, setCsvImport] = useState<'products' | 'batches' | null>(null);
  const [itemDialog, setItemDialog] = useState<{ group: 'ingredient' | 'tool'; item?: Product } | null>(null);
  const [importUnit, setImportUnit] = useState('');

  // Custom batch entry form states
  const [selectedProductId, setSelectedProductId] = useState(simProducts[0]?.id || '');
  const [newBatchCode, setNewBatchCode] = useState('');
  const [newExpiryDate, setNewExpiryDate] = useState('');
  const [newManufactureDate, setNewManufactureDate] = useState('');
  const [newImportPrice, setNewImportPrice] = useState(0);
  const [newQuantity, setNewQuantity] = useState(0);
  // Thêm nguyên liệu / sản phẩm mới ngay trong form nhập lô
  const [newProductName, setNewProductName] = useState('');
  const [newProductUnit, setNewProductUnit] = useState('');

  // Phiếu xuất kho (tự trừ theo FEFO: lô hết hạn sớm nhất xuất trước)
  const [exportOpen, setExportOpen] = useState(false);
  const [exportProductId, setExportProductId] = useState('');
  const [exportQty, setExportQty] = useState(0);
  /** Đơn vị của số lượng xuất; rỗng = đơn vị cơ bản của hàng. */
  const [exportUnit, setExportUnit] = useState('');
  const [exportReason, setExportReason] = useState('use');
  const [exportNote, setExportNote] = useState('');
  const [showHistory, setShowHistory] = useState(false);

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
    const creatingNew = selectedProductId === NEW_PRODUCT || simProducts.length === 0;
    if ((!creatingNew && !selectedProductId) || (creatingNew && !newProductName.trim()) || !newBatchCode.trim() || !newExpiryDate || newQuantity <= 0) {
      alert('Vui lòng điền đầy đủ tên, mã lô, hạn dùng và số lượng lớn hơn 0!');
      return;
    }

    let prod = simProducts.find(p => p.id === selectedProductId);
    if (creatingNew) {
      const stamp = Date.now();
      prod = {
        id: `${isFnB ? 'ING' : 'P'}-${stamp}`,
        sku: `${isFnB ? 'NL' : 'SP'}-${stamp.toString().slice(-6)}`,
        name: newProductName.trim(),
        price: 0,
        cost: newImportPrice || 0,
        category: isFnB ? 'Nguyên liệu' : 'Khác',
        unit: newProductUnit.trim() || undefined,
        isAvailable: true,
        createdAt: new Date().toISOString()
      };
      logOperation('Quản lý kho', isFnB ? 'Thêm nguyên liệu mới' : 'Thêm sản phẩm mới', prod);
      setSimProducts(prev => [prod!, ...prev]);
    }
    if (!prod) return;

    // Nhập theo đơn vị quy đổi (vd Thùng) thì đổi về đơn vị cơ bản (vd Chai) trước khi cộng tồn
    const baseQuantity = toBaseQuantity(prod, importUnit, newQuantity);
    const newId = `B-${Date.now()}`;
    const batch: InventoryBatch = {
      id: newId,
      productId: prod.id,
      batchCode: newBatchCode.trim().toUpperCase(),
      expiryDate: newExpiryDate,
      manufactureDate: newManufactureDate || undefined,
      importPrice: newImportPrice || prod.cost,
      quantity: baseQuantity,
      originalQuantity: baseQuantity,
      createdAt: new Date().toISOString()
    };

    logOperation('Quản lý kho', 'Nhập lô hàng tồn kho mới', batch);

    // Log the transaction
    const importNumber = await createDocumentNumber('import', storeId, () => `PNK-${Date.now().toString().slice(-5)}`);
    const tx: InventoryTransaction = {
      id: `TX-${Date.now()}`,
      transactionNumber: importNumber.number,
      tempCode: importNumber.tempNumber || undefined,
      type: InventoryTransactionType.IMPORT,
      items: [{
        productId: prod.id,
        batchCode: batch.batchCode,
        quantity: baseQuantity,
        price: batch.importPrice
      }],
      totalAmount: (batch.importPrice || 0) * baseQuantity,
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
    setImportUnit('');
    setNewProductName('');
    setNewProductUnit('');
    setSelectedProductId(prod.id);
    setAddModalOpen(false);
    triggerBeep(true);
  };

  // ---- Tệp CSV: xuất danh sách, tải file mẫu, nhập từ file ----
  /**
   * Saves a CSV file for the person and reports a failure.
   *
   * @param prefix Start of the file name.
   * @param content CSV text.
   */
  const downloadCsv = async (prefix: string, content: string) => {
    try {
      await saveTextFile(datedFileName(prefix), content);
    } catch (error) {
      alert(`Không lưu được file: ${(error as Error).message}`);
    }
  };

  /** Adds the goods of a file to the list. */
  const importProducts = async (items: Product[]) => {
    logOperation('Quản lý kho', 'Nhập hàng hóa từ file CSV', { count: items.length });
    setSimProducts(prev => [...items, ...prev]);
    triggerBeep(true);
  };

  /** Adds the batches of a file to stock and writes one import voucher for all of them. */
  const importBatches = async (items: BatchImportItem[]) => {
    const stamp = Date.now();
    const number = await createDocumentNumber('import', storeId, () => `PNK-${stamp.toString().slice(-5)}`);
    const transactionId = `TX-${stamp}-CSV`;
    const batches = items.map(item => ({ ...item.batch, transactionId }));
    logOperation('Quản lý kho', 'Nhập lô hàng từ file CSV', { count: batches.length, transactionId });
    setSimBatches(prev => [...batches, ...prev]);
    setSimTransactions(prev => [{
      id: transactionId,
      transactionNumber: number.number,
      tempCode: number.tempNumber || undefined,
      type: InventoryTransactionType.IMPORT,
      items: batches.map(batch => ({ productId: batch.productId, batchId: batch.id, batchCode: batch.batchCode, quantity: batch.originalQuantity, price: batch.importPrice })),
      totalAmount: batches.reduce((sum, batch) => sum + (batch.importPrice || 0) * batch.originalQuantity, 0),
      staffId: fbUserProfile?.uid || 'staff-01',
      note: `Nhập từ file CSV (${batches.length} lô)`,
      createdAt: new Date().toISOString(),
    }, ...prev]);
    triggerBeep(true);
  };

  // ---- Danh mục hàng: tạo / sửa / xóa nguyên vật liệu, công cụ dụng cụ ----
  const handleSaveItem = async (product: Product, openingStock: number) => {
    const exists = simProducts.some(p => p.id === product.id);
    logOperation('Quản lý kho', exists ? 'Sửa hàng trong kho' : 'Thêm hàng vào kho', product);
    setSimProducts(prev => (exists ? prev.map(p => (p.id === product.id ? product : p)) : [product, ...prev]));
    if (openingStock > 0) {
      const now = Date.now();
      const batch: InventoryBatch = {
        id: `B-${now}`, productId: product.id, batchCode: `TON-DAU-${product.sku}`.toUpperCase(),
        expiryDate: '2099-12-31', importPrice: product.cost, quantity: openingStock, originalQuantity: openingStock,
        createdAt: new Date().toISOString()
      };
      const openingNumber = await createDocumentNumber('import', storeId, () => `PNK-${now.toString().slice(-5)}`);
      const tx: InventoryTransaction = {
        id: `TX-${now}`, transactionNumber: openingNumber.number, tempCode: openingNumber.tempNumber || undefined, type: InventoryTransactionType.IMPORT,
        items: [{ productId: product.id, batchCode: batch.batchCode, quantity: openingStock, price: product.cost }],
        totalAmount: product.cost * openingStock, staffId: fbUserProfile?.uid || 'staff-01', note: 'Tồn kho ban đầu', createdAt: new Date().toISOString()
      };
      setSimBatches(prev => [batch, ...prev]);
      setSimTransactions(prev => [tx, ...prev]);
    }
    triggerBeep(true);
  };

  const handleDeleteItem = (product: Product) => {
    if (stockOf(product.id, simBatches) > 0) {
      alert('Hàng này còn tồn kho. Hãy xuất kho hết hoặc chọn "Ngừng kinh doanh" thay vì xóa.');
      triggerBeep(false);
      return;
    }
    if (!confirm(`Xóa "${product.name}" khỏi danh mục kho?`)) return;
    logOperation('Quản lý kho', 'Xóa hàng khỏi kho', product);
    setSimProducts(prev => prev.filter(p => p.id !== product.id));
    triggerBeep(true);
  };

  // ---- Xuất kho (FEFO) ----
  const fefoPlan = (productId: string, qty: number) => {
    const lots = simBatches
      .filter(b => b.productId === productId && b.quantity > 0)
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
    let remaining = qty;
    const picks: { batch: InventoryBatch; take: number }[] = [];
    for (const lot of lots) {
      if (remaining <= 0) break;
      const take = Math.min(lot.quantity, remaining);
      picks.push({ batch: lot, take });
      remaining -= take;
    }
    const available = lots.reduce((sum, l) => sum + l.quantity, 0);
    return { picks, shortfall: Math.max(0, remaining), available };
  };

  const exportProduct = simProducts.find(p => p.id === exportProductId);
  // Quantity in the base unit: what the FEFO plan and the voucher use, whatever unit the person typed
  const exportBaseQty = exportProduct ? toBaseQuantity(exportProduct, exportUnit, exportQty) : exportQty;
  const exportBaseUnit = exportProduct?.unit || '';
  const exportPlan = exportProductId ? fefoPlan(exportProductId, exportBaseQty) : { picks: [], shortfall: 0, available: 0 };

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exportProductId || exportQty <= 0) {
      alert('Vui lòng chọn hàng cần xuất và nhập số lượng lớn hơn 0!');
      return;
    }
    if (exportPlan.shortfall > 0) {
      const unitSuffix = exportBaseUnit ? ` ${exportBaseUnit}` : '';
      alert(`Tồn kho không đủ: chỉ còn ${exportPlan.available}${unitSuffix}, cần xuất ${exportBaseQty}${unitSuffix}.`);
      return;
    }
    const reason = EXPORT_REASONS.find(r => r.id === exportReason) || EXPORT_REASONS[0];
    const takeByBatch = new Map(exportPlan.picks.map(p => [p.batch.id, p.take]));
    const now = Date.now();
    const exportNumber = await createDocumentNumber('export', storeId, () => `PXK-${now.toString().slice(-5)}`);
    const tx: InventoryTransaction = {
      id: `TX-${now}`,
      transactionNumber: exportNumber.number,
      tempCode: exportNumber.tempNumber || undefined,
      type: reason.adjustment ? InventoryTransactionType.ADJUSTMENT : InventoryTransactionType.EXPORT,
      items: exportPlan.picks.map(p => ({
        productId: exportProductId,
        batchCode: p.batch.batchCode,
        quantity: p.take,
        price: p.batch.importPrice
      })),
      totalAmount: exportPlan.picks.reduce((sum, p) => sum + (p.batch.importPrice || 0) * p.take, 0),
      staffId: fbUserProfile?.uid || 'staff-01',
      note: [reason.label, exportNote.trim(), exportProduct ? exportUnitNote(exportProduct, exportUnit, exportQty) : ''].filter(Boolean).join(' - '),
      createdAt: new Date().toISOString()
    };
    logOperation('Quản lý kho', 'Xuất kho', tx);
    setSimBatches(prev => prev.map(b => (takeByBatch.has(b.id) ? { ...b, quantity: b.quantity - (takeByBatch.get(b.id) || 0) } : b)));
    setSimTransactions(prev => [tx, ...prev]);
    setExportOpen(false);
    setExportQty(0);
    setExportUnit('');
    setExportNote('');
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
      <PageCard title={isFnB ? 'Quản lý kho nguyên vật liệu (FIFO/FEFO)' : 'Quản lý kho hàng'}>

      <div className="flex items-center justify-end gap-2 flex-wrap">

        {isFnB && (
          <div className="relative">
            <button onClick={() => setAddMenuOpen(v => !v)} className="m3-btn-filled !min-h-11 text-sm"><Plus className="w-4 h-4" /> Thêm mới ▾</button>
            {addMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setAddMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-40 w-56 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg overflow-hidden">
                  {[
                    ['+ Nguyên vật liệu', () => setItemDialog({ group: 'ingredient' })],
                    ['+ Công cụ dụng cụ', () => setItemDialog({ group: 'tool' })],
                    ['+ Món', () => onCreateDish?.()],
                    ['+ Topping', () => onCreateTopping?.()],
                  ].map(([label, fn]) => (
                    <button key={label as string} onClick={() => { setAddMenuOpen(false); (fn as () => void)(); }}
                      className="w-full text-left px-4 py-3 text-base font-semibold hover:bg-surface-container cursor-pointer">{label as string}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="relative">
          <button onClick={() => setCsvMenuOpen(v => !v)} className="m3-btn-outlined !min-h-11 text-sm"><FileSpreadsheet className="w-4 h-4" /> Tệp CSV ▾</button>
          {csvMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setCsvMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-40 w-64 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg overflow-hidden">
                {([
                  ['Xuất', null],
                  ...(isFnB ? [['Danh mục hàng', () => downloadCsv('kho-hang-hoa', productsToCsv(simProducts, simBatches))]] : []),
                  ['Tồn kho theo lô', () => downloadCsv('kho-ton-theo-lo', batchesToCsv(simBatches, simProducts))],
                  ['Lịch sử phiếu kho', () => downloadCsv('kho-lich-su-phieu', transactionsToCsv(simTransactions, simProducts))],
                  ['Tải file mẫu', null],
                  ...(isFnB ? [['Mẫu nhập hàng hóa', () => downloadCsv('mau-nhap-hang-hoa', productTemplateCsv())]] : []),
                  ['Mẫu nhập lô hàng', () => downloadCsv('mau-nhap-lo-hang', batchTemplateCsv())],
                  ['Nhập từ file', null],
                  ...(isFnB ? [['Nhập hàng hóa từ file', () => setCsvImport('products')]] : []),
                  ['Nhập lô hàng từ file', () => setCsvImport('batches')],
                ] as Array<[string, (() => void) | null]>).map(([label, action]) => (
                  action === null
                    ? <p key={label} className="px-4 pt-3 pb-1 text-xs font-bold uppercase text-on-surface-variant">{label}</p>
                    : <button key={label} onClick={() => { setCsvMenuOpen(false); action(); }} className="w-full text-left px-4 py-2.5 text-base font-semibold hover:bg-surface-container cursor-pointer">{label}</button>
                ))}
              </div>
            </>
          )}
        </div>

        <button onClick={() => { setAddModalOpen(true); triggerBeep(true); }} className="m3-btn-outlined !min-h-11 text-sm">
          <Plus className="w-4 h-4" /> Nhập kho
        </button>
        <button
          onClick={() => { setExportProductId(simProducts.find(p => simBatches.some(b => b.productId === p.id && b.quantity > 0))?.id || ''); setExportQty(0); setExportUnit(''); setExportReason('use'); setExportNote(''); setExportOpen(true); triggerBeep(true); }}
          className="m3-btn-tonal !min-h-11 text-sm"
        >
          <ArrowUpFromLine className="w-4 h-4" /> Xuất kho
        </button>
      </div>

      {isFnB && (
        <PageTabs options={[{ value: 'catalog', label: 'Hàng hóa' }, { value: 'batches', label: 'Lô hàng & Lịch sử' }]} value={view} onChange={setView} />
      )}

      {isFnB && view === 'catalog' && (
        <InventoryCatalog
          items={simProducts}
          dishes={menuProducts}
          batches={simBatches}
          onEdit={(p) => setItemDialog({ group: p.itemGroup === 'tool' ? 'tool' : 'ingredient', item: p })}
          onDelete={handleDeleteItem}
        />
      )}

      {view === 'batches' && (
      <>
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

      <ListToolbar
        filters={<FilterPills options={statusFilters.map(f => ({ value: f.id, label: f.label }))} value={statusFilter} onChange={setStatusFilter} />}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={isFnB ? 'Tìm theo tên nguyên liệu hoặc mã lô...' : 'Tìm theo tên sản phẩm hoặc mã lô...'}
      />

      <DataTable
        rows={filteredBatches}
        rowKey={b => b.id}
        emptyMessage="Không tìm thấy lô hàng nào"
        columns={[
          { key: 'image', header: 'Ảnh', className: 'w-16', render: b => { const prod = simProducts.find(p => p.id === b.productId); return <RoundThumb imageUrl={prod?.imageUrl} name={prod?.name || '?'} />; } },
          { key: 'sku', header: isFnB ? 'Mã NVL' : 'Mã SP', render: b => <span className="font-mono">{simProducts.find(p => p.id === b.productId)?.sku}</span> },
          { key: 'name', header: isFnB ? 'Tên NVL' : 'Tên sản phẩm', render: b => <span className="font-semibold">{simProducts.find(p => p.id === b.productId)?.name || 'Sản phẩm lỗi'}</span> },
          { key: 'status', header: 'Trạng thái', render: b => {
            const status = getExpiryStatus(b.expiryDate);
            const badge = status === 'expired' ? 'm3-badge-error' : status === 'near_expiry' ? 'm3-badge-warning' : 'm3-badge-success';
            return <span className={`m3-badge ${badge}`}>{status === 'expired' ? 'Đã hết hạn' : status === 'near_expiry' ? 'Cận hạn' : 'An toàn'}</span>;
          } },
          { key: 'batch', header: 'Lô', render: b => <span className="font-mono">{b.batchCode}</span> },
          { key: 'mfg', header: 'NSX', render: b => b.manufactureDate || '' },
          { key: 'exp', header: 'HSD', render: b => b.expiryDate },
          { key: 'price', header: 'Giá nhập (đ)', className: 'text-right', render: b => (b.importPrice || 10000).toLocaleString('vi-VN') },
          { key: 'qty', header: 'SL nhập/Tồn', className: 'text-right', render: b => `${b.originalQuantity}/${b.quantity}` },
        ]}
        renderActions={b => <RowActions onDelete={() => handleDeleteBatch(b.id)} deleteLabel="Xóa lô hàng lỗi" />}
      />

      </>
      )}
      </PageCard>

      {/* Nút nổi nhập kho lô mới (chỉ ở chế độ xem lô hàng) */}
      {view === 'batches' && <button
        onClick={() => { setAddModalOpen(true); triggerBeep(true); }}
        className="fixed right-5 bottom-[calc(5.5rem+var(--safe-bottom))] lg:bottom-8 z-30 w-14 h-14 rounded-2xl bg-primary text-on-primary shadow-xl flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
        title={`Nhập kho lô ${isFnB ? 'nguyên liệu' : 'hàng'} mới`}
      >
        <Plus className="w-6 h-6" />
      </button>}

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
                <select
                  value={simProducts.length === 0 ? NEW_PRODUCT : selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="m3-input"
                >
                  {simProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                  <option value={NEW_PRODUCT}>+ Thêm {isFnB ? 'nguyên liệu' : 'sản phẩm'} mới...</option>
                </select>
              </div>

              {(selectedProductId === NEW_PRODUCT || simProducts.length === 0) && (
                <div className="grid grid-cols-3 gap-3 p-3 bg-surface-container rounded-2xl">
                  <div className="col-span-2 space-y-1">
                    <label className="text-sm font-semibold text-on-surface-variant">Tên {isFnB ? 'nguyên liệu' : 'sản phẩm'} mới</label>
                    <input
                      type="text"
                      value={newProductName}
                      onChange={(e) => setNewProductName(e.target.value)}
                      placeholder={isFnB ? 'Ví dụ: Sữa tươi' : 'Ví dụ: Nước mắm'}
                      className="m3-input"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-on-surface-variant">Đơn vị</label>
                    <input
                      type="text"
                      value={newProductUnit}
                      onChange={(e) => setNewProductUnit(e.target.value)}
                      placeholder="kg, lít..."
                      className="m3-input"
                    />
                  </div>
                </div>
              )}

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
                    onChange={(e) => setNewQuantity(parseFloat(e.target.value) || 0)}
                    className="m3-input font-mono"
                    min="0"
                    step="any"
                    required
                  />
                  {(() => {
                    const chosen = simProducts.find(p => p.id === selectedProductId);
                    const choices = chosen ? unitChoices(chosen) : [];
                    if (choices.length < 2) return null;
                    return (
                      <div className="space-y-1 pt-1">
                        <select value={importUnit || chosen!.unit || ''} onChange={(e) => setImportUnit(e.target.value)} className="m3-input !min-h-10 text-sm" aria-label="Đơn vị nhập">
                          {choices.map(c => <option key={c.name} value={c.name}>{c.name}{c.ratio !== 1 ? ` (= ${c.ratio} ${chosen!.unit})` : ''}</option>)}
                        </select>
                        {newQuantity > 0 && <p className="text-sm text-on-surface-variant">= {toBaseQuantity(chosen!, importUnit || chosen!.unit || '', newQuantity).toLocaleString('vi-VN')} {chosen!.unit}</p>}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <button type="submit" className="m3-btn-filled w-full !min-h-12 mt-1">
                Nhập kho lô {isFnB ? 'nguyên liệu' : 'hàng'} mới (FIFO/FEFO)
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Lịch sử nhập / xuất kho */}
      {view === 'batches' && (
      <div className="m3-card p-4 space-y-2">
        <button onClick={() => setShowHistory(v => !v)} className="w-full flex items-center justify-between text-left cursor-pointer">
          <span className="text-base font-bold text-on-surface">Lịch sử nhập / xuất kho ({simTransactions.length})</span>
          <span className="text-sm font-bold text-primary">{showHistory ? 'Thu gọn' : 'Xem'}</span>
        </button>
        {showHistory && (simTransactions.length === 0 ? (
          <p className="text-sm text-on-surface-variant py-2">Chưa có phiếu nhập / xuất nào.</p>
        ) : (
          <div className="divide-y divide-outline-variant/60">
            {simTransactions.slice(0, 30).map(t => (
              <div key={t.id} className="py-2.5 flex items-start gap-3">
                <span className={`m3-badge shrink-0 ${t.type === InventoryTransactionType.IMPORT ? 'm3-badge-success' : t.type === InventoryTransactionType.EXPORT ? 'bg-primary-container text-on-primary-container' : 'm3-badge-warning'}`}>
                  {t.type === InventoryTransactionType.IMPORT ? 'Nhập' : t.type === InventoryTransactionType.EXPORT ? 'Xuất' : 'Điều chỉnh'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-on-surface font-mono">{t.transactionNumber}</p>
                  <p className="text-sm text-on-surface-variant truncate">
                    {t.items.map(i => `${simProducts.find(p => p.id === i.productId)?.name || 'Hàng'} x${i.quantity}`).join(', ')}
                  </p>
                  {t.note && <p className="text-sm text-on-surface-variant truncate">{t.note}</p>}
                </div>
                <span className="text-sm text-on-surface-variant shrink-0">{new Date(t.createdAt).toLocaleDateString('vi-VN')}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      )}

      {itemDialog && (
        <IngredientDialog
          item={itemDialog.item}
          group={itemDialog.group}
          allItems={simProducts}
          currentStock={itemDialog.item ? stockOf(itemDialog.item.id, simBatches) : 0}
          onSave={handleSaveItem}
          onClose={() => setItemDialog(null)}
        />
      )}

      {csvImport === 'products' && (
        <CsvImportDialog<Product>
          title="Nhập hàng hóa từ file CSV"
          instructions="Chỉ thêm hàng mới. Mã hàng đã có sẽ báo lỗi. Tải file mẫu, điền từ dòng dưới tiêu đề, lưu dạng CSV UTF-8 rồi chọn file."
          onDownloadTemplate={() => void downloadCsv('mau-nhap-hang-hoa', productTemplateCsv())}
          parse={text => parseProductImport(text, simProducts)}
          previewHeaders={['Mã hàng', 'Tên hàng', 'Nhóm quản lý', 'Đơn vị', 'Giá vốn']}
          previewRow={p => [p.sku, p.name, p.itemGroup === 'tool' ? 'Công cụ dụng cụ' : 'Nguyên vật liệu', p.unit ?? '', p.cost.toLocaleString('vi-VN')]}
          onConfirm={importProducts}
          onClose={() => setCsvImport(null)}
        />
      )}

      {csvImport === 'batches' && (
        <CsvImportDialog<BatchImportItem>
          title="Nhập lô hàng từ file CSV"
          instructions="Mỗi dòng là một lô nhập kho; mã hàng phải đã có trong danh mục. Cả file được ghi thành một phiếu nhập. Tải file mẫu, điền từ dòng dưới tiêu đề, lưu dạng CSV UTF-8 rồi chọn file."
          onDownloadTemplate={() => void downloadCsv('mau-nhap-lo-hang', batchTemplateCsv())}
          parse={text => parseBatchImport(text, simProducts, simBatches)}
          previewHeaders={['Mã hàng', 'Mã lô', 'Hạn sử dụng', 'Số lượng nhập', 'Giá nhập']}
          previewRow={item => [
            simProducts.find(p => p.id === item.batch.productId)?.sku ?? '', item.batch.batchCode, item.batch.expiryDate,
            `${item.typedQuantity.toLocaleString('vi-VN')} ${item.typedUnit}`.trim(), (item.batch.importPrice ?? 0).toLocaleString('vi-VN'),
          ]}
          onConfirm={importBatches}
          onClose={() => setCsvImport(null)}
        />
      )}

      {/* Modal xuất kho */}
      {exportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="m3-card !bg-surface-container-lowest max-w-md w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
              <h3 className="text-base font-bold text-on-surface">Tạo phiếu xuất kho</h3>
              <button onClick={() => setExportOpen(false)} className="m3-icon-btn"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleExport} className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">{isFnB ? 'Nguyên vật liệu cần xuất' : 'Sản phẩm cần xuất'}</label>
                <select value={exportProductId} onChange={(e) => { setExportProductId(e.target.value); setExportUnit(''); }} className="m3-input" required>
                  <option value="" disabled>Chọn...</option>
                  {simProducts.filter(p => simBatches.some(b => b.productId === p.id && b.quantity > 0)).map(p => (
                    <option key={p.id} value={p.id}>{p.name} (tồn {simBatches.filter(b => b.productId === p.id).reduce((s, b) => s + b.quantity, 0)})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-on-surface-variant">Số lượng xuất</label>
                  <input type="number" min="1" value={exportQty || ''} onChange={(e) => setExportQty(parseInt(e.target.value) || 0)} className="m3-input font-mono" required />
                  {exportProduct && unitChoices(exportProduct).length > 1 && (
                    <select value={exportUnit || exportProduct.unit || ''} onChange={(e) => setExportUnit(e.target.value)} className="m3-input !min-h-10 text-sm" aria-label="Đơn vị xuất">
                      {unitChoices(exportProduct).map(u => <option key={u.name} value={u.name}>{u.name}{u.ratio !== 1 ? ` (= ${u.ratio} ${exportProduct.unit || ''})` : ''}</option>)}
                    </select>
                  )}
                  {exportProduct && exportQty > 0 && exportBaseQty !== exportQty && (
                    <p className="text-sm text-on-surface-variant">= {exportBaseQty.toLocaleString('vi-VN')} {exportBaseUnit}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-on-surface-variant">Lý do</label>
                  <select value={exportReason} onChange={(e) => setExportReason(e.target.value)} className="m3-input">
                    {EXPORT_REASONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Ghi chú (tùy chọn)</label>
                <input type="text" value={exportNote} onChange={(e) => setExportNote(e.target.value)} className="m3-input" />
              </div>

              {exportProductId && exportQty > 0 && (
                <div className={`p-3 rounded-2xl text-sm space-y-1 ${exportPlan.shortfall > 0 ? 'bg-error-container text-on-error-container' : 'bg-surface-container text-on-surface'}`}>
                  {exportPlan.shortfall > 0 ? (
                    <p className="font-bold">Tồn kho không đủ: còn {exportPlan.available} {exportBaseUnit}, thiếu {exportPlan.shortfall} {exportBaseUnit}.</p>
                  ) : (
                    <>
                      <p className="font-bold">Hệ thống tự trừ theo FEFO (hết hạn trước xuất trước):</p>
                      {exportPlan.picks.map(p => (
                        <p key={p.batch.id}>Lô {p.batch.batchCode} (HSD {p.batch.expiryDate}): trừ {p.take} {exportBaseUnit}</p>
                      ))}
                    </>
                  )}
                </div>
              )}

              <button type="submit" disabled={exportPlan.shortfall > 0 || exportQty <= 0 || !exportProductId} className="m3-btn-filled w-full !min-h-12 mt-1 disabled:opacity-40">
                Xác nhận xuất kho
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
