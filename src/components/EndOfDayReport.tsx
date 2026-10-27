/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { BankAccount, CashVoucher, DiningTable, Order, Product, Zone } from '../types';
import { computeEndOfDay, eodRange, type EodPreset } from '../utils/endOfDay';
import DragScrollRow from './DragScrollRow';
import type { CartLine } from './POSScreen';

interface EndOfDayReportProps {
  orders: Order[];
  vouchers: CashVoucher[];
  accounts: BankAccount[];
  carts: Record<string, CartLine[]>;
  products: Product[];
  tables: DiningTable[];
  zones: Zone[];
  storeType: 'fnb' | 'retail';
}

const money = (n: number) => Math.round(n).toLocaleString('vi-VN');
const toDateInput = (ms: number) => { const d = new Date(ms); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

type Tab = 'summary' | 'cashflow' | 'goods' | 'rooms';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-container-lowest border-y border-outline-variant sm:border sm:rounded-2xl overflow-hidden">
      <p className="px-4 pt-4 pb-1 text-xs font-bold uppercase tracking-wide text-on-surface-variant">{title}</p>
      <div className="divide-y divide-outline-variant/60">{children}</div>
    </div>
  );
}

const Row: React.FC<{ label: string; value: string; sub?: string; bold?: boolean; tone?: 'in' | 'out' }> = ({ label, value, sub, bold, tone }) => {
  return (
    <div className="px-4 py-3 flex items-start justify-between gap-4">
      <span className={`text-base ${bold ? 'font-bold' : ''} text-on-surface`}>{label}</span>
      <span className="text-right">
        <span className={`block text-base ${bold ? 'font-bold' : ''} ${tone === 'in' ? 'text-secondary' : tone === 'out' ? 'text-error' : 'text-on-surface'}`}>{value}</span>
        {sub && <span className="block text-sm text-on-surface-variant">{sub}</span>}
      </span>
    </div>
  );
};

/** Báo cáo cuối ngày (theo kỳ): Tổng hợp · Thu chi · Hàng hóa · Phòng bàn, kèm tình hình đang phục vụ. */
export default function EndOfDayReport({ orders, vouchers, accounts, carts, products, tables, zones, storeType }: EndOfDayReportProps) {
  const isFnb = storeType === 'fnb';
  const [preset, setPreset] = useState<EodPreset>('today');
  const [customFrom, setCustomFrom] = useState(toDateInput(Date.now()));
  const [customTo, setCustomTo] = useState(toDateInput(Date.now()));
  const [tab, setTab] = useState<Tab>('summary');
  const [expandServing, setExpandServing] = useState(false);
  const [expandSold, setExpandSold] = useState(false);

  const range = useMemo(
    () => preset === 'custom'
      ? { from: new Date(`${customFrom}T00:00:00`).getTime(), to: new Date(`${customTo}T23:59:59.999`).getTime() }
      : eodRange(preset),
    [preset, customFrom, customTo],
  );
  const r = useMemo(
    () => computeEndOfDay({ orders, vouchers, accounts, carts, products, tables, zones, ...range }),
    [orders, vouchers, accounts, carts, products, tables, zones, range],
  );

  const presets: { id: EodPreset; label: string }[] = [
    { id: 'today', label: 'Hôm nay' }, { id: 'yesterday', label: 'Hôm qua' }, { id: 'week', label: 'Tuần này' }, { id: 'month', label: 'Tháng này' }, { id: 'custom', label: 'Tùy chọn' },
  ];
  const tabs: { id: Tab; label: string }[] = [
    { id: 'summary', label: 'Tổng hợp' }, { id: 'cashflow', label: 'Thu chi' }, { id: 'goods', label: 'Hàng hóa' },
    ...(isFnb ? [{ id: 'rooms' as Tab, label: 'Phòng bàn' }] : []),
  ];

  const itemsBlock = (title: string, block: { value: number; quantity: number; items: { name: string; value: number; quantity: number }[] }, expanded: boolean, toggle: () => void) => {
    const shown = expanded ? block.items : block.items.slice(0, 5);
    return (
      <Section title={title}>
        <Row label="Tổng giá trị" value={money(block.value)} sub={`${block.quantity} món`} bold />
        {shown.map(i => <Row key={i.name} label={i.name} value={money(i.value)} sub={`${i.quantity} món`} />)}
        {block.items.length === 0 && <p className="px-4 py-4 text-sm text-on-surface-variant">Chưa có dữ liệu.</p>}
        {block.items.length > 5 && (
          <button onClick={toggle} className="w-full py-3 text-base font-bold text-primary cursor-pointer">{expanded ? 'Thu gọn' : 'Xem thêm'}</button>
        )}
      </Section>
    );
  };

  return (
    <div className="max-w-3xl mx-auto pb-10 space-y-3">
      <h2 className="text-xl font-bold text-on-surface">Báo cáo cuối ngày</h2>

      <div className="flex flex-wrap items-center gap-2">
        <DragScrollRow className="gap-1.5">
          {presets.map(p => (
            <button key={p.id} onClick={() => setPreset(p.id)}
              className={`shrink-0 min-h-10 px-4 rounded-full text-sm font-bold whitespace-nowrap cursor-pointer ${preset === p.id ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>{p.label}</button>
          ))}
        </DragScrollRow>
        {preset === 'custom' && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="m3-input !min-h-10 !w-40" />
            <span>–</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="m3-input !min-h-10 !w-40" />
          </div>
        )}
      </div>

      {/* Chỉ số nhanh */}
      <div className="m3-card p-4 grid grid-cols-2 gap-y-4 gap-x-6">
        <div><p className="text-sm text-on-surface-variant">Hóa đơn</p><p className="text-2xl font-black text-primary">{r.orderCount} <span className="text-base font-semibold text-on-surface-variant">đơn · {money(r.revenue)}đ</span></p></div>
        {isFnb ? (
          <div><p className="text-sm text-on-surface-variant">{r.openOrders} đơn đang phục vụ</p><p className="text-2xl font-black text-secondary">{money(r.openValue)}<span className="text-base font-semibold text-on-surface-variant"> đ</span></p></div>
        ) : (
          <div><p className="text-sm text-on-surface-variant">Đơn đang mở</p><p className="text-2xl font-black text-secondary">{r.openOrders}</p></div>
        )}
        {isFnb && (
          <>
            <div><p className="text-sm text-on-surface-variant">Bàn đang sử dụng</p><p className="text-xl font-bold">{r.tablesInUse} / {r.tablesTotal}</p></div>
            <div><p className="text-sm text-on-surface-variant">Khách đang phục vụ</p><p className="text-xl font-bold">{r.guestsInService}</p></div>
          </>
        )}
      </div>

      {/* Tab */}
      <div className="flex border-b border-outline-variant overflow-x-auto scrollbar-none">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 min-w-[5.5rem] min-h-12 text-base font-bold border-b-[3px] -mb-px whitespace-nowrap cursor-pointer ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'summary' && (
        <>
          <Section title="Tổng kết bán hàng">
            <Row label="Doanh thu tổng" value={money(r.grossRevenue)} sub={`${r.orderCount} hóa đơn`} />
            <Row label="Tổng giảm giá hóa đơn" value={money(r.invoiceDiscount)} />
            <Row label="Doanh thu" value={money(r.revenue)} sub={`Bao gồm ${money(r.tax)} tiền thuế`} bold />
            <Row label="Thu khác" value={money(r.otherIncome)} sub="Phiếu thu lập tay" />
            <Row label="Thuế VAT" value={money(r.tax)} />
            <Row label="Hủy / trả hàng" value={money(r.voidValue)} sub={`${r.voidCount} hóa đơn`} tone={r.voidValue > 0 ? 'out' : undefined} />
            <Row label="Doanh thu thuần" value={money(r.netIncludingOther)} sub="Bao gồm thu khác" bold />
            <Row label="Doanh thu thuần" value={money(r.netExcludingOther)} sub="Không bao gồm thu khác" bold />
          </Section>
          {isFnb && (
            <Section title="Đang phục vụ">
              <Row label="Đơn đang mở" value={String(r.openOrders)} sub={`${r.serving.quantity} món chưa thanh toán`} />
              <Row label="Giá trị tạm tính" value={money(r.openValue)} />
            </Section>
          )}
        </>
      )}

      {tab === 'cashflow' && (
        <>
          <Section title="Thu bán hàng">
            <Row label="Tổng giá trị" value={money(r.salesByMethod.total)} bold />
            <Row label="Tiền mặt" value={money(r.salesByMethod.cash)} />
            <Row label="Chuyển khoản" value={money(r.salesByMethod.transfer)} />
            <Row label="Thẻ" value={money(r.salesByMethod.card)} />
            <Row label="Ví điện tử" value={money(r.salesByMethod.wallet)} />
          </Section>
          <Section title="Điểm tích lũy">
            <Row label="Điểm cộng thêm cho khách" value={money(r.pointsEarned)} />
          </Section>
          <Section title="Phiếu thu">
            <Row label="Tổng giá trị" value={money(r.receipts.total)} bold tone="in" />
            <Row label="Tiền mặt" value={money(r.receipts.cash)} />
            <Row label="Chuyển khoản / Ngân hàng" value={money(r.receipts.bank)} />
            <Row label="Ví điện tử" value={money(r.receipts.wallet)} />
          </Section>
          <Section title="Phiếu chi">
            <Row label="Tổng giá trị" value={money(r.payments.total)} bold tone="out" />
            <Row label="Tiền mặt" value={money(r.payments.cash)} />
            <Row label="Chuyển khoản / Ngân hàng" value={money(r.payments.bank)} />
            <Row label="Ví điện tử" value={money(r.payments.wallet)} />
          </Section>
          <Section title="Chênh lệch thu chi trong kỳ">
            <Row label="Tổng thu − Tổng chi" value={money(r.salesByMethod.total + r.receipts.total - r.payments.total)} bold />
          </Section>
        </>
      )}

      {tab === 'goods' && (
        <>
          {isFnb && itemsBlock('Đang phục vụ', r.serving, expandServing, () => setExpandServing(v => !v))}
          {itemsBlock('Đã bán', r.sold, expandSold, () => setExpandSold(v => !v))}
        </>
      )}

      {tab === 'rooms' && isFnb && (
        <>
          <Section title="Loại đơn hàng">
            <Row label="Ngồi tại bàn" value={money(r.byType.dineIn.value)} sub={`${r.byType.dineIn.count} đơn`} />
            <Row label="Mang về" value={money(r.byType.takeaway.value)} sub={`${r.byType.takeaway.count} đơn`} />
            <Row label="Giao đi" value={money(r.byType.delivery.value)} sub={`${r.byType.delivery.count} đơn`} />
          </Section>
          <Section title="Phòng / Bàn">
            {r.byTable.length === 0 && <p className="px-4 py-4 text-sm text-on-surface-variant">Chưa có đơn ngồi tại bàn trong kỳ.</p>}
            {r.byTable.map(t => <Row key={t.name} label={t.name} sub={`${t.zone ? `${t.zone} · ` : ''}${t.count} đơn`} value={money(t.value)} />)}
          </Section>
        </>
      )}
    </div>
  );
}
