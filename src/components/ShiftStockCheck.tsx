/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { StocktakeKind } from '../types';
import { STOCKTAKE_KIND_LABELS } from '../utils/stocktake';
import { listStocktakes } from '../utils/stocktakeHistory';
import PageCard from './ui/PageCard';
import StocktakeFlow, { type StockCheckDeps } from './StocktakeFlow';

interface ShiftStockCheckProps {
  stock: StockCheckDeps;
}

/**
 * Screen for staff to count the goods marked "Kiểm mỗi ca" at the start and at the end of their shift. It only
 * records: the history with values is for the owner and managers.
 */
export default function ShiftStockCheck({ stock }: ShiftStockCheckProps) {
  const [kind, setKind] = useState<StocktakeKind | null>(null);
  const myShift = stock.shifts.find(shift => shift.staffId === stock.user.uid && shift.status === 'open');
  const flagged = stock.products.filter(product => product.checkEachShift && product.trackStock !== false && product.isActive !== false).length;
  const mine = listStocktakes(stock.transactions, stock.shifts, { staffName: stock.user.name }).slice(0, 10);

  return (
    <PageCard title="Kiểm kho ca">
      <p className="text-sm text-on-surface-variant">
        {myShift
          ? `Bạn đang trong ca mở lúc ${new Date(myShift.openedAt).toLocaleString('vi-VN')}. Lần kiểm kho sẽ được ghi vào ca này.`
          : 'Bạn chưa mở ca nên lần kiểm kho sẽ được ghi không gắn với ca nào.'}
      </p>
      {flagged === 0 && (
        <p className="text-sm font-semibold rounded-xl p-3 bg-tertiary-container text-on-tertiary-container">
          Chưa có hàng nào được đánh dấu "Kiểm kho mỗi ca". Nhờ chủ cửa hàng hoặc quản lý đánh dấu trong Kho (sửa hàng), hoặc bấm kiểm và bỏ chọn "Chỉ hàng kiểm mỗi ca" để đếm mọi hàng.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => setKind('open')} className="m3-btn-filled !min-h-12"><ClipboardCheck className="w-4 h-4" /> Kiểm kho đầu ca</button>
        <button type="button" onClick={() => setKind('close')} className="m3-btn-outlined !min-h-12"><ClipboardCheck className="w-4 h-4" /> Kiểm kho cuối ca</button>
      </div>

      <h3 className="text-base font-bold text-on-surface pt-2">Các lần bạn đã kiểm</h3>
      {mine.length === 0 ? (
        <p className="text-sm text-on-surface-variant">Bạn chưa kiểm kho lần nào.</p>
      ) : (
        <ul className="divide-y divide-outline-variant/60">
          {mine.map(entry => (
            <li key={entry.voucher.id} className="py-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="font-mono font-bold">{entry.voucher.transactionNumber}</span>
              <span className="text-on-surface-variant">{new Date(entry.voucher.createdAt).toLocaleString('vi-VN')}</span>
              {entry.voucher.stocktakeKind && <span className="m3-badge m3-badge-neutral">{STOCKTAKE_KIND_LABELS[entry.voucher.stocktakeKind]}</span>}
              <span>{entry.differentItems} hàng chênh lệch</span>
            </li>
          ))}
        </ul>
      )}

      {kind && <StocktakeFlow stock={stock} kind={kind} shiftItemsFirst onClose={() => setKind(null)} />}
    </PageCard>
  );
}
