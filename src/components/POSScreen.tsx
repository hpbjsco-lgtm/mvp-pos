/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Trash2, Plus, Minus, ScanLine, Printer,
  X, Landmark, RefreshCw, ShoppingCart, Edit3, ClipboardList,
  UserPlus, Coins, User, ChefHat, ChevronDown, Banknote, QrCode, CreditCard, Search,
  LayoutGrid, UtensilsCrossed
} from 'lucide-react';
import { Product, DiningTable, Zone, KitchenItem, Order, PaymentMethod, TableStatus, KitchenStatus, InventoryBatch, Customer } from '../types';
import TableMap from './TableMap';
import KitchenDisplay from './KitchenDisplay';
import ReceiptThermal from './ReceiptThermal';
import { logOperation } from '../utils/logger';
import { categoryPlaceholderColor } from '../utils/categoryColor';

export interface CartLine {
  productId: string;
  quantity: number;
  note: string;
  size?: string;
  sugarLevel?: string;
  iceLevel?: string;
}

const SIZE_OPTIONS = ['S', 'M', 'L'];
const SUGAR_OPTIONS = ['0%', '30%', '50%', '70%', '100%'];
const ICE_OPTIONS = ['0%', '30%', '50%', '70%', '100%'];
const DEFAULT_SIZE = 'M';
const DEFAULT_SUGAR = '100%';
const DEFAULT_ICE = '100%';

/** Khoá định danh 1 dòng giỏ hàng: cùng sản phẩm nhưng khác tuỳ chọn/ghi chú -> là dòng khác nhau. */
const lineKey = (i: Pick<CartLine, 'productId' | 'note' | 'size' | 'sugarLevel' | 'iceLevel'>) =>
  `${i.productId}|${i.note}|${i.size || ''}|${i.sugarLevel || ''}|${i.iceLevel || ''}`;

interface POSScreenProps {
  simStoreType: 'fnb' | 'retail';
  setSimStoreType: (type: 'fnb' | 'retail') => void;
  simProducts: Product[];
  simTables: DiningTable[];
  setSimTables: React.Dispatch<React.SetStateAction<DiningTable[]>>;
  simZones: Zone[];
  setSimZones: React.Dispatch<React.SetStateAction<Zone[]>>;
  simCarts: Record<string, CartLine[]>;
  setSimCarts: React.Dispatch<React.SetStateAction<Record<string, CartLine[]>>>;
  simKitchenItems: KitchenItem[];
  setSimKitchenItems: React.Dispatch<React.SetStateAction<KitchenItem[]>>;
  simOrders: Order[];
  setSimOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  simCustomers: Customer[];
  setSimCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  simSelectedTableId: string;
  setSimSelectedTableId: (id: string) => void;
  simUserRole: 'admin' | 'staff';
  isDemoOfflineMode: boolean;
  fbUserProfile: any;
  fbStoreProfile: any;
  triggerBeep: (success: boolean) => void;
  simBatches: InventoryBatch[];
  setSimBatches: React.Dispatch<React.SetStateAction<InventoryBatch[]>>;
}

export default function POSScreen({
  simStoreType,
  setSimStoreType,
  simProducts,
  simTables,
  setSimTables,
  simZones,
  setSimZones,
  simCarts,
  setSimCarts,
  simKitchenItems,
  setSimKitchenItems,
  simOrders,
  setSimOrders,
  simCustomers,
  setSimCustomers,
  simSelectedTableId,
  setSimSelectedTableId,
  simUserRole,
  isDemoOfflineMode,
  fbUserProfile,
  fbStoreProfile,
  triggerBeep,
  simBatches,
  setSimBatches
}: POSScreenProps) {
  
  // Tab bên trái cho fnb: "Phòng bàn" (sơ đồ bàn, mặc định) hoặc "Thực đơn" (gọi thêm món)
  const [fnbLeftTab, setFnbLeftTab] = useState<'tables' | 'menu'>('tables');

  const [activeCategory, setActiveCategory] = useState<string>('Tất cả');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [barcodeInputValue, setBarcodeInputValue] = useState<string>('');
  
  // Custom interactive cash calculator states (Retail)
  const [cashPadInput, setCashPadInput] = useState<string>('');
  const [cashChangeDue, setCashChangeDue] = useState<number>(0);
  
  // Checkout Modal context
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<'cash' | 'qr' | 'card'>('cash');
  const [checkoutStep, setCheckoutStep] = useState<'selection' | 'processing' | 'success'>('selection');
  
  // Thermal Receipt Modal state
  const [thermalReceiptOpen, setThermalReceiptOpen] = useState(false);
  const [lastPlacedOrder, setLastPlacedOrder] = useState<Order | null>(null);

  // Table Map Popup Modal
  const [tableMapPopupOpen, setTableMapPopupOpen] = useState(false);

  // Giỏ hàng hiển thị dạng bottom-sheet trên di động, cố định ở sidebar trên màn lớn
  const [cartSheetOpen, setCartSheetOpen] = useState(false);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');

  // Quick customer creation states
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  // Active cart definition
  const currentCartId = simStoreType === 'fnb' ? simSelectedTableId : 'retail';
  const currentCart = simCarts[currentCartId] || [];

  // F&B Payment Method selected on right panel directly
  const [fnbPaymentMethod, setFnbPaymentMethod] = useState<'cash' | 'qr' | 'card'>('cash');
  const [showPaymentOptions, setShowPaymentOptions] = useState(false);

  // Giảm giá & Thuế VAT áp dụng cho đơn hiện tại
  const [discountInput, setDiscountInput] = useState<number>(0);
  const [vatPercent, setVatPercent] = useState<number>(0);

  useEffect(() => {
    setCashPadInput('');
    setCashChangeDue(0);
    setShowPaymentOptions(false);
    setDiscountInput(0);
    setVatPercent(0);
  }, [currentCartId]);

  // Table information
  const selectedTable = simTables.find(t => t.id === simSelectedTableId);
  const selectedTableName = selectedTable ? selectedTable.name : 'Vãng lai';

  // Products Category parsing
  const categories = ['Tất cả', ...Array.from(new Set(simProducts.map(p => p.category)))];

  // Calculated totals
  const cartSubtotal = currentCart.reduce((sum, item) => {
    const prod = simProducts.find(p => p.id === item.productId);
    return sum + (prod?.price || 0) * item.quantity;
  }, 0);
  const discountAmount = Math.max(0, Math.min(discountInput || 0, cartSubtotal));
  const taxableAmount = cartSubtotal - discountAmount;
  const taxAmount = Math.round(taxableAmount * ((vatPercent || 0) / 100));
  const grandTotal = taxableAmount + taxAmount;

  // Expiry Check helpers
  const getProductHealthyBatch = (prodId: string) => {
    // FIFO logic: Select first non-empty healthy batch of product
    const prodBatches = simBatches
      .filter(b => b.productId === prodId && b.quantity > 0)
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
    return prodBatches[0] || null;
  };

  // Sound cue trigger proxy
  const playBeep = (success: boolean) => {
    triggerBeep(success);
  };

  // Add Item to active cart
  const handleAddToCart = (product: Product, customNote: string = '') => {
    if (!product.isAvailable) {
      playBeep(false);
      alert('Sản phẩm này hiện đang báo hết hàng!');
      return;
    }

    // Đồ uống mặc định có size/đường/đá -> nhân viên chỉnh lại trực tiếp trên dòng giỏ hàng
    const isDrink = simStoreType === 'fnb' && product.category === 'Đồ uống';
    const mods = isDrink ? { size: DEFAULT_SIZE, sugarLevel: DEFAULT_SUGAR, iceLevel: DEFAULT_ICE } : {};

    // Bàn đã có khách đặt trước & đây là món đầu tiên của đơn -> yêu cầu nhân viên xác nhận
    if (simStoreType === 'fnb' && currentCart.length === 0 && selectedTable?.reservationName) {
      const info = [
        selectedTable.reservationName,
        selectedTable.reservationPhone,
        selectedTable.reservationTime ? `hẹn ${selectedTable.reservationTime}` : ''
      ].filter(Boolean).join(' - ');
      const confirmed = confirm(`Bàn này đã được đặt trước, hãy xác nhận thông tin khách.\n\nKhách đặt: ${info}${selectedTable.reservationNote ? `\nGhi chú: ${selectedTable.reservationNote}` : ''}`);
      if (!confirmed) {
        playBeep(false);
        return;
      }
    }

    // Retail POS verifies batch stock in FIFO order
    if (simStoreType === 'retail') {
      const activeBatch = getProductHealthyBatch(product.id);
      if (!activeBatch || activeBatch.quantity <= 0) {
        playBeep(false);
        alert('Cảnh báo! Sản phẩm này đã hết hàng tồn kho trong hệ thống Lô!');
        return;
      }
    }

    setSimCarts(prev => {
      const prevCart = prev[currentCartId] || [];
      const targetKey = lineKey({ productId: product.id, note: customNote, ...mods });
      const existingIdx = prevCart.findIndex(item => lineKey(item) === targetKey);

      let nextCart;
      if (existingIdx > -1) {
        nextCart = prevCart.map((item, idx) => {
          if (idx === existingIdx) {
            return { ...item, quantity: item.quantity + 1 };
          }
          return item;
        });
      } else {
        nextCart = [...prevCart, { productId: product.id, quantity: 1, note: customNote, ...mods }];
      }

      return {
        ...prev,
        [currentCartId]: nextCart
      };
    });

    playBeep(true);
  };

  // Modify cart quantity
  const handleUpdateQty = (item: CartLine, delta: number) => {
    setSimCarts(prev => {
      const prevCart = prev[currentCartId] || [];
      const targetKey = lineKey(item);
      const targetIdx = prevCart.findIndex(i => lineKey(i) === targetKey);
      if (targetIdx === -1) return prev;

      let nextCart = prevCart.map((i, idx) => {
        if (idx === targetIdx) {
          const nextQty = i.quantity + delta;
          return { ...i, quantity: Math.max(1, nextQty) };
        }
        return i;
      });

      if (delta < 0 && prevCart[targetIdx].quantity === 1) {
        nextCart = prevCart.filter((_, idx) => idx !== targetIdx);
      }

      return {
        ...prev,
        [currentCartId]: nextCart
      };
    });
    playBeep(true);
  };

  // Add individual order notes
  const handleUpdateItemNote = (item: CartLine) => {
    const newNote = prompt('Nhập ghi chú cho sản phẩm (Ví dụ: ít cay, chín kỹ...):', item.note);
    if (newNote === null) return;

    setSimCarts(prev => {
      const prevCart = prev[currentCartId] || [];
      const targetKey = lineKey(item);
      const nextCart = prevCart.map(i => (lineKey(i) === targetKey ? { ...i, note: newNote.trim() } : i));
      return { ...prev, [currentCartId]: nextCart };
    });
    playBeep(true);
  };

  // Cập nhật size / mức đường / mức đá của 1 dòng đồ uống trong giỏ
  const handleUpdateModifier = (item: CartLine, field: 'size' | 'sugarLevel' | 'iceLevel', value: string) => {
    setSimCarts(prev => {
      const prevCart = prev[currentCartId] || [];
      const targetKey = lineKey(item);
      const nextCart = prevCart.map(i => (lineKey(i) === targetKey ? { ...i, [field]: value } : i));
      return { ...prev, [currentCartId]: nextCart };
    });
  };

  // Clear current active cart
  const handleClearCart = () => {
    if (confirm('Bạn có thực sự muốn làm trống đơn hàng hiện tại?')) {
      setSimCarts(prev => ({
        ...prev,
        [currentCartId]: []
      }));
      playBeep(true);
    }
  };

  // Barcode Scanner Simulator
  const handleSimulateBarcodeScan = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!barcodeInputValue.trim()) return;

    const matchedProduct = simProducts.find(p => p.sku === barcodeInputValue.trim());
    if (matchedProduct) {
      handleAddToCart(matchedProduct);
      setBarcodeInputValue('');
    } else {
      playBeep(false);
      alert(`Không tìm thấy sản phẩm nào có SKU/Mã vạch: ${barcodeInputValue}`);
    }
  };

  const handleAddNewCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim() || !newCustPhone.trim()) return;

    const newCustId = `C-${Date.now()}`;
    const newCust: Customer = {
      id: newCustId,
      name: newCustName.trim(),
      phone: newCustPhone.trim(),
      email: '',
      points: 0,
      createdAt: new Date().toISOString()
    };

    setSimCustomers(prev => [...prev, newCust]);
    setSelectedCustomerId(newCustId);
    setNewCustName('');
    setNewCustPhone('');
    setShowAddCustomer(false);
    playBeep(true);
  };

  // Fast Cash keyboard pad clickers
  const handleCashPadPress = (num: string) => {
    playBeep(true);
    if (num === 'C') {
      setCashPadInput('');
      setCashChangeDue(0);
    } else {
      const nextInput = cashPadInput + num;
      setCashPadInput(nextInput);
      const paid = parseInt(nextInput) || 0;
      setCashChangeDue(Math.max(0, paid - grandTotal));
    }
  };

  // Push Active order items to Kitchen monitor queue
  const handleSendToKitchen = async () => {
    if (currentCart.length === 0) {
      playBeep(false);
      alert('Giỏ hàng trống! Không thể gửi yêu cầu xuống bếp.');
      return;
    }

    const itemsToSend: KitchenItem[] = currentCart.map(item => {
      const prod = simProducts.find(p => p.id === item.productId);
      return {
        id: `K-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        orderId: `ORD-${Date.now().toString().slice(-4)}`,
        productId: item.productId,
        productName: prod?.name || 'Món ăn',
        quantity: item.quantity,
        tableNumber: selectedTableName,
        status: KitchenStatus.PENDING,
        note: item.note || "",
        size: item.size,
        sugarLevel: item.sugarLevel,
        iceLevel: item.iceLevel,
        createdAt: new Date().toISOString()
      };
    });

    setSimKitchenItems(prev => [...itemsToSend, ...prev]);

    // Mark dining table as serving status
    if (simStoreType === 'fnb' && selectedTable) {
      setSimTables(prev => prev.map(t => {
        if (t.id === simSelectedTableId) {
          return { ...t, status: TableStatus.SERVING };
        }
        return t;
      }));
    }

    playBeep(true);
    alert(`Đã truyền thành công ${itemsToSend.length} món ăn xuống quầy chuẩn bị KDS!`);
  };

  // Execute checkout and finalize order payment
  const handleCheckoutSubmit = (paymentMethod: 'cash' | 'qr' | 'card') => {
    if (currentCart.length === 0) {
      playBeep(false);
      return;
    }

    setCheckoutPaymentMethod(paymentMethod);
    setCheckoutStep('processing');
    playBeep(true);

    // Simulate short network loading sync latency
    setTimeout(async () => {
      const orderId = `ORD-${Date.now()}`;
      const orderNum = `HD-${Date.now().toString().slice(-5)}`;
      
      const orderItems = currentCart.map(cartItem => {
        const prod = simProducts.find(p => p.id === cartItem.productId)!;
        const activeBatch = getProductHealthyBatch(prod.id);

        return {
          productId: cartItem.productId,
          name: prod.name,
          quantity: cartItem.quantity,
          price: prod.price,
          batchId: activeBatch?.id,
          batchCode: activeBatch?.batchCode,
          note: cartItem.note || undefined,
          size: cartItem.size,
          sugarLevel: cartItem.sugarLevel,
          iceLevel: cartItem.iceLevel
        };
      });

      // Deduct warehouse quantity (FIFO)
      if (simStoreType === 'retail') {
        setSimBatches(prev => prev.map(b => {
          const itemDeducted = orderItems.find(oi => oi.batchId === b.id);
          if (itemDeducted) {
            return {
              ...b,
              quantity: Math.max(0, b.quantity - itemDeducted.quantity)
            };
          }
          return b;
        }));
      }

      const pointsEarned = Math.floor(grandTotal / 10000); // 1 point per 10k VND

      // Add points to selected customer if applicable
      if (selectedCustomerId) {
        setSimCustomers(prev => prev.map(c => {
          if (c.id === selectedCustomerId) {
            return { ...c, points: c.points + pointsEarned };
          }
          return c;
        }));
      }

      const newOrder: Order = {
        id: orderId,
        orderNumber: orderNum,
        items: orderItems,
        subtotal: cartSubtotal,
        discountAmount,
        taxAmount,
        totalAmount: grandTotal,
        paymentMethod: paymentMethod === 'cash' ? PaymentMethod.CASH : paymentMethod === 'qr' ? PaymentMethod.QR : PaymentMethod.CARD,
        paidAmount: paymentMethod === 'cash' ? (parseInt(cashPadInput) || grandTotal) : grandTotal,
        changeAmount: paymentMethod === 'cash' ? cashChangeDue : 0,
        staffId: fbUserProfile?.uid || 'staff-01',
        staffName: fbUserProfile?.name || '',
        customerPointsEarned: pointsEarned,
        createdAt: new Date().toISOString()
      };

      if (selectedCustomerId) {
        newOrder.customerId = selectedCustomerId;
      }
      if (simStoreType === 'fnb') {
        newOrder.tableId = simSelectedTableId;
        newOrder.tableNumber = selectedTableName;
      }

      logOperation('Màn hình bán hàng (POS)', 'Thanh toán đơn hàng', newOrder);

      setSimOrders(prev => [newOrder, ...prev]);
      setLastPlacedOrder(newOrder);

      if (simStoreType === 'retail') {
        setSimBatches(prev => prev.map(b => {
          const itemDeducted = orderItems.find(oi => oi.batchId === b.id);
          if (itemDeducted) {
            return { ...b, quantity: Math.max(0, b.quantity - itemDeducted.quantity) };
          }
          return b;
        }));
      }

      if (selectedCustomerId) {
        setSimCustomers(prev => prev.map(c => {
          if (c.id === selectedCustomerId) {
            return { ...c, points: c.points + pointsEarned };
          }
          return c;
        }));
      }

      if (simStoreType === 'fnb' && selectedTable) {
        setSimTables(prev => prev.map(t => {
          if (t.id === simSelectedTableId) {
            return { ...t, status: TableStatus.EMPTY };
          }
          return t;
        }));
      }

      setSimCarts(prev => ({
        ...prev,
        [currentCartId]: []
      }));

      // Transition to final success & open receipt
      setCheckoutStep('success');
      setCheckoutModalOpen(false);
      setThermalReceiptOpen(true);
      setCashPadInput('');
      setCashChangeDue(0);
      setSelectedCustomerId('');
      setDiscountInput(0);
      setVatPercent(0);
      playBeep(true);

    }, 800);
  };

  // Filtering products catalog
  const filteredProducts = simProducts.filter(p => {
    const matchesCategory = activeCategory === 'Tất cả' || p.category === activeCategory;
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.includes(searchTerm);
    return matchesCategory && matchesSearch;
  });

  const paymentMethods: { id: 'cash' | 'qr' | 'card'; label: string; icon: typeof Banknote }[] = [
    { id: 'cash', label: 'Tiền mặt', icon: Banknote },
    { id: 'qr', label: 'QR', icon: QrCode },
    { id: 'card', label: 'Thẻ', icon: CreditCard }
  ];

  const cartAndPaymentPanel = (
    <>
      {/* Cột giỏ hàng */}
      <div className="lg:col-span-5 flex flex-col min-h-0">
        <div className="flex items-center justify-between pb-3 gap-2 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <ShoppingCart className="w-4 h-4 text-primary shrink-0" />
            <span className="text-base font-bold text-on-surface truncate">
              {simStoreType === 'fnb' ? selectedTableName : 'Đơn bán lẻ'}
            </span>
          </div>
          <button onClick={handleClearCart} className="m3-btn-text !min-h-8 !px-2 text-sm">
            Xóa hết
          </button>
        </div>

        {currentCart.length === 0 ? (
          <div className="py-16 text-center text-on-surface-variant flex flex-col items-center justify-center gap-2">
            <ShoppingCart className="w-8 h-8 text-outline-variant" />
            <p className="text-base font-bold">Đơn hàng trống</p>
            <p className="text-sm">Chạm vào món trong danh mục để thêm vào đơn.</p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[280px] lg:max-h-[320px] overflow-y-auto pr-1 -mr-1">
            {currentCart.map((item, idx) => {
              const prod = simProducts.find(p => p.id === item.productId);
              if (!prod) return null;

              const isDrink = simStoreType === 'fnb' && prod.category === 'Đồ uống';

              return (
                <div key={`${item.productId}-${idx}`} className="p-3 bg-surface-container rounded-2xl space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <h5 className="text-base font-bold text-on-surface truncate">{prod.name}</h5>
                      <span className="text-sm text-on-surface-variant">{prod.price.toLocaleString('vi-VN')} đ</span>
                    </div>
                    <button
                      onClick={() => handleUpdateQty(item, -item.quantity)}
                      className="m3-icon-btn !w-8 !h-8 hover:text-error"
                      aria-label="Xóa món"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Tuỳ chọn size / đường / đá cho đồ uống */}
                  {isDrink && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="inline-flex rounded-lg overflow-hidden border border-outline-variant">
                        {SIZE_OPTIONS.map(opt => (
                          <button
                            key={opt}
                            onClick={() => handleUpdateModifier(item, 'size', opt)}
                            className={`min-w-8 min-h-8 px-1.5 text-sm font-bold cursor-pointer transition-colors ${
                              item.size === opt ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                      <select
                        value={item.sugarLevel || DEFAULT_SUGAR}
                        onChange={(e) => handleUpdateModifier(item, 'sugarLevel', e.target.value)}
                        className="min-h-8 px-2 rounded-lg text-sm font-bold border border-outline-variant bg-surface-container-lowest text-on-surface-variant"
                      >
                        {SUGAR_OPTIONS.map(opt => <option key={opt} value={opt}>Đường {opt}</option>)}
                      </select>
                      <select
                        value={item.iceLevel || DEFAULT_ICE}
                        onChange={(e) => handleUpdateModifier(item, 'iceLevel', e.target.value)}
                        className="min-h-8 px-2 rounded-lg text-sm font-bold border border-outline-variant bg-surface-container-lowest text-on-surface-variant"
                      >
                        {ICE_OPTIONS.map(opt => <option key={opt} value={opt}>Đá {opt}</option>)}
                      </select>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={() => handleUpdateItemNote(item)}
                      className="text-sm font-bold text-on-surface-variant hover:text-primary flex items-center gap-1 min-h-8"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> {item.note ? item.note : 'Ghi chú'}
                    </button>

                    <div className="flex items-center gap-1 bg-surface-container-lowest border border-outline-variant rounded-full">
                      <button onClick={() => handleUpdateQty(item, -1)} className="m3-icon-btn !w-8 !h-8">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-base font-bold text-on-surface min-w-6 text-center">{item.quantity}</span>
                      <button onClick={() => handleUpdateQty(item, 1)} className="m3-icon-btn !w-8 !h-8">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tổng kết đơn + giảm giá/VAT */}
        <div className="pt-3 mt-3 border-t border-outline-variant space-y-3 shrink-0">
          <div className="flex justify-between items-center text-base text-on-surface-variant">
            <span>Tạm tính</span>
            <span className="font-bold text-on-surface">{cartSubtotal.toLocaleString('vi-VN')} đ</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-on-surface-variant">Giảm giá (đ)</label>
              <input
                type="number"
                min="0"
                value={discountInput || ''}
                onChange={(e) => setDiscountInput(Math.max(0, parseInt(e.target.value) || 0))}
                placeholder="0"
                className="m3-input !min-h-9 !px-2.5 text-base"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-on-surface-variant">Thuế VAT (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={vatPercent || ''}
                onChange={(e) => setVatPercent(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                placeholder="0"
                className="m3-input !min-h-9 !px-2.5 text-base"
              />
            </div>
          </div>

          {(discountAmount > 0 || taxAmount > 0) && (
            <div className="space-y-1 text-sm text-on-surface-variant">
              {discountAmount > 0 && (
                <div className="flex justify-between"><span>Giảm giá</span><span className="text-error font-semibold">-{discountAmount.toLocaleString('vi-VN')} đ</span></div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between"><span>Thuế VAT</span><span className="font-semibold">+{taxAmount.toLocaleString('vi-VN')} đ</span></div>
              )}
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-dashed border-outline-variant">
            <span className="text-base font-bold text-on-surface">Tổng cần thanh toán</span>
            <span className="text-xl font-bold text-primary">{grandTotal.toLocaleString('vi-VN')} đ</span>
          </div>

          {simStoreType === 'fnb' ? (
            <button onClick={handleSendToKitchen} className="m3-btn-filled w-full !min-h-12">
              <ChefHat className="w-4.5 h-4.5" /> Gửi bếp / phục vụ
            </button>
          ) : (
            <button onClick={() => { setCheckoutModalOpen(true); playBeep(true); }} className="m3-btn-filled w-full !min-h-12">
              <Printer className="w-4 h-4" /> Tiến hành thanh toán
            </button>
          )}
        </div>
      </div>

      {/* Cột thanh toán / mã vạch */}
      <div className="lg:col-span-7 space-y-4 mt-4 lg:mt-0">
        {simStoreType === 'fnb' ? (
          <div className="m3-card p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-1.5">
              <Landmark className="w-4 h-4 text-primary" />
              <h3 className="text-base font-bold text-on-surface">Bảng tính &amp; thanh toán</h3>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-on-surface-variant">Bàn thanh toán / phục vụ</label>
              <select
                value={simSelectedTableId}
                onChange={(e) => { setSimSelectedTableId(e.target.value); playBeep(true); }}
                className="m3-input"
              >
                {simTables.map(t => {
                  const zone = simZones.find(z => z.id === t.zoneId);
                  return (
                    <option key={t.id} value={t.id}>
                      {t.name} · {zone?.name || 'Khu vực'} — {t.status === TableStatus.SERVING ? 'Đang phục vụ' : 'Trống'}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-primary-container">
              <span className="text-sm font-semibold text-on-primary-container">Tổng thanh toán</span>
              <span className="text-lg font-bold text-on-primary-container">{grandTotal.toLocaleString('vi-VN')} đ</span>
            </div>

            <div className="pt-1 space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-semibold text-on-surface-variant flex items-center gap-1">
                  <User className="w-3.5 h-3.5" /> Khách hàng tích điểm
                </label>
                <button
                  type="button"
                  onClick={() => { setShowAddCustomer(!showAddCustomer); playBeep(true); }}
                  className="m3-btn-text !min-h-8 !px-2 text-sm"
                >
                  <UserPlus className="w-3.5 h-3.5" /> {showAddCustomer ? 'Hủy' : 'Thêm mới'}
                </button>
              </div>

              {showAddCustomer ? (
                <form onSubmit={handleAddNewCustomer} className="p-3 bg-surface-container rounded-2xl space-y-2">
                  <input
                    type="text"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    placeholder="Tên khách hàng"
                    className="m3-input !min-h-9 text-base"
                    required
                  />
                  <input
                    type="text"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    placeholder="Số điện thoại"
                    className="m3-input !min-h-9 text-base"
                    required
                  />
                  <button type="submit" className="m3-btn-tonal w-full !min-h-9 text-sm">
                    Lưu khách hàng
                  </button>
                </form>
              ) : (
                <div className="space-y-1.5">
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => { setSelectedCustomerId(e.target.value); playBeep(true); }}
                    className="m3-input"
                  >
                    <option value="">Chọn khách hàng thành viên</option>
                    {simCustomers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.phone}) — {c.points} điểm</option>
                    ))}
                  </select>

                  {selectedCustomerId && (
                    <div className="p-2.5 bg-secondary-container rounded-xl flex justify-between items-center text-sm text-on-secondary-container">
                      <div className="flex items-center gap-1 font-semibold">
                        <Coins className="w-3.5 h-3.5" />
                        <span>Điểm hiện có</span>
                      </div>
                      <span className="font-bold">{simCustomers.find(c => c.id === selectedCustomerId)?.points || 0} điểm</span>
                    </div>
                  )}

                  <div className="p-2.5 bg-surface-container rounded-xl flex justify-between items-center text-sm text-on-surface-variant">
                    <div className="flex items-center gap-1 font-semibold">
                      <Coins className="w-3.5 h-3.5" />
                      <span>Tích thêm cho đơn này</span>
                    </div>
                    <span className="font-bold text-on-surface">+{Math.floor(grandTotal / 10000)} điểm</span>
                  </div>
                </div>
              )}
            </div>

            {!showPaymentOptions ? (
              <button
                onClick={() => {
                  if (currentCart.length === 0) {
                    playBeep(false);
                    alert('Giỏ hàng trống! Hãy chọn món trước khi tính hóa đơn.');
                    return;
                  }
                  setShowPaymentOptions(true);
                  playBeep(true);
                }}
                className="m3-btn-filled w-full !min-h-12"
              >
                <Landmark className="w-4.5 h-4.5" /> Tính hóa đơn
              </button>
            ) : (
              <div className="space-y-3.5 pt-2 border-t border-outline-variant">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-semibold text-on-surface-variant">Tiền khách đưa</label>
                    <button
                      onClick={() => { setCashPadInput(''); setCashChangeDue(0); playBeep(true); }}
                      className="text-sm font-bold text-primary"
                    >
                      Xóa nhập lại
                    </button>
                  </div>
                  <input
                    type="text"
                    value={cashPadInput ? (parseInt(cashPadInput) || 0).toLocaleString('vi-VN') + ' đ' : '0 đ'}
                    readOnly
                    className="m3-input text-right font-bold text-primary !min-h-12 text-lg"
                  />
                </div>

                <div className="bg-error-container rounded-2xl p-4 text-center space-y-0.5">
                  <span className="text-sm font-semibold text-on-error-container block">Tiền thối lại</span>
                  <span className="text-2xl font-bold text-on-error-container block">{cashChangeDue.toLocaleString('vi-VN')} đ</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-on-surface-variant">Hình thức thanh toán</label>
                  <div className="grid grid-cols-3 gap-2">
                    {paymentMethods.map(p => {
                      const active = fnbPaymentMethod === p.id;
                      const Icon = p.icon;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setFnbPaymentMethod(p.id);
                            if (p.id !== 'cash') {
                              setCashPadInput(grandTotal.toString());
                              setCashChangeDue(0);
                            } else {
                              setCashPadInput('');
                              setCashChangeDue(0);
                            }
                            playBeep(true);
                          }}
                          className={`min-h-14 rounded-xl border text-sm font-bold flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
                            active ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-lowest border-outline-variant text-on-surface-variant'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (currentCart.length === 0) {
                      playBeep(false);
                      alert('Giỏ hàng trống! Hãy chọn món trước khi thanh toán.');
                      return;
                    }
                    handleCheckoutSubmit(fnbPaymentMethod);
                  }}
                  className="m3-btn-filled w-full !min-h-12"
                >
                  <Printer className="w-4 h-4" /> Hoàn tất &amp; in hóa đơn
                </button>

                {fnbPaymentMethod === 'cash' && (
                  <div className="pt-2 border-t border-outline-variant space-y-2">
                    <span className="text-sm font-semibold text-on-surface-variant block text-center">Bàn phím chạm nhanh</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '000', 'C'].map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => handleCashPadPress(val)}
                          className={`min-h-11 text-base font-bold rounded-xl border cursor-pointer transition-colors ${
                            val === 'C'
                              ? 'bg-error-container text-on-error-container border-transparent'
                              : 'bg-surface-container-lowest border-outline-variant text-on-surface'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[50000, 100000, 200000, 500000].map(amt => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => {
                            setCashPadInput(amt.toString());
                            setCashChangeDue(Math.max(0, amt - grandTotal));
                            playBeep(true);
                          }}
                          className="min-h-9 px-1 bg-surface-container border border-outline-variant text-on-surface-variant text-sm font-bold rounded-lg cursor-pointer"
                        >
                          {amt.toLocaleString('vi-VN')} đ
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="m3-card p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-1.5">
              <ScanLine className="w-4 h-4 text-primary" />
              <h3 className="text-base font-bold text-on-surface">Quét mã vạch</h3>
            </div>

            <form onSubmit={handleSimulateBarcodeScan} className="space-y-2">
              <label className="text-sm font-semibold text-on-surface-variant">Nhập tay SKU / mã vạch</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={barcodeInputValue}
                  onChange={(e) => setBarcodeInputValue(e.target.value)}
                  placeholder="8930001001..."
                  className="m3-input flex-1 font-mono"
                />
                <button type="submit" className="m3-btn-filled !min-h-11 !px-4">
                  Quét
                </button>
              </div>
            </form>

            <div className="space-y-1.5">
              <span className="text-sm font-semibold text-on-surface-variant block">Quét nhanh</span>
              <div className="grid grid-cols-1 gap-1.5">
                {simProducts.slice(0, 3).map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setBarcodeInputValue(p.sku); playBeep(true); }}
                    className="min-h-10 px-3 bg-surface-container border border-outline-variant text-left rounded-xl text-sm font-mono text-on-surface-variant truncate cursor-pointer"
                  >
                    {p.name} ({p.sku})
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-outline-variant">
              <span className="text-sm font-semibold text-on-surface-variant block">Nhập nhanh tiền khách đưa</span>
              <div className="min-h-11 bg-surface-container rounded-xl font-mono text-lg px-3 flex items-center justify-end font-bold text-primary">
                {(parseInt(cashPadInput) || 0).toLocaleString('vi-VN')} đ
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '000', 'C'].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleCashPadPress(val)}
                    className={`min-h-11 text-base font-bold rounded-xl border cursor-pointer transition-colors ${
                      val === 'C'
                        ? 'bg-error-container text-on-error-container border-transparent'
                        : 'bg-surface-container-lowest border-outline-variant text-on-surface'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>

              <div className="flex justify-between items-center text-base font-semibold pt-1 text-on-surface-variant">
                <span>Tiền thối lại</span>
                <span className="text-error font-bold">{cashChangeDue.toLocaleString('vi-VN')} đ</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div id="pos-screen-layout" className="pb-24 lg:pb-0">

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start">

        {/* Cột trái: Phòng bàn (fnb) hoặc lưới sản phẩm */}
        <div className="lg:col-span-5 space-y-3">

          {simStoreType === 'fnb' && (
            <div className="flex bg-surface-container-high p-1 rounded-2xl border border-outline-variant gap-1">
              <button
                onClick={() => { setFnbLeftTab('tables'); playBeep(true); }}
                className={`flex-1 flex items-center justify-center gap-1.5 min-h-10 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                  fnbLeftTab === 'tables' ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <LayoutGrid className="w-4 h-4" /> Phòng bàn
              </button>
              <button
                onClick={() => { setFnbLeftTab('menu'); playBeep(true); }}
                className={`flex-1 flex items-center justify-center gap-1.5 min-h-10 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                  fnbLeftTab === 'menu' ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <UtensilsCrossed className="w-4 h-4" /> Thực đơn
              </button>
            </div>
          )}

          {simStoreType === 'fnb' && fnbLeftTab === 'tables' ? (
            <TableMap
              simTables={simTables}
              setSimTables={setSimTables}
              simZones={simZones}
              setSimZones={setSimZones}
              simSelectedTableId={simSelectedTableId}
              setSimSelectedTableId={(id) => { setSimSelectedTableId(id); setFnbLeftTab('menu'); playBeep(true); }}
              simUserRole={simUserRole}
              triggerBeep={triggerBeep}
              compact
            />
          ) : (
            <div className="m3-card p-4 sm:p-5 space-y-4">
              {simStoreType === 'fnb' && (
                <div className="flex items-center justify-between p-2.5 bg-primary-container rounded-xl">
                  <span className="text-sm font-bold text-on-primary-container flex items-center gap-1.5 min-w-0 truncate">
                    <ShoppingCart className="w-4 h-4 shrink-0" /> Đang gọi món cho: {selectedTableName}
                  </span>
                  <button
                    onClick={() => { setFnbLeftTab('tables'); playBeep(true); }}
                    className="text-sm font-bold text-on-primary-container underline shrink-0 cursor-pointer"
                  >
                    Đổi bàn
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-on-surface">Danh mục sản phẩm</h3>
                <span className="text-sm text-on-surface-variant font-semibold">{filteredProducts.length} món</span>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Tìm tên sản phẩm..."
                  className="m3-input pl-10"
                />
              </div>

              <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-none">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => { setActiveCategory(cat); playBeep(true); }}
                    className={`m3-chip whitespace-nowrap ${activeCategory === cat ? 'm3-chip-selected' : ''}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3 max-h-[440px] overflow-y-auto pr-1 -mr-1">
                {filteredProducts.map(prod => (
                  <button
                    key={prod.id}
                    onClick={() => handleAddToCart(prod)}
                    disabled={!prod.isAvailable}
                    className={`rounded-2xl border text-left flex flex-col overflow-hidden cursor-pointer transition-colors ${
                      prod.isAvailable
                        ? 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container active:bg-surface-container-high'
                        : 'border-outline-variant/50 bg-surface-container-lowest opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="relative aspect-[4/3] w-full shrink-0">
                      {prod.imageUrl ? (
                        <img src={prod.imageUrl} alt={prod.name} className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <div className={`absolute inset-0 flex items-center justify-center text-2xl font-black ${categoryPlaceholderColor(prod.category)}`}>
                          {prod.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {!prod.isAvailable && (
                        <span className="absolute top-1.5 right-1.5 text-sm px-1.5 py-0.5 rounded-full font-bold bg-error-container text-on-error-container">
                          Hết hàng
                        </span>
                      )}
                    </div>
                    <div className="p-2.5 space-y-0.5">
                      <h4 className="text-sm font-bold text-on-surface line-clamp-2 leading-snug">{prod.name}</h4>
                      <span className="text-base font-bold text-primary block">{prod.price.toLocaleString('vi-VN')}đ</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Đơn hàng + thanh toán: sidebar cố định trên desktop, bottom sheet trên di động */}
        <div
          className={`fixed inset-x-0 bottom-0 z-40 bg-surface rounded-t-3xl shadow-2xl border-t border-outline-variant
            max-h-[88vh] flex flex-col transition-transform duration-300 ease-out
            ${cartSheetOpen ? 'translate-y-0' : 'translate-y-full pointer-events-none'}
            lg:static lg:translate-y-0 lg:pointer-events-auto lg:max-h-none lg:shadow-none lg:border-0 lg:bg-transparent lg:contents`}
        >
          <div className="lg:hidden flex justify-center pt-2.5 shrink-0">
            <div className="w-10 h-1.5 rounded-full bg-outline-variant" />
          </div>
          <div className="lg:hidden flex items-center justify-between px-4 pt-1 pb-2 shrink-0">
            <h3 className="text-base font-bold text-on-surface">Đơn hàng &amp; thanh toán</h3>
            <button onClick={() => setCartSheetOpen(false)} className="m3-icon-btn">
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:overflow-visible lg:px-0 lg:pb-0 lg:contents">
            <div className="grid lg:col-span-7 lg:grid-cols-12 lg:gap-6">
              {cartAndPaymentPanel}
            </div>
          </div>
        </div>

        {/* Nền mờ phía sau bottom sheet trên di động */}
        {cartSheetOpen && (
          <div
            onClick={() => setCartSheetOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          />
        )}
      </div>

      {/* Thanh tổng đơn cố định dưới cùng trên di động */}
      {!cartSheetOpen && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-20 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-surface border-t border-outline-variant">
          <button onClick={() => setCartSheetOpen(true)} className="m3-btn-filled w-full !min-h-12 justify-between px-5">
            <span className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" /> {currentCart.length} món
            </span>
            <span>{grandTotal.toLocaleString('vi-VN')} đ</span>
          </button>
        </div>
      )}

      {/* Overlay modal 1: Cash Checkout payment selector details */}
      {checkoutModalOpen && (
        <div id="checkout-drawer-modal" className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="m3-card !bg-surface-container-lowest shadow-2xl max-w-md w-full overflow-hidden">

            <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
              <h3 className="text-base font-bold text-on-surface">Quy trình thanh toán</h3>
              <button onClick={() => setCheckoutModalOpen(false)} className="m3-icon-btn">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3.5 bg-surface-container rounded-2xl flex justify-between items-center text-base">
                <span className="text-on-surface-variant">Tổng thanh toán</span>
                <span className="text-lg text-primary font-bold">{grandTotal.toLocaleString('vi-VN')} đ</span>
              </div>

              {checkoutStep === 'processing' ? (
                <div className="py-8 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-primary mx-auto animate-spin" />
                  <p className="text-base font-semibold text-on-surface-variant">Đang ghi nhận giao dịch...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <span className="text-sm font-semibold text-on-surface-variant block">Chọn phương thức thanh toán</span>

                  <div className="grid grid-cols-3 gap-3">
                    {paymentMethods.map(p => {
                      const Icon = p.icon;
                      return (
                        <button
                          key={p.id}
                          onClick={() => handleCheckoutSubmit(p.id)}
                          className="min-h-20 rounded-2xl border border-outline-variant hover:bg-primary-container/50 text-center flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Icon className="w-5 h-5 text-primary" />
                          <span className="text-sm font-bold text-on-surface">{p.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-outline-variant text-right">
              <button onClick={() => setCheckoutModalOpen(false)} className="m3-btn-outlined !min-h-9 text-sm">
                Hủy bỏ
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Overlay modal 2: High fidelity Thermal print receipt visualizer popup */}
      {thermalReceiptOpen && lastPlacedOrder && (
        <ReceiptThermal
          order={lastPlacedOrder}
          storeInfo={{
            name: fbStoreProfile?.name || 'SmartPOS Coffee Shop',
            address: fbStoreProfile?.address || '123 Đường Lê Lợi, TP. HCM',
            phone: fbStoreProfile?.phone || '0901234567',
            storeType: simStoreType
          }}
          staffName={fbUserProfile?.name || 'Thu Ngân 01'}
          onClose={() => { setThermalReceiptOpen(false); setLastPlacedOrder(null); playBeep(true); }}
        />
      )}

      {/* Overlay modal 3: Table map popup for easy dining table selections */}
      {tableMapPopupOpen && (
        <div id="table-map-popup" className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-3xl border border-outline-variant shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-primary-container text-on-primary-container rounded-2xl flex items-center justify-center">
                  <ClipboardList className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-on-surface">Sơ đồ phòng bàn</h3>
                  <p className="text-sm text-on-surface-variant">Chọn bàn để bắt đầu bán hàng / thanh toán</p>
                </div>
              </div>
              <button onClick={() => setTableMapPopupOpen(false)} className="m3-icon-btn">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              <TableMap
                simTables={simTables}
                setSimTables={setSimTables}
                simZones={simZones}
                setSimZones={setSimZones}
                simSelectedTableId={simSelectedTableId}
                setSimSelectedTableId={(id) => {
                  setSimSelectedTableId(id);
                  setTableMapPopupOpen(false);
                  playBeep(true);
                }}
                simUserRole={simUserRole}
                triggerBeep={triggerBeep}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
