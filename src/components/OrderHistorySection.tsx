/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { Order, InventoryBatch, Customer } from '../types';
import ReceiptThermal from './ReceiptThermal';
import { logOperation } from '../utils/logger';
import { PAYMENT_LABELS, getOrderPayments } from '../utils/payments';
import PageCard from './ui/PageCard';
import FilterPills from './ui/FilterPills';
import DataTable from './ui/DataTable';

interface OrderHistorySectionProps {
  simOrders: Order[];
  setSimOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  simBatches: InventoryBatch[];
  setSimBatches: React.Dispatch<React.SetStateAction<InventoryBatch[]>>;
  simCustomers: Customer[];
  setSimCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  simStoreType: 'fnb' | 'retail';
  simUserRole: 'admin' | 'staff';
  triggerBeep: (success: boolean) => void;
  fbStoreProfile: any;
  fbUserProfile: any;
}

export default function OrderHistorySection({
  simOrders,
  setSimOrders,
  simBatches,
  setSimBatches,
  simCustomers,
  setSimCustomers,
  simStoreType,
  simUserRole,
  triggerBeep,
  fbStoreProfile,
  fbUserProfile
}: OrderHistorySectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'void'>('all');
  const [reprintOrder, setReprintOrder] = useState<Order | null>(null);
  const [selectedId, setSelectedId] = useState('');

  const canVoid = simUserRole === 'admin';

  const filteredOrders = simOrders.filter(o => {
    const term = searchQuery.toLowerCase().trim();
    const matchesSearch = !term
      || o.orderNumber.toLowerCase().includes(term)
      || (o.customerName || '').toLowerCase().includes(term)
      || (o.staffName || '').toLowerCase().includes(term)
      || (o.tableNumber || '').toLowerCase().includes(term);
    const status = o.status || 'completed';
    const matchesStatus = statusFilter === 'all' || status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleVoidOrder = (order: Order) => {
    if (!canVoid) return;
    if ((order.status || 'completed') === 'void') return;
    if (!confirm(`Bạn có chắc muốn HỦY hóa đơn "${order.orderNumber}"?\n\nHệ thống sẽ hoàn lại tồn kho (nếu là bán lẻ) và trừ lại điểm tích lũy đã cộng cho khách.`)) return;

    logOperation('Lịch sử hóa đơn', 'Hủy hóa đơn', order);

    // Hoàn tồn kho cho các dòng có lô hàng (bán lẻ)
    if (simStoreType === 'retail') {
      setSimBatches(prev => prev.map(b => {
        const restored = order.items.find(it => it.batchId === b.id);
        if (restored) {
          return { ...b, quantity: b.quantity + restored.quantity };
        }
        return b;
      }));
    }

    // Trừ lại điểm tích lũy đã cộng cho khách
    if (order.customerId && order.customerPointsEarned) {
      setSimCustomers(prev => prev.map(c => (
        c.id === order.customerId
          ? { ...c, points: Math.max(0, c.points - (order.customerPointsEarned || 0)) }
          : c
      )));
    }

    setSimOrders(prev => prev.map(o => (o.id === order.id ? { ...o, status: 'void' } : o)));
    triggerBeep(true);
  };

  const statusFilters: { id: 'all' | 'completed' | 'void'; label: string }[] = [
    { id: 'all', label: 'Tất cả' },
    { id: 'completed', label: 'Hoàn tất' },
    { id: 'void', label: 'Đã hủy' }
  ];

  const selectedOrder = filteredOrders.find(o => o.id === selectedId) || filteredOrders[0];
  const selectedVoid = (selectedOrder?.status || 'completed') === 'void';
  const infoLabel = 'text-sm font-bold text-on-surface';
  const infoValue = 'text-sm text-on-surface-variant';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(20rem,26rem)_1fr] gap-4 items-start">
      <PageCard title="Lịch sử hóa đơn">
        <div className="relative">
          <Search className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm số hóa đơn, khách, thu ngân, số bàn..."
            className="m3-input !min-h-11 !rounded-xl pl-10"
          />
        </div>
        <FilterPills options={statusFilters.map(f => ({ value: f.id, label: f.label }))} value={statusFilter} onChange={setStatusFilter} />

        <div className="space-y-3 lg:max-h-[calc(100dvh-16rem)] overflow-y-auto pr-1">
          {filteredOrders.length === 0 && <p className="py-10 text-center text-base font-semibold text-on-surface-variant">Không tìm thấy hóa đơn nào</p>}
          {filteredOrders.map(o => {
            const isVoid = (o.status || 'completed') === 'void';
            const selected = o.id === selectedOrder?.id;
            return (
              <button
                key={o.id}
                onClick={() => setSelectedId(o.id)}
                className={`w-full text-left rounded-xl border p-3 space-y-1.5 cursor-pointer transition-colors ${
                  selected ? 'bg-primary border-primary text-on-primary' : 'border-primary/60 hover:bg-primary-container/40 text-on-surface'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className={`text-lg font-bold ${isVoid ? 'line-through' : ''}`}>#{o.orderNumber}</span>
                  <span className={`m3-badge ${isVoid ? 'm3-badge-error' : 'm3-badge-success'}`}>{isVoid ? 'Đã hủy' : 'Hoàn thành'}</span>
                </span>
                <span className="block text-sm">{o.tableNumber || o.customerName || 'Khách vãng lai'}</span>
                <span className="block text-sm">{new Date(o.createdAt).toLocaleString('vi-VN')}{o.staffName ? ` - Bởi ${o.staffName}` : ''}</span>
                <span className="flex items-center justify-between text-lg font-bold"><span>Tổng</span><span>{o.totalAmount.toLocaleString('vi-VN')}đ</span></span>
              </button>
            );
          })}
        </div>
      </PageCard>

      <PageCard
        title="Chi tiết hóa đơn"
        headerRight={selectedOrder && (
          <div className="flex items-center gap-2">
            <button onClick={() => setReprintOrder(selectedOrder)} className="m3-btn-filled !min-h-10 !rounded-xl !px-5 text-sm">In phiếu</button>
            {canVoid && !selectedVoid && (
              <button onClick={() => handleVoidOrder(selectedOrder)} className="m3-btn-danger !min-h-10 !rounded-xl !px-5 text-sm">Hủy phiếu</button>
            )}
          </div>
        )}
      >
        {!selectedOrder ? (
          <p className="py-16 text-center text-base font-semibold text-on-surface-variant">Chọn một hóa đơn để xem chi tiết</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 rounded-xl bg-surface-container-low p-4">
              <div><p className={infoLabel}>Số hóa đơn</p><p className={infoValue}>#{selectedOrder.orderNumber}</p></div>
              <div><p className={infoLabel}>Phương thức thanh toán</p>
                <p className={infoValue}>{getOrderPayments(selectedOrder).map(p => `${PAYMENT_LABELS[p.method]} ${p.amount.toLocaleString('vi-VN')}đ`).join(' + ')}</p></div>
              <div><p className={infoLabel}>Ngày</p><p className={infoValue}>{new Date(selectedOrder.createdAt).toLocaleString('vi-VN')}</p></div>
              <div><p className={infoLabel}>Thu ngân</p><p className={infoValue}>{selectedOrder.staffName || '—'}</p></div>
              <div><p className={infoLabel}>Bàn ăn</p><p className={infoValue}>{selectedOrder.tableNumber || '—'}</p></div>
              <div><p className={infoLabel}>Hình thức</p><p className={infoValue}>{selectedOrder.orderType === 'takeaway' ? 'Mang về' : selectedOrder.tableNumber ? 'Ăn tại bàn' : 'Bán trực tiếp'}</p></div>
              <div><p className={infoLabel}>Khách hàng</p><p className={infoValue}>{selectedOrder.customerName || 'Khách vãng lai'}</p></div>
              {selectedVoid && <div><p className={infoLabel}>Trạng thái</p><p className="text-sm font-bold text-error">Đã hủy</p></div>}
            </div>

            <DataTable
              rows={selectedOrder.items}
              rowKey={item => `${item.productId}-${item.size || ''}-${item.note || ''}-${item.price}`}
              emptyMessage="Hóa đơn không có món"
              columns={[
                { key: 'name', header: 'Tên món', render: item => {
                  const options = [item.size && `Size ${item.size}`, item.sugarLevel && `Đường ${item.sugarLevel}`, item.iceLevel && `Đá ${item.iceLevel}`, item.note, ...(item.toppings || []).map(t => `+ ${t.name}`)].filter(Boolean).join(' · ');
                  return <div><span>{item.name}</span>{options && <span className="block text-sm text-on-surface-variant">Tùy chọn: {options}</span>}</div>;
                } },
                { key: 'price', header: 'Đơn giá', className: 'text-right', render: item => item.price.toLocaleString('vi-VN') },
                { key: 'qty', header: 'SL', className: 'text-right', render: item => item.quantity },
                { key: 'total', header: 'Thành tiền', className: 'text-right', render: item => (item.price * item.quantity).toLocaleString('vi-VN') },
              ]}
            />
            <div className="flex items-center justify-between border-t-2 border-outline-variant pt-3 text-lg font-bold">
              <span>Tổng</span>
              <span className="text-primary">{selectedOrder.totalAmount.toLocaleString('vi-VN')}đ</span>
            </div>
          </>
        )}
      </PageCard>

      {reprintOrder && (
        <ReceiptThermal
          order={reprintOrder}
          storeInfo={{
            name: fbStoreProfile?.name || 'SmartPOS Coffee Shop',
            address: fbStoreProfile?.address || '123 Đường Lê Lợi, TP. HCM',
            phone: fbStoreProfile?.phone || '0901234567',
            storeType: simStoreType
          }}
          staffName={reprintOrder.staffName || fbUserProfile?.name || 'Thu Ngân'}
          onClose={() => { setReprintOrder(null); triggerBeep(true); }}
        />
      )}
    </div>
  );
}
