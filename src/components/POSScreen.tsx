/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import DragScrollRow from './DragScrollRow';
import React, { useState, useEffect } from 'react';
import {
  Trash2, Plus, Minus, ScanLine, Printer, X, ClipboardList, Edit3, ChefHat, ChevronDown, Search,
  LayoutGrid, UtensilsCrossed, Landmark, ShoppingCart, ArrowRight,
  ArrowLeft, MoreVertical, Users, Timer, CalendarClock, Link2
} from 'lucide-react';
import { Product, DiningTable, Zone, KitchenItem, Order, PaymentMethod, TableStatus, KitchenStatus, InventoryBatch, Customer } from '../types';
import TableMap from './TableMap';
import TableBoard from './TableBoard';
import {
  OrderOptionsMenu, OptionIcons, MergeTablesDialog, TransferTableDialog, SplitMergeOrderDialog,
  ReservationDialog, KitchenHistoryDialog, OrderInfoDialog, type OptionItem
} from './TableDialogs';
import ReceiptThermal from './ReceiptThermal';
import CheckoutScreen from './CheckoutScreen';
import { logOperation } from '../utils/logger';
import { categoryPlaceholderColor } from '../utils/categoryColor';
import { useMediaQuery } from '../utils/useMediaQuery';
import {
  lineKey, isVirtualCartId, resolvePrimaryId, getGroupLabel, getGroupTables, getTableStats, formatElapsed,
  mergeTables, unmergeTable, transferTable, moveItems, releaseGroup, type MoveSelection
} from '../utils/tableOps';

export interface CartLine {
  productId: string;
  quantity: number;
  note: string;
  size?: string;
  sugarLevel?: string;
  iceLevel?: string;
  /** Số lượng đã báo bếp; lần báo bếp sau chỉ gửi phần chênh lệch (quantity - sentQuantity). */
  sentQuantity?: number;
}

const SIZE_OPTIONS = ['S', 'M', 'L'];
const SUGAR_OPTIONS = ['0%', '30%', '50%', '70%', '100%'];
const ICE_OPTIONS = ['0%', '30%', '50%', '70%', '100%'];
const DEFAULT_SIZE = 'M';
const DEFAULT_SUGAR = '100%';
const DEFAULT_ICE = '100%';

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
  fbUserProfile,
  fbStoreProfile,
  triggerBeep,
  simBatches,
  setSimBatches
}: POSScreenProps) {

  // Tab bên trái cho fnb: "Phòng bàn" (sơ đồ bàn, mặc định) hoặc "Thực đơn" (gọi thêm món)
  const [fnbLeftTab, setFnbLeftTab] = useState<'tables' | 'menu'>('tables');

  // Màn hình lớn (>= lg): 2 cột. Điện thoại/máy tính bảng nhỏ: từng bước Danh sách bàn -> Đơn của bàn -> Thực đơn
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [mobileStep, setMobileStep] = useState<'tables' | 'order' | 'menu'>('tables');

  // Hộp thoại thao tác bàn / đơn (F&B)
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [activeDialog, setActiveDialog] = useState<null | 'merge' | 'transfer' | 'split' | 'combine' | 'reservation' | 'history' | 'info'>(null);

  // Màn hình hiện tại của khu vực bán hàng: chọn món hay đang thanh toán (2 màn tách biệt theo thiết kế mới)
  const [posView, setPosView] = useState<'catalog' | 'checkout'>('catalog');

  const [activeCategory, setActiveCategory] = useState<string>('Tất cả');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [barcodeInputValue, setBarcodeInputValue] = useState<string>('');
  const [showBarcodePanel, setShowBarcodePanel] = useState(false);

  // Custom interactive cash calculator states (dùng chung cho màn Checkout)
  const [cashPadInput, setCashPadInput] = useState<string>('');
  const [cashChangeDue, setCashChangeDue] = useState<number>(0);

  // Trạng thái đang ghi nhận giao dịch trên màn Checkout
  const [checkoutProcessing, setCheckoutProcessing] = useState(false);

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
  // F&B: giỏ hàng của nhóm bàn (bàn gộp dùng chung giỏ của bàn chính) hoặc giỏ ảo Mang về / Giao đi
  const currentCartId = simStoreType === 'fnb'
    ? (isVirtualCartId(simSelectedTableId) ? simSelectedTableId : resolvePrimaryId(simTables, simSelectedTableId))
    : 'retail';
  const currentCart = simCarts[currentCartId] || [];

  // Phương thức thanh toán đang chọn trên màn Checkout
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'qr' | 'card'>('cash');

  // Giảm giá & Thuế VAT áp dụng cho đơn hiện tại
  const [discountInput, setDiscountInput] = useState<number>(0);
  const [vatPercent, setVatPercent] = useState<number>(0);

  useEffect(() => {
    setCashPadInput('');
    setCashChangeDue(0);
    setDiscountInput(0);
    setVatPercent(0);
    setPosView('catalog');
  }, [currentCartId]);

  // Table information
  const selectedTable = simTables.find(t => t.id === currentCartId);
  const isVirtualCart = simStoreType === 'fnb' && isVirtualCartId(currentCartId);
  const selectedTableName = simStoreType === 'fnb' ? getGroupLabel(simTables, currentCartId) : 'Vãng lai';
  const groupTables = simStoreType === 'fnb' && !isVirtualCart ? getGroupTables(simTables, currentCartId) : [];

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
  const itemCount = currentCart.reduce((sum, item) => sum + item.quantity, 0);

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

    // Món đầu tiên của bàn: ghi nhận thời điểm bắt đầu phục vụ (để hiển thị thời gian ngồi)
    if (simStoreType === 'fnb' && selectedTable && currentCart.length === 0 && !selectedTable.openedAt) {
      const openedAt = new Date().toISOString();
      setSimTables(prev => prev.map(t => (t.id === currentCartId ? { ...t, openedAt } : t)));
    }

    playBeep(true);
  };

  // Modify cart quantity
  // Món/đơn hiện tại có thuộc phiếu bếp này không (khớp theo nhãn bàn / nhóm bàn gộp / Mang về)
  const isKitchenItemOfCurrentOrder = (k: KitchenItem) => {
    if (simStoreType !== 'fnb') return false;
    const names = new Set(groupTables.map(t => t.name));
    return isVirtualCart
      ? k.tableNumber === selectedTableName
      : (k.tableNumber || '').split(' + ').some(n => names.has(n));
  };
  const isKitchenActive = (k: KitchenItem) =>
    k.status === KitchenStatus.PENDING || k.status === KitchenStatus.PREPARING || k.status === KitchenStatus.COMPLETED;

  // Đánh dấu "Đã hủy" các món bếp chưa phục vụ của đơn hiện tại (có thể giới hạn theo một dòng món)
  const cancelKitchenItems = (line?: CartLine) => {
    setSimKitchenItems(prev => prev.map(k => {
      if (!isKitchenItemOfCurrentOrder(k) || !isKitchenActive(k)) return k;
      if (line && (k.productId !== line.productId || (k.note || '') !== (line.note || '')
        || (k.size || '') !== (line.size || '') || (k.sugarLevel || '') !== (line.sugarLevel || '')
        || (k.iceLevel || '') !== (line.iceLevel || ''))) return k;
      return { ...k, status: KitchenStatus.CANCELLED };
    }));
  };

  // Xóa hẳn một dòng món khỏi giỏ (nếu đã báo bếp thì hủy luôn phiếu bếp tương ứng)
  const handleRemoveLine = (item: CartLine) => {
    const targetKey = lineKey(item);
    const existing = currentCart.find(i => lineKey(i) === targetKey);
    if (existing && (existing.sentQuantity || 0) > 0) cancelKitchenItems(existing);
    setSimCarts(prev => {
      const prevCart = prev[currentCartId] || [];
      return { ...prev, [currentCartId]: prevCart.filter(i => lineKey(i) !== targetKey) };
    });
    playBeep(true);
  };

  // Tăng / giảm số lượng 1 dòng món; giảm dưới 1 thì xóa dòng
  const handleUpdateQty = (item: CartLine, delta: number) => {
    const targetKey = lineKey(item);
    const existing = currentCart.find(i => lineKey(i) === targetKey);
    if (!existing) return;
    if (existing.quantity + delta < 1) {
      handleRemoveLine(existing);
      return;
    }
    setSimCarts(prev => {
      const prevCart = prev[currentCartId] || [];
      const nextCart = prevCart.map(i => {
        if (lineKey(i) !== targetKey) return i;
        const quantity = i.quantity + delta;
        return { ...i, quantity, sentQuantity: Math.min(i.sentQuantity || 0, quantity) || undefined };
      });
      return { ...prev, [currentCartId]: nextCart };
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
      if (simStoreType === 'fnb') cancelKitchenItems();
      if (simStoreType === 'fnb' && !isVirtualCart) {
        setSimTables(prev => releaseGroup(prev, currentCartId));
      }
      playBeep(true);
    }
  };

  // ------------------------------------------------------------------
  // Thao tác bàn / đơn (F&B): gộp, bỏ gộp, chuyển bàn, tách / ghép đơn, hủy đơn
  // ------------------------------------------------------------------
  const applyTableResult = (result: { tables: DiningTable[]; carts: Record<string, CartLine[]> }) => {
    setSimTables(() => result.tables);
    setSimCarts(() => result.carts);
  };

  const handleMergeTables = (otherIds: string[]) => {
    applyTableResult(mergeTables(simTables, simCarts, currentCartId, otherIds));
    logOperation('Màn hình bán hàng (POS)', 'Gộp bàn', { primary: currentCartId, merged: otherIds });
    setActiveDialog(null);
    playBeep(true);
  };

  const handleUnmergeTable = (childId: string) => {
    setSimTables(prev => unmergeTable(prev, childId));
    logOperation('Màn hình bán hàng (POS)', 'Bỏ gộp bàn', { primary: currentCartId, child: childId });
    playBeep(true);
  };

  const handleTransferTable = (toId: string) => {
    applyTableResult(transferTable(simTables, simCarts, currentCartId, toId));
    logOperation('Màn hình bán hàng (POS)', 'Chuyển bàn', { from: currentCartId, to: toId });
    setSimSelectedTableId(toId);
    setActiveDialog(null);
    playBeep(true);
  };

  const handleMoveItems = (toId: string, selection: MoveSelection) => {
    applyTableResult(moveItems(simTables, simCarts, currentCartId, toId, selection));
    logOperation('Màn hình bán hàng (POS)', 'Tách / ghép đơn', { from: currentCartId, to: toId, selection });
    setActiveDialog(null);
    playBeep(true);
    // Chuyển hết món sang đơn khác: đi theo đơn đó cho thu ngân tiện thao tác tiếp
    const movedAll = currentCart.every(l => (selection[lineKey(l)] || 0) >= l.quantity);
    if (movedAll) setSimSelectedTableId(toId);
  };

  const handleSaveReservation = (patch: Pick<DiningTable, 'reservationName' | 'reservationPhone' | 'reservationTime' | 'reservationNote'>) => {
    if (!selectedTable) return;
    logOperation('Màn hình bán hàng (POS)', 'Đặt bàn trước', { ...selectedTable, ...patch });
    setSimTables(prev => prev.map(t => (t.id === selectedTable.id ? { ...t, ...patch } : t)));
    setActiveDialog(null);
    playBeep(true);
  };

  const handleClearReservation = () => {
    if (!selectedTable) return;
    logOperation('Màn hình bán hàng (POS)', 'Hủy đặt bàn trước', selectedTable);
    setSimTables(prev => prev.map(t => (t.id === selectedTable.id
      ? { ...t, reservationName: '', reservationPhone: '', reservationTime: '', reservationNote: '' }
      : t)));
    setActiveDialog(null);
    playBeep(true);
  };

  const handleCancelOrder = () => {
    if (!confirm(`Hủy đơn hàng của ${selectedTableName}? Toàn bộ món sẽ bị xóa và bàn được trả về trống.`)) return;
    logOperation('Màn hình bán hàng (POS)', 'Hủy đơn hàng', { cartId: currentCartId, lines: currentCart });
    cancelKitchenItems();
    setSimCarts(prev => ({ ...prev, [currentCartId]: [] }));
    if (!isVirtualCart) setSimTables(prev => releaseGroup(prev, currentCartId));
    setMobileStep('tables');
    playBeep(true);
  };

  const handleGuestDelta = (delta: number) => {
    if (!selectedTable) return;
    setSimTables(prev => prev.map(t => (t.id === selectedTable.id
      ? { ...t, guestCount: Math.max(0, Math.min(99, (t.guestCount || 0) + delta)) || undefined }
      : t)));
    playBeep(true);
  };

  // Chọn một bàn / giỏ ảo từ danh sách bàn
  const handleSelectTable = (id: string) => {
    setSimSelectedTableId(id);
    playBeep(true);
    if (!isDesktop) {
      setMobileStep('order');
      return;
    }
    // Máy tính: bàn trống -> mở luôn thực đơn để order; bàn đang dùng -> giữ sơ đồ, đơn hiện bên phải
    const table = simTables.find(t => t.id === id);
    const hasOrder = table
      ? getTableStats(table, simTables, simCarts, simProducts).isOccupied
      : (simCarts[id] || []).length > 0;
    if (!hasOrder) setFnbLeftTab('menu');
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

  // Điều hướng sang màn Checkout riêng biệt (chỉ khi giỏ hàng có món)
  const goToCheckout = () => {
    if (currentCart.length === 0) {
      playBeep(false);
      alert('Giỏ hàng trống! Hãy chọn món trước khi thanh toán.');
      return;
    }
    setCartSheetOpen(false);
    setPosView('checkout');
    playBeep(true);
  };

  // Push Active order items to Kitchen monitor queue
  const handleSendToKitchen = async () => {
    if (currentCart.length === 0) {
      playBeep(false);
      alert('Giỏ hàng trống! Không thể gửi yêu cầu xuống bếp.');
      return;
    }

    // Chỉ gửi phần chưa báo bếp (số lượng - đã báo), tránh tạo phiếu bếp trùng khi thêm món rồi báo lại
    const unsent = currentCart
      .map(item => ({ item, delta: item.quantity - (item.sentQuantity || 0) }))
      .filter(x => x.delta > 0);
    if (unsent.length === 0) {
      playBeep(false);
      alert('Tất cả món trong đơn đã được báo bếp. Hãy thêm món mới rồi báo bếp lại.');
      return;
    }

    const itemsToSend: KitchenItem[] = unsent.map(({ item, delta }) => {
      const prod = simProducts.find(p => p.id === item.productId);
      return {
        id: `K-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        orderId: `ORD-${Date.now().toString().slice(-4)}`,
        productId: item.productId,
        productName: prod?.name || 'Món ăn',
        quantity: delta,
        tableNumber: selectedTableName,
        status: KitchenStatus.PENDING,
        note: item.note || "",
        size: item.size,
        sugarLevel: item.sugarLevel,
        iceLevel: item.iceLevel,
        createdAt: new Date().toISOString()
      };
    });

    // Ghi nhận số lượng đã báo bếp trên từng dòng
    setSimCarts(prev => ({
      ...prev,
      [currentCartId]: (prev[currentCartId] || []).map(l => ({ ...l, sentQuantity: l.quantity }))
    }));

    setSimKitchenItems(prev => [...itemsToSend, ...prev]);

    // Mark dining table(s) as serving status (cả nhóm bàn gộp)
    if (simStoreType === 'fnb' && groupTables.length > 0) {
      const groupIds = new Set(groupTables.map(t => t.id));
      const nowIso = new Date().toISOString();
      setSimTables(prev => prev.map(t => {
        if (!groupIds.has(t.id)) return t;
        return { ...t, status: TableStatus.SERVING, openedAt: t.id === currentCartId ? (t.openedAt || nowIso) : t.openedAt };
      }));
    }

    playBeep(true);
    alert(`Đã báo bếp ${itemsToSend.length} món mới!`);
  };

  // Execute checkout and finalize order payment
  const handleCheckoutSubmit = (method: 'cash' | 'qr' | 'card') => {
    if (currentCart.length === 0) {
      playBeep(false);
      return;
    }

    setPaymentMethod(method);
    setCheckoutProcessing(true);
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
        paymentMethod: method === 'cash' ? PaymentMethod.CASH : method === 'qr' ? PaymentMethod.QR : PaymentMethod.CARD,
        paidAmount: method === 'cash' ? (parseInt(cashPadInput) || grandTotal) : grandTotal,
        changeAmount: method === 'cash' ? cashChangeDue : 0,
        staffId: fbUserProfile?.uid || 'staff-01',
        staffName: fbUserProfile?.name || '',
        customerPointsEarned: pointsEarned,
        createdAt: new Date().toISOString()
      };

      if (selectedCustomerId) {
        newOrder.customerId = selectedCustomerId;
      }
      if (simStoreType === 'fnb') {
        newOrder.tableNumber = selectedTableName;
        if (isVirtualCart) {
          newOrder.orderType = 'takeaway';
        } else {
          newOrder.tableId = currentCartId;
          newOrder.orderType = 'dine-in';
        }
      }

      logOperation('Màn hình bán hàng (POS)', 'Thanh toán đơn hàng', newOrder);

      setSimOrders(prev => [newOrder, ...prev]);
      setLastPlacedOrder(newOrder);

      if (simStoreType === 'fnb' && !isVirtualCart) {
        // Thanh toán xong: trả bàn và xóa phiếu đặt trước (khách đặt đã dùng bàn)
        const paidIds = new Set(groupTables.map(t => t.id));
        setSimTables(prev => releaseGroup(prev, currentCartId).map(t => (paidIds.has(t.id)
          ? { ...t, reservationName: '', reservationPhone: '', reservationTime: '', reservationNote: '' }
          : t)));
      }

      setSimCarts(prev => ({
        ...prev,
        [currentCartId]: []
      }));

      // Transition to final success & open receipt
      setCheckoutProcessing(false);
      setPosView('catalog');
      setMobileStep('tables');
      setFnbLeftTab('tables');
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

  // ------------------------------------------------------------------
  // Màn hình Thanh toán — tách riêng khỏi màn chọn món (đúng luồng thiết kế mới)
  // ------------------------------------------------------------------
  if (posView === 'checkout') {
    return (
      <div id="pos-checkout-view">
        <CheckoutScreen
          storeType={simStoreType}
          contextLabel={simStoreType === 'fnb' ? selectedTableName : 'Đơn bán lẻ'}
          itemCount={itemCount}
          cartSubtotal={cartSubtotal}
          discountInput={discountInput}
          setDiscountInput={setDiscountInput}
          vatPercent={vatPercent}
          setVatPercent={setVatPercent}
          discountAmount={discountAmount}
          taxAmount={taxAmount}
          grandTotal={grandTotal}
          customers={simCustomers}
          selectedCustomerId={selectedCustomerId}
          setSelectedCustomerId={setSelectedCustomerId}
          showAddCustomer={showAddCustomer}
          setShowAddCustomer={setShowAddCustomer}
          newCustName={newCustName}
          setNewCustName={setNewCustName}
          newCustPhone={newCustPhone}
          setNewCustPhone={setNewCustPhone}
          handleAddNewCustomer={handleAddNewCustomer}
          pointsToEarn={Math.floor(grandTotal / 10000)}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          cashPadInput={cashPadInput}
          cashChangeDue={cashChangeDue}
          handleCashPadPress={handleCashPadPress}
          setCashPadInput={setCashPadInput}
          setCashChangeDue={setCashChangeDue}
          processing={checkoutProcessing}
          onBack={() => setPosView('catalog')}
          onComplete={handleCheckoutSubmit}
          playBeep={playBeep}
        />

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
      </div>
    );
  }

  // Danh sách dòng món trong giỏ (dùng chung cho cột giỏ hàng desktop và màn hình đơn trên điện thoại)
  const renderCartLines = () => (
    <>
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
                    {simStoreType === 'fnb' && (item.sentQuantity || 0) > 0 && (
                      <span className="m3-badge m3-badge-success ml-2">Đã báo bếp {item.sentQuantity}/{item.quantity}</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveLine(item)}
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
    </>
  );

  // ------------------------------------------------------------------
  // F&B: thanh thông tin đơn, menu tuỳ chọn và các hộp thoại thao tác
  // ------------------------------------------------------------------
  const groupNames = new Set(groupTables.map(t => t.name));
  const kitchenHistory = simStoreType === 'fnb'
    ? simKitchenItems.filter(k => (isVirtualCart ? k.tableNumber === selectedTableName : k.tableNumber.split(' + ').some(n => groupNames.has(n))))
    : [];
  const hasOrderToCancel = currentCart.length > 0 || groupTables.length > 1;

  const optionGroups: OptionItem[][] = [
    [
      { key: 'history', icon: OptionIcons.history, label: 'Lịch sử báo bếp', onClick: () => setActiveDialog('history') },
    ],
    [
      { key: 'merge', icon: OptionIcons.merge, label: 'Gộp bàn', onClick: () => setActiveDialog('merge'), disabled: isVirtualCart },
      { key: 'transfer', icon: OptionIcons.transfer, label: 'Chuyển bàn', onClick: () => setActiveDialog('transfer'), disabled: isVirtualCart },
      { key: 'split', icon: OptionIcons.split, label: 'Tách đơn', onClick: () => setActiveDialog('split'), disabled: currentCart.length === 0 },
      { key: 'combine', icon: OptionIcons.combine, label: 'Ghép đơn', onClick: () => setActiveDialog('combine'), disabled: currentCart.length === 0 },
      { key: 'reservation', icon: OptionIcons.reservation, label: 'Phiếu đặt bàn', onClick: () => setActiveDialog('reservation'), disabled: isVirtualCart },
    ],
    [
      { key: 'info', icon: OptionIcons.info, label: 'Thông tin đơn hàng', onClick: () => setActiveDialog('info') },
    ],
    [
      { key: 'cancel', icon: OptionIcons.cancel, label: 'Hủy đơn hàng', onClick: handleCancelOrder, disabled: !hasOrderToCancel, danger: true },
    ],
  ];

  const optionsButton = simStoreType === 'fnb' ? (
    <button onClick={() => setOptionsOpen(true)} className="m3-icon-btn !w-10 !h-10" aria-label="Tùy chọn đơn hàng" title="Tùy chọn đơn hàng">
      <MoreVertical className="w-5 h-5" />
    </button>
  ) : null;

  // Chip thông tin: số khách, thời gian ngồi, bàn gộp, đặt trước
  const orderMetaRow = simStoreType === 'fnb' && !isVirtualCart && selectedTable ? (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-0.5 rounded-full border border-outline-variant bg-surface-container-lowest">
        <button onClick={() => handleGuestDelta(-1)} className="m3-icon-btn !w-9 !h-9" aria-label="Giảm số khách"><Minus className="w-3.5 h-3.5" /></button>
        <span className="flex items-center gap-1 text-sm font-bold text-on-surface px-1 text-center"><Users className="w-3.5 h-3.5" />{selectedTable.guestCount || 0} khách</span>
        <button onClick={() => handleGuestDelta(1)} className="m3-icon-btn !w-9 !h-9" aria-label="Tăng số khách"><Plus className="w-3.5 h-3.5" /></button>
      </div>
      {selectedTable.openedAt && (
        <span className="m3-badge m3-badge-neutral"><Timer className="w-3.5 h-3.5" />{formatElapsed(selectedTable.openedAt)}</span>
      )}
      {groupTables.length > 1 && (
        <span className="m3-badge m3-badge-warning"><Link2 className="w-3.5 h-3.5" />Gộp {groupTables.length} bàn</span>
      )}
      {selectedTable.reservationName && (
        <button onClick={() => setActiveDialog('reservation')} className="m3-badge m3-badge-warning cursor-pointer">
          <CalendarClock className="w-3.5 h-3.5" />{selectedTable.reservationName}{selectedTable.reservationTime ? ` · ${selectedTable.reservationTime}` : ''}
        </button>
      )}
    </div>
  ) : null;

  const dialogsNode = simStoreType === 'fnb' ? (
    <>
      {optionsOpen && <OrderOptionsMenu title={selectedTableName} groups={optionGroups} onClose={() => setOptionsOpen(false)} />}
      {activeDialog === 'merge' && !isVirtualCart && (
        <MergeTablesDialog
          currentId={currentCartId}
          tables={simTables}
          zones={simZones}
          carts={simCarts}
          products={simProducts}
          onConfirm={handleMergeTables}
          onUnmerge={handleUnmergeTable}
          onClose={() => setActiveDialog(null)}
        />
      )}
      {activeDialog === 'transfer' && !isVirtualCart && (
        <TransferTableDialog
          currentId={currentCartId}
          tables={simTables}
          zones={simZones}
          carts={simCarts}
          onConfirm={handleTransferTable}
          onClose={() => setActiveDialog(null)}
        />
      )}
      {(activeDialog === 'split' || activeDialog === 'combine') && (
        <SplitMergeOrderDialog
          currentId={currentCartId}
          initialMode={activeDialog === 'combine' ? 'combine' : 'split'}
          tables={simTables}
          zones={simZones}
          carts={simCarts}
          products={simProducts}
          onConfirm={handleMoveItems}
          onClose={() => setActiveDialog(null)}
        />
      )}
      {activeDialog === 'reservation' && selectedTable && (
        <ReservationDialog
          table={selectedTable}
          onSave={handleSaveReservation}
          onClear={handleClearReservation}
          onClose={() => setActiveDialog(null)}
        />
      )}
      {activeDialog === 'history' && (
        <KitchenHistoryDialog label={selectedTableName} items={kitchenHistory} onClose={() => setActiveDialog(null)} />
      )}
      {activeDialog === 'info' && (
        <OrderInfoDialog
          label={selectedTableName}
          openedAt={selectedTable?.openedAt}
          guests={selectedTable?.guestCount || 0}
          itemCount={itemCount}
          total={grandTotal}
          kitchenSent={kitchenHistory.length}
          onClose={() => setActiveDialog(null)}
        />
      )}
    </>
  ) : null;

  const receiptNode = thermalReceiptOpen && lastPlacedOrder ? (
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
  ) : null;

  // Nội dung giỏ hàng hiện tại: danh sách món + tổng tạm tính + nút hành động
  const cartColumn = (
    <div className="flex flex-col min-h-0">
      <div className="pb-3 shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <ShoppingCart className="w-4 h-4 text-primary shrink-0" />
            <span className="text-base font-bold text-on-surface truncate">
              {simStoreType === 'fnb' ? selectedTableName : 'Đơn bán lẻ'}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {optionsButton}
            <button onClick={handleClearCart} className="m3-btn-text !min-h-8 !px-2 text-sm">
              Xóa hết
            </button>
          </div>
        </div>
        {orderMetaRow}
      </div>

      {currentCart.length === 0 ? (
        <div className="py-16 text-center text-on-surface-variant flex flex-col items-center justify-center gap-2">
          <ShoppingCart className="w-8 h-8 text-outline-variant" />
          <p className="text-base font-bold">Đơn hàng trống</p>
          <p className="text-sm">Chạm vào món trong danh mục để thêm vào đơn.</p>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[280px] lg:max-h-[360px] overflow-y-auto pr-1 -mr-1">
          {renderCartLines()}
        </div>
      )}

      {/* Tổng kết đơn + hành động chính */}
      <div className="pt-3 mt-3 border-t border-outline-variant space-y-3 shrink-0">
        <div className="flex justify-between items-center pt-1">
          <span className="text-base font-bold text-on-surface">Tổng tạm tính</span>
          <span className="text-xl font-bold text-primary">{cartSubtotal.toLocaleString('vi-VN')} đ</span>
        </div>

        {simStoreType === 'fnb' ? (
          <div className="space-y-2">
            <button onClick={handleSendToKitchen} className="m3-btn-filled w-full !min-h-12">
              <ChefHat className="w-4.5 h-4.5" /> Gửi bếp / phục vụ
            </button>
            <button onClick={goToCheckout} className="m3-btn-tonal w-full !min-h-12">
              <Landmark className="w-4 h-4" /> Tính hóa đơn / Thanh toán
            </button>
          </div>
        ) : (
          <button onClick={goToCheckout} className="m3-btn-filled w-full !min-h-12 !bg-secondary !text-on-secondary">
            <Printer className="w-4 h-4" /> Tiến hành thanh toán
          </button>
        )}
      </div>
    </div>
  );

  // ------------------------------------------------------------------
  // F&B trên điện thoại: Danh sách bàn -> Đơn của bàn -> Thực đơn (mỗi bước một màn hình)
  // ------------------------------------------------------------------
  if (simStoreType === 'fnb' && !isDesktop) {
    const elapsedLabel = selectedTable?.openedAt ? formatElapsed(selectedTable.openedAt) : '';

    return (
      <div id="pos-mobile-fnb" className="pb-44">
        {mobileStep === 'tables' && (
          <div className="m3-card p-3.5">
            <TableBoard
              tables={simTables}
              zones={simZones}
              carts={simCarts}
              products={simProducts}
              selectedId={simSelectedTableId}
              onSelect={handleSelectTable}
            />
          </div>
        )}

        {mobileStep === 'order' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={() => { setMobileStep('tables'); playBeep(true); }} className="m3-icon-btn bg-surface-container-lowest border border-outline-variant" aria-label="Quay lại danh sách bàn">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-black text-on-surface truncate leading-tight">{selectedTableName}</h2>
                {elapsedLabel && <p className="text-sm text-on-surface-variant font-semibold">Đã ngồi {elapsedLabel}</p>}
              </div>
              {optionsButton && (
                <button onClick={() => setOptionsOpen(true)} className="m3-icon-btn bg-surface-container-lowest border border-outline-variant" aria-label="Tùy chọn đơn hàng">
                  <MoreVertical className="w-5 h-5" />
                </button>
              )}
            </div>

            {orderMetaRow}

            {currentCart.length === 0 ? (
              <div className="m3-card py-14 px-4 text-center text-on-surface-variant flex flex-col items-center gap-2">
                <UtensilsCrossed className="w-9 h-9 text-outline-variant" />
                <p className="text-base font-bold">Chưa có món nào</p>
                <p className="text-sm">Nhấn nút + để chọn món cho {selectedTableName}.</p>
                <button onClick={() => { setMobileStep('menu'); playBeep(true); }} className="m3-btn-filled mt-2 !min-h-12">
                  <Plus className="w-4 h-4" /> Thêm món
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">{renderCartLines()}</div>
            )}
          </div>
        )}

        {mobileStep === 'menu' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={() => { setMobileStep('order'); playBeep(true); }} className="m3-icon-btn bg-surface-container-lowest border border-outline-variant" aria-label="Quay lại đơn hàng">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-black text-on-surface truncate leading-tight">Thực đơn</h2>
                <p className="text-sm text-on-surface-variant font-semibold truncate">Đang gọi món cho {selectedTableName}</p>
              </div>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm món (Tên, Mã)"
                className="m3-input !rounded-full pl-10"
              />
            </div>

            <DragScrollRow className="gap-2 pb-1">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => { setActiveCategory(cat); playBeep(true); }}
                  className={`m3-chip !rounded-full whitespace-nowrap ${activeCategory === cat ? '!bg-primary !border-primary !text-on-primary' : ''}`}
                >
                  {cat}
                </button>
              ))}
            </DragScrollRow>

            <div className="m3-card divide-y divide-outline-variant/60 overflow-hidden">
              {filteredProducts.map(prod => {
                const qtyInCart = currentCart.filter(i => i.productId === prod.id).reduce((sum, i) => sum + i.quantity, 0);
                return (
                  <button
                    key={prod.id}
                    onClick={() => handleAddToCart(prod)}
                    disabled={!prod.isAvailable}
                    className={`w-full flex items-center gap-3 p-2.5 text-left transition-colors ${prod.isAvailable ? 'active:bg-surface-container' : 'opacity-50 cursor-not-allowed'}`}
                  >
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0">
                      {prod.imageUrl ? (
                        <img src={prod.imageUrl} alt={prod.name} className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <div className={`absolute inset-0 flex items-center justify-center text-xl font-black ${categoryPlaceholderColor(prod.category)}`}>
                          {prod.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-base font-bold text-on-surface line-clamp-2 leading-snug">{prod.name}</h4>
                      <span className="text-sm font-bold text-primary">{prod.isAvailable ? `${prod.price.toLocaleString('vi-VN')}đ` : 'Hết hàng'}</span>
                    </div>
                    {qtyInCart > 0 && (
                      <span className="bg-primary text-on-primary min-w-7 h-7 px-1.5 rounded-full flex items-center justify-center text-sm font-bold">{qtyInCart}</span>
                    )}
                    <span className="m3-icon-btn !w-10 !h-10 bg-primary-container text-on-primary-container"><Plus className="w-5 h-5" /></span>
                  </button>
                );
              })}
              {filteredProducts.length === 0 && (
                <p className="p-6 text-center text-base font-bold text-on-surface-variant">Không tìm thấy món phù hợp</p>
              )}
            </div>
          </div>
        )}

        {/* Nút nổi + thêm món (màn Đơn của bàn) */}
        {mobileStep === 'order' && currentCart.length > 0 && (
          <button
            onClick={() => { setMobileStep('menu'); playBeep(true); }}
            className="fixed right-4 bottom-[calc(11rem+var(--safe-bottom))] z-20 w-14 h-14 rounded-2xl bg-primary text-on-primary shadow-xl flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Thêm món"
          >
            <Plus className="w-7 h-7" />
          </button>
        )}

        {/* Thanh hành động dính đáy */}
        {mobileStep === 'order' && (
          <div className="fixed inset-x-0 bottom-[calc(4rem+var(--safe-bottom))] z-20 bg-surface border-t border-outline-variant p-3 space-y-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between">
              <span className="text-base font-bold text-on-surface flex items-center gap-2">
                Tổng tiền <span className="min-w-6 h-6 px-1.5 rounded-full bg-primary text-on-primary text-sm flex items-center justify-center">{itemCount}</span>
              </span>
              <span className="text-xl font-black text-primary">{grandTotal.toLocaleString('vi-VN')}đ</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleSendToKitchen} disabled={currentCart.length === 0} className="m3-btn-tonal !min-h-12 disabled:opacity-40">
                <ChefHat className="w-4 h-4" /> Báo bếp
              </button>
              <button onClick={goToCheckout} disabled={currentCart.length === 0} className="m3-btn-filled !min-h-12 disabled:opacity-40">
                <Landmark className="w-4 h-4" /> Thanh toán
              </button>
            </div>
          </div>
        )}

        {mobileStep === 'menu' && (
          <div className="fixed inset-x-0 bottom-[calc(4rem+var(--safe-bottom))] z-20 bg-surface border-t border-outline-variant p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
            <button onClick={() => { setMobileStep('order'); playBeep(true); }} className="m3-btn-filled w-full !min-h-12 justify-between">
              <span className="flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Xem đơn · {itemCount} món</span>
              <span>{grandTotal.toLocaleString('vi-VN')}đ</span>
            </button>
          </div>
        )}

        {dialogsNode}
        {receiptNode}
      </div>
    );
  }

  return (
    <div id="pos-screen-layout" className="pb-40 lg:pb-0">

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start">

        {/* Cột trái: Phòng bàn (fnb) hoặc lưới sản phẩm */}
        <div className="lg:col-span-7 space-y-3">

          {simStoreType === 'fnb' && (
            <div className="flex bg-surface-container-high p-1 rounded-2xl border border-outline-variant gap-1">
              <button
                onClick={() => { setFnbLeftTab('tables'); playBeep(true); }}
                className={`flex-1 flex items-center justify-center gap-1.5 min-h-11 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                  fnbLeftTab === 'tables' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <LayoutGrid className="w-4 h-4" /> Phòng bàn
              </button>
              <button
                onClick={() => { setFnbLeftTab('menu'); playBeep(true); }}
                className={`flex-1 flex items-center justify-center gap-1.5 min-h-11 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                  fnbLeftTab === 'menu' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <UtensilsCrossed className="w-4 h-4" /> Thực đơn
              </button>
            </div>
          )}

          {simStoreType === 'fnb' && fnbLeftTab === 'tables' ? (
            <div className="m3-card p-4">
              <TableBoard
                tables={simTables}
                zones={simZones}
                carts={simCarts}
                products={simProducts}
                selectedId={simSelectedTableId}
                onSelect={handleSelectTable}
              />
            </div>
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
                <div className="flex items-center gap-2">
                  <span className="text-sm text-on-surface-variant font-semibold">{filteredProducts.length} món</span>
                  {simStoreType === 'retail' && (
                    <button
                      onClick={() => { setShowBarcodePanel(v => !v); playBeep(true); }}
                      className={`m3-icon-btn !w-9 !h-9 ${showBarcodePanel ? 'bg-primary-container text-on-primary-container' : ''}`}
                      title="Quét mã vạch"
                    >
                      <ScanLine className="w-4.5 h-4.5" />
                    </button>
                  )}
                </div>
              </div>

              {showBarcodePanel && simStoreType === 'retail' && (
                <form onSubmit={handleSimulateBarcodeScan} className="p-3 bg-surface-container rounded-2xl space-y-2">
                  <label className="text-sm font-semibold text-on-surface-variant">Nhập tay SKU / mã vạch</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={barcodeInputValue}
                      onChange={(e) => setBarcodeInputValue(e.target.value)}
                      placeholder="8930001001..."
                      className="m3-input flex-1 font-mono"
                      autoFocus
                    />
                    <button type="submit" className="m3-btn-filled !min-h-11 !px-4">
                      Quét
                    </button>
                  </div>
                </form>
              )}

              <div className="relative">
                <Search className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Tìm sản phẩm (Tên, Mã)"
                  className="m3-input !rounded-full pl-10"
                />
              </div>

              <DragScrollRow className="gap-2 pb-1">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => { setActiveCategory(cat); playBeep(true); }}
                    className={`m3-chip !rounded-full whitespace-nowrap ${activeCategory === cat ? 'm3-chip-selected' : ''}`}
                  >
                    {cat}
                  </button>
                ))}
              </DragScrollRow>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[480px] overflow-y-auto pr-1 -mr-1">
                {filteredProducts.map(prod => (
                  <button
                    key={prod.id}
                    onClick={() => handleAddToCart(prod)}
                    disabled={!prod.isAvailable}
                    className={`rounded-2xl border text-left flex flex-col overflow-hidden cursor-pointer transition-colors relative ${
                      prod.isAvailable
                        ? 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container active:bg-surface-container-high'
                        : 'border-outline-variant/50 bg-surface-container-lowest opacity-50 cursor-not-allowed'
                    }`}
                  >
                    {(() => {
                      const qtyInCart = currentCart.filter(i => i.productId === prod.id).reduce((s, i) => s + i.quantity, 0);
                      return qtyInCart > 0 ? (
                        <span className="absolute top-2 right-2 z-10 bg-primary text-on-primary w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold shadow">
                          {qtyInCart}
                        </span>
                      ) : null;
                    })()}
                    <div className="relative aspect-[4/3] w-full shrink-0">
                      {prod.imageUrl ? (
                        <img src={prod.imageUrl} alt={prod.name} className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <div className={`absolute inset-0 flex items-center justify-center text-2xl font-black ${categoryPlaceholderColor(prod.category)}`}>
                          {prod.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {!prod.isAvailable && (
                        <span className="absolute top-1.5 left-1.5 text-sm px-1.5 py-0.5 rounded-full font-bold bg-error-container text-on-error-container">
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

        {/* Giỏ hàng: sidebar cố định trên desktop, bottom sheet trên di động */}
        <div
          className={`fixed inset-x-0 bottom-[calc(4rem+var(--safe-bottom))] z-40 bg-surface rounded-t-3xl shadow-2xl border-t border-outline-variant
            max-h-[76vh] flex flex-col transition-transform duration-300 ease-out
            ${cartSheetOpen ? 'translate-y-0' : 'translate-y-full pointer-events-none'}
            lg:static lg:col-span-5 lg:translate-y-0 lg:pointer-events-auto lg:max-h-none lg:shadow-none lg:border-0 lg:bg-transparent`}
        >
          <div className="lg:hidden flex justify-center pt-2.5 shrink-0">
            <div className="w-10 h-1.5 rounded-full bg-outline-variant" />
          </div>
          <div className="lg:hidden flex items-center justify-between px-4 pt-1 pb-2 shrink-0">
            <h3 className="text-base font-bold text-on-surface">Đơn hàng</h3>
            <button onClick={() => setCartSheetOpen(false)} className="m3-icon-btn">
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:overflow-visible lg:px-0 lg:pb-0">
            <div className="m3-card p-4 sm:p-5 lg:!bg-transparent lg:!border-0 lg:!rounded-none lg:p-0">
              {cartColumn}
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

      {/* Thanh giỏ hàng dính đáy trên di động — chạm khu tổng để xem giỏ, chạm nút phải để thao tác chính */}
      {!cartSheetOpen && currentCart.length > 0 && (
        <div className="lg:hidden fixed inset-x-0 bottom-[calc(4rem+var(--safe-bottom))] z-20 pointer-events-none">
          <div className="bg-gradient-to-t from-background via-background/90 to-transparent h-10" />
          <div className="p-3 bg-background pointer-events-auto">
            <div className="bg-primary rounded-2xl shadow-xl flex items-center justify-between p-2.5 gap-2">
              <button onClick={() => setCartSheetOpen(true)} className="flex items-center gap-3 text-on-primary flex-1 min-w-0 text-left pl-1.5">
                <div className="relative shrink-0">
                  <ShoppingCart className="w-6 h-6" />
                  <span className="absolute -top-1.5 -right-2 bg-error text-on-error text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {itemCount}
                  </span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold opacity-90">Tổng: {itemCount} món</span>
                  <span className="text-lg font-bold truncate">{grandTotal.toLocaleString('vi-VN')} đ</span>
                </div>
              </button>
              {simStoreType === 'fnb' ? (
                <button onClick={handleSendToKitchen} className="bg-secondary text-on-secondary min-h-13 px-4 rounded-xl text-sm font-bold shadow-sm flex items-center gap-1.5 shrink-0">
                   <ChefHat className="w-4 h-4" /> Gửi bếp
                </button>
              ) : (
                <button onClick={goToCheckout} className="bg-secondary text-on-secondary min-h-13 px-4 rounded-xl text-sm font-bold shadow-sm flex items-center gap-1.5 shrink-0">
                  Thanh toán <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Nút mở giỏ hàng trống trên di động (chưa có món) */}
      {!cartSheetOpen && currentCart.length === 0 && (
        <div className="lg:hidden fixed inset-x-0 bottom-[calc(4rem+var(--safe-bottom))] z-20 p-3 bg-surface border-t border-outline-variant">
          <button onClick={() => setCartSheetOpen(true)} className="m3-btn-tonal w-full !min-h-12 justify-center">
             <ShoppingCart className="w-4 h-4" /> Xem đơn hàng
          </button>
        </div>
      )}

      {/* Overlay: High fidelity Thermal print receipt visualizer popup */}
      {receiptNode}

      {/* Hộp thoại thao tác bàn / đơn (F&B) */}
      {dialogsNode}

      {/* Overlay: Table map popup for easy dining table selections */}
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
