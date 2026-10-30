/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { KitchenItem, KitchenStatus } from '../types';
import PageCard from './ui/PageCard';
import PageTabs from './ui/PageTabs';
import FilterPills from './ui/FilterPills';
import DataTable, { DataTableColumn } from './ui/DataTable';

interface KitchenDisplayProps {
  simKitchenItems: KitchenItem[];
  setSimKitchenItems: React.Dispatch<React.SetStateAction<KitchenItem[]>>;
  triggerBeep: (success: boolean) => void;
  isOffline?: boolean;
  storeId?: string;
}

const STATUS_STYLES: Record<KitchenStatus, { badge: string; label: string }> = {
  [KitchenStatus.PENDING]: { badge: 'm3-badge-error', label: 'Chờ làm' },
  [KitchenStatus.PREPARING]: { badge: 'm3-badge-warning', label: 'Đang nấu' },
  [KitchenStatus.COMPLETED]: { badge: 'bg-primary-container text-on-primary-container', label: 'Xong, chờ bưng' },
  [KitchenStatus.SERVED]: { badge: 'm3-badge-success', label: 'Đã lên bàn' },
  [KitchenStatus.CANCELLED]: { badge: 'm3-badge-error', label: 'Đã hủy' }
};

/** Label of the button that moves an item to its next status; absent when the item is closed. */
const NEXT_ACTION_LABEL: Partial<Record<KitchenStatus, string>> = {
  [KitchenStatus.PENDING]: 'Làm món',
  [KitchenStatus.PREPARING]: 'Xong',
  [KitchenStatus.COMPLETED]: 'Đã bưng'
};

/** The two ways the kitchen list can be grouped. */
type KitchenView = 'byDish' | 'byTable';

export default function KitchenDisplay({
  simKitchenItems,
  setSimKitchenItems,
  triggerBeep
}: KitchenDisplayProps) {
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [view, setView] = useState<KitchenView>('byDish');
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Real-time ticking clock for calculating cooking duration since order creation
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 15000); // update every 15s
    return () => clearInterval(interval);
  }, []);

  // Compute minutes elapsed
  const getElapsedMinutes = (createdAtStr: string) => {
    const elapsedMs = currentTime.getTime() - new Date(createdAtStr).getTime();
    const elapsedMins = Math.max(0, Math.floor(elapsedMs / 1000 / 60));
    return elapsedMins;
  };

  // Status transitions: pending -> preparing -> completed -> served
  const handleUpdateStatus = (itemId: string, currentStatus: KitchenStatus) => {
    let nextStatus: KitchenStatus;
    if (currentStatus === KitchenStatus.PENDING) {
      nextStatus = KitchenStatus.PREPARING;
    } else if (currentStatus === KitchenStatus.PREPARING) {
      nextStatus = KitchenStatus.COMPLETED;
    } else if (currentStatus === KitchenStatus.COMPLETED) {
      nextStatus = KitchenStatus.SERVED;
    } else {
      return;
    }

    setSimKitchenItems(prev => prev.map(item => (item.id === itemId ? { ...item, status: nextStatus } : item)));
    triggerBeep(true);
  };

  const isClosed = (s: KitchenStatus) => s === KitchenStatus.SERVED || s === KitchenStatus.CANCELLED;

  const handleClearServed = () => {
    if (confirm('Bạn có muốn xóa các món đã phục vụ xong và các món đã hủy ra khỏi hàng đợi bếp?')) {
      setSimKitchenItems(prev => prev.filter(item => !isClosed(item.status)));
      triggerBeep(true);
    }
  };

  const filteredItems = simKitchenItems.filter(item => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'active') return !isClosed(item.status);
    return item.status === filterStatus;
  });

  const statusFilters: { id: string; label: string }[] = [
    { id: 'active', label: `Đang hoạt động (${simKitchenItems.filter(i => !isClosed(i.status)).length})` },
    { id: KitchenStatus.PENDING, label: `Chờ làm (${simKitchenItems.filter(i => i.status === KitchenStatus.PENDING).length})` },
    { id: KitchenStatus.PREPARING, label: `Đang làm (${simKitchenItems.filter(i => i.status === KitchenStatus.PREPARING).length})` },
    { id: KitchenStatus.COMPLETED, label: `Chờ phục vụ (${simKitchenItems.filter(i => i.status === KitchenStatus.COMPLETED).length})` },
    { id: KitchenStatus.CANCELLED, label: `Đã hủy (${simKitchenItems.filter(i => i.status === KitchenStatus.CANCELLED).length})` },
    { id: 'all', label: `Tất cả (${simKitchenItems.length})` }
  ];

  /** Table label shown for an item ("Mang đi" when it has no table). */
  const tableLabel = (item: KitchenItem) => item.tableNumber || 'Mang đi';

  /** Columns of the item tables; the table column is only needed when items are not grouped by table. */
  const buildColumns = (showTable: boolean): DataTableColumn<KitchenItem>[] => {
    const columns: DataTableColumn<KitchenItem>[] = [
      {
        key: 'dish',
        header: 'Món',
        render: item => (
          <div>
            <p className={`font-semibold ${isClosed(item.status) ? 'line-through text-on-surface-variant' : ''}`}>{item.productName}</p>
            <p className="text-sm text-on-surface-variant">{new Date(item.createdAt).toLocaleString('vi-VN')}</p>
          </div>
        ),
      },
      {
        key: 'note',
        header: 'Ghi chú',
        render: item => {
          const options = [
            item.size && `Size ${item.size}`,
            item.sugarLevel && `Đường ${item.sugarLevel}`,
            item.iceLevel && `Đá ${item.iceLevel}`,
          ].filter(Boolean).join(' · ');
          return (
            <div className="text-sm space-y-0.5">
              {options && <p>{options}</p>}
              {item.toppings && <p className="font-bold text-primary">+ {item.toppings}</p>}
              {item.note && <p className="text-on-surface-variant">{item.note}</p>}
            </div>
          );
        },
      },
    ];
    if (showTable) {
      columns.push({
        key: 'table',
        header: 'Bàn',
        render: item => {
          const mins = getElapsedMinutes(item.createdAt);
          const isLate = mins >= 10 && !isClosed(item.status);
          return (
            <div>
              <p className="font-semibold">{tableLabel(item)}</p>
              <p className={`text-sm ${isLate ? 'text-error font-bold' : 'text-on-surface-variant'}`}>
                {mins} phút trước{isLate ? ' · Quá giờ' : ''}
              </p>
            </div>
          );
        },
      });
    }
    columns.push(
      { key: 'quantity', header: 'Số lượng', className: 'text-center', render: item => item.quantity },
      {
        key: 'status',
        header: 'Trạng thái',
        render: item => <span className={`m3-badge ${STATUS_STYLES[item.status].badge}`}>{STATUS_STYLES[item.status].label}</span>,
      },
      {
        key: 'action',
        header: '',
        className: 'text-right w-32',
        render: item => NEXT_ACTION_LABEL[item.status] ? (
          <button type="button" onClick={() => handleUpdateStatus(item.id, item.status)} className="m3-btn-filled !min-h-9 !px-4 text-sm">
            {NEXT_ACTION_LABEL[item.status]}
          </button>
        ) : null,
      },
    );
    return columns;
  };

  /** Items of the current filter grouped by table, in order of first appearance. */
  const itemsByTable = filteredItems.reduce<Map<string, KitchenItem[]>>((groups, item) => {
    const key = tableLabel(item);
    groups.set(key, [...(groups.get(key) || []), item]);
    return groups;
  }, new Map());

  return (
    <div id="kitchen-display-system">
      <PageCard
        title="Màn hình bếp"
        headerRight={
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm text-on-surface-variant font-mono font-bold">{currentTime.toLocaleTimeString('vi-VN')}</span>
            <button type="button" onClick={handleClearServed} className="m3-icon-btn" title="Dọn món đã phục vụ xong" aria-label="Dọn món đã phục vụ xong">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        }
      >
        <PageTabs
          options={[{ value: 'byDish', label: 'Theo món' }, { value: 'byTable', label: 'Theo phòng bàn' }]}
          value={view}
          onChange={nextView => { setView(nextView); triggerBeep(true); }}
        />
        <FilterPills
          options={statusFilters.map(f => ({ value: f.id, label: f.label }))}
          value={filterStatus}
          onChange={nextFilter => { setFilterStatus(nextFilter); triggerBeep(true); }}
        />

        {view === 'byDish' ? (
          <DataTable
            columns={buildColumns(true)}
            rows={filteredItems}
            rowKey={item => item.id}
            emptyMessage="Không có món nào phù hợp bộ lọc"
          />
        ) : filteredItems.length === 0 ? (
          <p className="py-12 text-center text-base font-semibold text-on-surface-variant">Không có món nào phù hợp bộ lọc</p>
        ) : (
          <div className="space-y-5">
            {Array.from(itemsByTable.entries()).map(([table, items]) => {
              const oldestMins = Math.max(...items.map(item => getElapsedMinutes(item.createdAt)));
              const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
              return (
                <div key={table} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-base font-bold text-on-surface">{table}</h3>
                    <span className="text-sm text-on-surface-variant">{oldestMins} phút trước · Tổng {totalQuantity} phần</span>
                  </div>
                  <DataTable columns={buildColumns(false)} rows={items} rowKey={item => item.id} emptyMessage="" />
                </div>
              );
            })}
          </div>
        )}
      </PageCard>
    </div>
  );
}
