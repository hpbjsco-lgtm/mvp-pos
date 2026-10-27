/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, Check } from 'lucide-react';
import { Order } from '../types';
import { PAYMENT_LABELS } from '../utils/payments';
import QrCodeImage from './QrCodeImage';

interface ReceiptThermalProps {
  order: Order | null;
  storeInfo: {
    name: string;
    address: string;
    phone: string;
    storeType: 'fnb' | 'retail';
  };
  staffName: string;
  /** 'provisional' = phiếu tạm tính (chưa thanh toán): không có khách đưa / tiền thừa / điểm tích lũy. */
  variant?: 'final' | 'provisional';
  /** Thông tin chuyển khoản + nội dung mã QR để in lên phiếu tạm tính cho khách quét. */
  transfer?: { payload: string; bankName: string; accountNumber: string; holder: string; amount: number };
  onClose: () => void;
}

export default function ReceiptThermal({
  order,
  storeInfo,
  staffName,
  variant = 'final',
  transfer,
  onClose
}: ReceiptThermalProps) {
  if (!order) return null;
  const provisional = variant === 'provisional';

  const handleNativePrint = () => {
    // Print utility: selects the element content and opens native print window or alerts
    window.print();
  };

  return (
    <div id="receipt-thermal-modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header Modal controllers */}
        <div className="bg-surface-container border-b border-outline-variant px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-secondary-container text-secondary rounded-lg border border-secondary-container">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-on-surface">{provisional ? 'Phiếu tạm tính' : 'Giao dịch thành công'}</h3>
              <p className="text-[10px] text-on-surface-variant font-mono">{provisional ? 'Chưa thanh toán' : `ID: ${order.id}`}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-200 text-on-surface-variant hover:text-on-surface-variant rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 80mm Thermal Paper Scroll Container */}
        <div className="flex-1 overflow-y-auto p-6 bg-surface-container-high flex justify-center">
          
          {/* Simulated 80mm Thermal Receipt */}
          <div 
            id="print-area"
            className="w-[300px] bg-surface-container-lowest p-5 shadow-md border border-slate-300 font-mono text-[11px] text-on-surface relative leading-normal"
            style={{ fontFamily: "'Courier New', Courier, monospace" }}
          >
            {/* Top jagged paper cutout design */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-[linear-gradient(135deg,_transparent_33.333%,_#f1f5f9_33.333%,_#f1f5f9_66.667%,_transparent_66.667%),_linear-gradient(45deg,_transparent_33.333%,_#f1f5f9_33.333%,_#f1f5f9_66.667%,_transparent_66.667%)] bg-[size:6px_12px] bg-repeat-x pointer-events-none"></div>

            {/* Store Header */}
            <div className="text-center space-y-1 pt-2">
              <h4 className="text-sm font-extrabold uppercase tracking-tight">{storeInfo.name}</h4>
              <p className="text-[10px] text-on-surface-variant font-sans leading-tight">{storeInfo.address}</p>
              <p className="text-[10px] text-on-surface-variant">SĐT: {storeInfo.phone}</p>
              <p className="text-[10px] text-on-surface-variant font-sans italic">*** Phân hệ: {storeInfo.storeType === 'fnb' ? 'F&B Nhà hàng' : 'Bán lẻ Tạp hóa'} ***</p>
            </div>

            {/* Receipt Title */}
            <div className="text-center my-4 space-y-1">
              <h5 className="text-xs font-bold uppercase tracking-widest">{provisional ? 'PHIẾU TẠM TÍNH' : 'HÓA ĐƠN THANH TOÁN'}</h5>
              <p className="text-[9px] text-on-surface-variant">Số: {order.orderNumber}</p>
              <p className="text-[9px] text-on-surface-variant">Ngày: {new Date(order.createdAt).toLocaleString('vi-VN')}</p>
            </div>

            {/* Divider */}
            <div className="border-t border-dashed border-slate-400 my-3"></div>

            {/* Transaction metadata */}
            <div className="space-y-1 text-on-surface">
              <div className="flex justify-between">
                <span>Thu ngân:</span>
                <span className="font-bold">{staffName}</span>
              </div>
              {order.tableNumber && (
                <div className="flex justify-between">
                  <span>Bàn ăn:</span>
                  <span className="font-bold">{order.tableNumber}</span>
                </div>
              )}
              {order.orderType && (
                <div className="flex justify-between">
                  <span>Hình thức:</span>
                  <span className="font-bold">{order.orderType === 'dine-in' ? 'Ăn tại bàn' : 'Mang về'}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Khách hàng:</span>
                <span className="font-bold">{order.customerId === 'walk-in' || !order.customerId ? 'Khách vãng lai' : 'Thành viên thân thiết'}</span>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-dashed border-slate-400 my-3"></div>

            {order.note && (
              <div className="text-[10px] font-sans italic text-on-surface-variant mb-2">Ghi chú đơn: {order.note}</div>
            )}

            {/* Items Table list */}
            <div className="space-y-2">
              <div className="grid grid-cols-12 font-bold text-on-surface">
                <span className="col-span-5">Tên món</span>
                <span className="col-span-2 text-center">SL</span>
                <span className="col-span-5 text-right">Thành tiền</span>
              </div>
              
              <div className="border-t border-dashed border-slate-300 my-1"></div>

              {order.items.map((item, idx) => {
                const modifiers = [item.size, item.sugarLevel && `Đường ${item.sugarLevel}`, item.iceLevel && `Đá ${item.iceLevel}`]
                  .filter(Boolean)
                  .join(' - ');
                return (
                  <div key={idx} className="space-y-0.5 text-on-surface">
                    <div className="grid grid-cols-12 gap-0.5">
                      <span className="col-span-5 truncate">{item.name}</span>
                      <span className="col-span-2 text-center">{item.quantity}</span>
                      <span className="col-span-5 text-right">{(item.price * item.quantity).toLocaleString('vi-VN')}đ</span>
                    </div>
                    <div className="text-[9px] text-on-surface-variant flex justify-between px-1">
                      <span>Đơn giá: {item.price.toLocaleString('vi-VN')}đ</span>
                      {item.batchCode && <span className="font-sans">Lô: {item.batchCode}</span>}
                    </div>
                    {item.toppings && item.toppings.length > 0 && (
                      <div className="text-[9px] text-on-surface-variant px-1 font-sans">
                        {item.toppings.map(t => `+ ${t.quantity} ${t.name}`).join(', ')}
                      </div>
                    )}
                    {modifiers && <div className="text-[9px] text-on-surface-variant px-1 font-sans">Tùy chọn: {modifiers}</div>}
                    {item.note && <div className="text-[9px] text-on-surface-variant px-1 font-sans italic">Ghi chú: {item.note}</div>}
                  </div>
                );
              })}
            </div>

            {/* Divider */}
            <div className="border-t border-dashed border-slate-400 my-3"></div>

            {/* Calculation summary */}
            <div className="space-y-1.5 text-on-surface font-bold">
              {(order.subtotal !== undefined && (order.discountAmount || order.taxAmount)) ? (
                <>
                  <div className="flex justify-between text-[10px] text-on-surface-variant font-normal">
                    <span>Tạm tính:</span>
                    <span>{order.subtotal.toLocaleString('vi-VN')} đ</span>
                  </div>
                  {!!order.discountAmount && (
                    <div className="flex justify-between text-[10px] text-error font-normal">
                      <span>Giảm giá:</span>
                      <span>-{order.discountAmount.toLocaleString('vi-VN')} đ</span>
                    </div>
                  )}
                  {!!order.taxAmount && (
                    <div className="flex justify-between text-[10px] text-on-surface-variant font-normal">
                      <span>Thuế VAT:</span>
                      <span>+{order.taxAmount.toLocaleString('vi-VN')} đ</span>
                    </div>
                  )}
                </>
              ) : null}
              <div className="flex justify-between text-xs">
                <span>TỔNG CỘNG:</span>
                <span>{order.totalAmount.toLocaleString('vi-VN')} đ</span>
              </div>
              {!provisional && (<>
              {order.payments && order.payments.length > 1 ? (
                <>
                  {order.payments.map((p, i) => (
                    <div key={i} className="flex justify-between text-[10px] text-on-surface-variant font-normal">
                      <span>{PAYMENT_LABELS[p.method]}:</span>
                      <span>{p.amount.toLocaleString('vi-VN')} đ</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-[10px] text-on-surface-variant font-normal">
                    <span>Khách đưa (Kết hợp):</span>
                    <span>{order.paidAmount.toLocaleString('vi-VN')} đ</span>
                  </div>
                </>
              ) : (
              <div className="flex justify-between text-[10px] text-on-surface-variant font-normal">
                <span>Khách đưa ({order.paymentMethod === 'cash' ? 'Tiền mặt' : order.paymentMethod === 'qr' ? 'Chuyển khoản QR' : 'Thẻ ngân hàng'}):</span>
                <span>{order.paidAmount.toLocaleString('vi-VN')} đ</span>
              </div>
              )}
              <div className="flex justify-between text-[10px] text-on-surface-variant font-normal">
                <span>Tiền trả lại:</span>
                <span>{order.changeAmount.toLocaleString('vi-VN')} đ</span>
              </div>
              </>)}
              {!provisional && order.customerPointsEarned && order.customerPointsEarned > 0 ? (
                <div className="flex justify-between text-[9px] text-on-secondary-container font-normal border border-secondary-container bg-secondary-container px-1 py-0.5 rounded font-sans">
                  <span>Điểm tích lũy cộng thêm:</span>
                  <span>+{order.customerPointsEarned} điểm</span>
                </div>
              ) : null}
            </div>

            {/* Divider */}
            <div className="border-t border-dashed border-slate-400 my-3"></div>

            {/* Mã QR chuyển khoản (phiếu tạm tính) */}
            {provisional && transfer && (
              <div className="text-center py-2 space-y-1 font-sans">
                <p className="text-[10px] font-bold uppercase tracking-wide">Quét mã để chuyển khoản</p>
                <QrCodeImage value={transfer.payload} size={150} className="mx-auto" />
                <p className="text-[10px]">{transfer.bankName}</p>
                <p className="text-[11px] font-bold font-mono">{transfer.accountNumber}</p>
                <p className="text-[10px]">{transfer.holder}</p>
                <p className="text-[11px] font-bold">Số tiền: {transfer.amount.toLocaleString('vi-VN')} đ</p>
              </div>
            )}

            {/* Barcode representation */}
            {!provisional && (
            <div className="text-center py-2 space-y-1">
              <div className="h-8 bg-slate-950 flex items-center justify-center font-mono text-[9px] text-white tracking-[6px] select-none mx-auto w-40 font-bold">
                |||||{order.orderNumber}||||
              </div>
              <p className="text-[8px] text-on-surface-variant font-sans">Quét mã vạch này để tra cứu đơn hàng trực tiếp</p>
            </div>
            )}

            {/* Thank you note */}
            <div className="text-center mt-3 text-[10px] text-on-surface-variant font-sans italic space-y-0.5 pb-2">
              <p>{provisional ? 'Phiếu tạm tính — chưa phải hóa đơn thanh toán.' : 'Cảm ơn Quý Khách đã ủng hộ!'}</p>
              {!provisional && <p>Hẹn gặp lại quý khách lần sau.</p>}
              <p className="text-[8px] text-on-surface-variant">Powered by SmartPOS Multi-tenant Cloud</p>
            </div>

            {/* Bottom jagged paper cutout design */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-[linear-gradient(135deg,_transparent_33.333%,_#f1f5f9_33.333%,_#f1f5f9_66.667%,_transparent_66.667%),_linear-gradient(45deg,_transparent_33.333%,_#f1f5f9_33.333%,_#f1f5f9_66.667%,_transparent_66.667%)] bg-[size:6px_12px] bg-repeat-x pointer-events-none transform rotate-180"></div>
          </div>

        </div>

        {/* Action Button Controls */}
        <div className="p-4 bg-surface-container border-t border-outline-variant flex gap-3">
          <button
            onClick={handleNativePrint}
            className="flex-1 py-3 px-4 bg-primary hover:brightness-110 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shadow-lg shadow-emerald-500/10"
          >
             {provisional ? 'IN PHIẾU TẠM TÍNH (80mm)' : 'IN HÓA ĐƠN NHIỆT (80mm)'}
          </button>
          
          <button
            onClick={onClose}
            className="py-3 px-5 bg-surface-container-lowest hover:bg-surface-container-high text-on-surface rounded-2xl font-bold text-xs border border-outline-variant transition-all active:scale-95 cursor-pointer"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
}
