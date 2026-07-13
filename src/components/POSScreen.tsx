/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Coffee, ShoppingBag, Trash2, Plus, Minus, ScanLine, Printer, 
  X, Landmark, Smartphone, CheckCircle, RefreshCw, AlertCircle, ShoppingCart, Tag, Edit3, ClipboardList,
  UserPlus, Coins, User, Wallet, ChefHat
} from 'lucide-react';
import { Product, DiningTable, Zone, KitchenItem, Order, PaymentMethod, TableStatus, KitchenStatus, InventoryBatch } from '../types';
import TableMap from './TableMap';
import KitchenDisplay from './KitchenDisplay';
import ReceiptThermal from './ReceiptThermal';
import { logOperation } from '../utils/logger';
import { db } from '../firebase';
import { doc, setDoc, writeBatch, collection, onSnapshot } from 'firebase/firestore';
import { queueOfflineOperation } from '../utils/offlineManager';

interface POSScreenProps {
  simStoreType: 'fnb' | 'retail';
  setSimStoreType: (type: 'fnb' | 'retail') => void;
  simProducts: Product[];
  simTables: DiningTable[];
  setSimTables: React.Dispatch<React.SetStateAction<DiningTable[]>>;
  simZones: Zone[];
  setSimZones: React.Dispatch<React.SetStateAction<Zone[]>>;
  simCarts: Record<string, Array<{ productId: string; quantity: number; note: string }>>;
  setSimCarts: React.Dispatch<React.SetStateAction<Record<string, Array<{ productId: string; quantity: number; note: string }>>>>;
  simKitchenItems: KitchenItem[];
  setSimKitchenItems: React.Dispatch<React.SetStateAction<KitchenItem[]>>;
  simOrders: Order[];
  setSimOrders: React.Dispatch<React.SetStateAction<Order[]>>;
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

  // Loyalty Customers
  const [simCustomers, setSimCustomers] = useState<Array<{ id: string; name: string; phone: string; points: number }>>([
    { id: 'C1', name: 'Nguyễn Văn Anh', phone: '0901234567', points: 150 },
    { id: 'C2', name: 'Trần Thị Bình', phone: '0987654321', points: 45 },
    { id: 'C3', name: 'Lê Hoàng Minh', phone: '0912345678', points: 310 },
    { id: 'C4', name: 'Phạm Hồng Nhung', phone: '0933445566', points: 12 }
  ]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');

  const storeId = fbUserProfile?.storeId || 'Sandbox';
  useEffect(() => {
    if (isDemoOfflineMode || !storeId) return;
    const unsubscribe = onSnapshot(collection(db, 'stores', storeId, 'customers'), (snapshot) => {
      const customersData: any[] = [];
      snapshot.forEach((doc) => {
        customersData.push({ id: doc.id, ...doc.data() });
      });
      if (customersData.length > 0) {
        setSimCustomers(customersData);
      }
    });
    return unsubscribe;
  }, [isDemoOfflineMode, storeId]);
  
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

  useEffect(() => {
    setCashPadInput('');
    setCashChangeDue(0);
    setShowPaymentOptions(false);
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
      const existingIdx = prevCart.findIndex(item => item.productId === product.id && item.note === customNote);
      
      let nextCart;
      if (existingIdx > -1) {
        nextCart = prevCart.map((item, idx) => {
          if (idx === existingIdx) {
            return { ...item, quantity: item.quantity + 1 };
          }
          return item;
        });
      } else {
        nextCart = [...prevCart, { productId: product.id, quantity: 1, note: customNote }];
      }

      return {
        ...prev,
        [currentCartId]: nextCart
      };
    });

    playBeep(true);
  };

  // Modify cart quantity
  const handleUpdateQty = (prodId: string, delta: number, note: string) => {
    setSimCarts(prev => {
      const prevCart = prev[currentCartId] || [];
      const targetIdx = prevCart.findIndex(item => item.productId === prodId && item.note === note);
      if (targetIdx === -1) return prev;

      let nextCart = prevCart.map((item, idx) => {
        if (idx === targetIdx) {
          const nextQty = item.quantity + delta;
          return { ...item, quantity: Math.max(1, nextQty) };
        }
        return item;
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
  const handleUpdateItemNote = (prodId: string, currentNote: string) => {
    const newNote = prompt('Nhập ghi chú cho sản phẩm (Ví dụ: ít đường, nhiều đá, chín kỹ...):', currentNote);
    if (newNote === null) return;

    setSimCarts(prev => {
      const prevCart = prev[currentCartId] || [];
      const nextCart = prevCart.map(item => {
        if (item.productId === prodId && item.note === currentNote) {
          return { ...item, note: newNote.trim() };
        }
        return item;
      });
      return { ...prev, [currentCartId]: nextCart };
    });
    playBeep(true);
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
    
    const newId = `C-${Date.now()}`;
    const newCust = {
      id: newId,
      name: newCustName.trim(),
      phone: newCustPhone.trim(),
      points: 0
    };
    
    if (!isDemoOfflineMode && storeId) {
      try {
        await setDoc(doc(db, 'stores', storeId, 'customers', newId), newCust);
      } catch (err) {
        console.error("Lỗi thêm khách hàng mới lên Firestore: ", err);
      }
    } else {
      setSimCustomers(prev => [...prev, newCust]);
    }
    setSelectedCustomerId(newId);
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
      setCashChangeDue(Math.max(0, paid - cartSubtotal));
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
        createdAt: new Date().toISOString()
      };
    });

    if (!isDemoOfflineMode && storeId) {
      try {
        const batch = writeBatch(db);
        itemsToSend.forEach(item => {
          batch.set(doc(db, 'stores', storeId, 'kitchenItems', item.id), item);
        });
        if (simStoreType === 'fnb' && selectedTable) {
          batch.set(doc(db, 'stores', storeId, 'tables', simSelectedTableId), {
            ...selectedTable,
            status: TableStatus.SERVING
          });
        }
        await batch.commit();
      } catch (err) {
        console.error("Lỗi gửi bếp hoặc cập nhật bàn lên Firestore: ", err);
      }
    } else {
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
          batchCode: activeBatch?.batchCode
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

      const pointsEarned = Math.floor(cartSubtotal / 10000); // 1 point per 10k VND

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
        totalAmount: cartSubtotal,
        paymentMethod: paymentMethod === 'cash' ? PaymentMethod.CASH : paymentMethod === 'qr' ? PaymentMethod.QR : PaymentMethod.CARD,
        paidAmount: paymentMethod === 'cash' ? (parseInt(cashPadInput) || cartSubtotal) : cartSubtotal,
        changeAmount: paymentMethod === 'cash' ? cashChangeDue : 0,
        staffId: fbUserProfile?.uid || 'staff-01',
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

      if (!isDemoOfflineMode && storeId) {
        try {
          const batch = writeBatch(db);
          // 1. Write order
          batch.set(doc(db, 'stores', storeId, 'orders', orderId), newOrder);

          // 2. Clear table status in F&B
          if (simStoreType === 'fnb' && selectedTable) {
            batch.set(doc(db, 'stores', storeId, 'tables', simSelectedTableId), {
              ...selectedTable,
              status: TableStatus.EMPTY
            });
          }

          // 3. Deduct inventory batch quantities in retail
          if (simStoreType === 'retail') {
            orderItems.forEach(oi => {
              if (oi.batchId) {
                const activeBatch = simBatches.find(b => b.id === oi.batchId);
                if (activeBatch) {
                  batch.set(doc(db, 'stores', storeId, 'batches', oi.batchId), {
                    ...activeBatch,
                    quantity: Math.max(0, activeBatch.quantity - oi.quantity)
                  });
                }
              }
            });
          }

          // 4. Update customer loyalty points
          if (selectedCustomerId) {
            const cust = simCustomers.find(c => c.id === selectedCustomerId);
            if (cust) {
              batch.set(doc(db, 'stores', storeId, 'customers', selectedCustomerId), {
                ...cust,
                points: cust.points + pointsEarned
              });
            }
          }

          await batch.commit();
          setLastPlacedOrder(newOrder);
        } catch (err) {
          console.error("Lỗi đồng bộ thanh toán lên Firestore: ", err);
        }
      } else {
        // Offline mode backup
        queueOfflineOperation(storeId, 'orders', 'set', newOrder.id, newOrder);
        setSimOrders(prev => [newOrder, ...prev]);
        setLastPlacedOrder(newOrder);

        if (simStoreType === 'retail') {
          setSimBatches(prev => prev.map(b => {
            const itemDeducted = orderItems.find(oi => oi.batchId === b.id);
            if (itemDeducted) {
              const updatedBatch = {
                ...b,
                quantity: Math.max(0, b.quantity - itemDeducted.quantity)
              };
              queueOfflineOperation(storeId, 'batches', 'set', b.id, updatedBatch);
              return updatedBatch;
            }
            return b;
          }));
        }

        if (selectedCustomerId) {
          setSimCustomers(prev => prev.map(c => {
            if (c.id === selectedCustomerId) {
              const updatedCust = { ...c, points: c.points + pointsEarned };
              queueOfflineOperation(storeId, 'customers', 'set', selectedCustomerId, updatedCust);
              return updatedCust;
            }
            return c;
          }));
        }

        if (simStoreType === 'fnb' && selectedTable) {
          setSimTables(prev => prev.map(t => {
            if (t.id === simSelectedTableId) {
              const updatedTable = { ...t, status: TableStatus.EMPTY };
              queueOfflineOperation(storeId, 'tables', 'set', simSelectedTableId, updatedTable);
              return updatedTable;
            }
            return t;
          }));
        }
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
      playBeep(true);

    }, 800);
  };

  // Filtering products catalog
  const filteredProducts = simProducts.filter(p => {
    const matchesCategory = activeCategory === 'Tất cả' || p.category === activeCategory;
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.includes(searchTerm);
    return matchesCategory && matchesSearch;
  });

  return (
    <div id="pos-screen-layout" className="space-y-6">
      
      {/* Main 3-column checkout dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Column 1: Catalog Selection list (Left - 5 cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-extrabold text-slate-900 uppercase">Danh mục Sản Phẩm</h3>
            <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full">
              {filteredProducts.length} món
            </span>
          </div>

          {/* Search bar inputs */}
          <div className="flex gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Gõ tìm tên sản phẩm..."
              className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs"
            />
          </div>

          {/* Catalog Categories horizontal selector list */}
          <div className="flex overflow-x-auto gap-1.5 pb-2 scrollbar-none">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => { setActiveCategory(cat); playBeep(true); }}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                  activeCategory === cat 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Visual Catalog cards grid */}
          <div className="grid grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
            {filteredProducts.map(prod => (
              <div
                key={prod.id}
                onClick={() => handleAddToCart(prod)}
                className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between gap-3 cursor-pointer transition-all hover:shadow-sm ${
                  prod.isAvailable 
                    ? 'border-slate-200 bg-white hover:border-blue-400' 
                    : 'border-slate-100 bg-slate-50 opacity-60'
                }`}
              >
                <div>
                  <span className="text-[9px] text-slate-400 font-mono font-bold block">{prod.sku}</span>
                  <h4 className="text-xs font-extrabold text-slate-900 line-clamp-2 mt-0.5">{prod.name}</h4>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                  <span className="text-xs font-black text-blue-600">{prod.price.toLocaleString('vi-VN')}đ</span>
                  <span className={`text-[9px] px-1 py-0.2 rounded font-bold uppercase ${
                    prod.isAvailable ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                  }`}>
                    {prod.isAvailable ? 'Còn hàng' : 'Hết hàng'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Column 2: Active Cart Checkout Pad (Middle - 4 cols) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-sm flex flex-col justify-between min-h-[480px]">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <ShoppingCart className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-extrabold text-slate-900 uppercase">
                  Đơn: <span className="text-indigo-600 font-black">{simStoreType === 'fnb' ? selectedTableName : 'Bán lẻ'}</span>
                </span>
              </div>
              <button 
                onClick={handleClearCart}
                className="text-[10px] font-bold text-slate-400 hover:text-red-600 flex-shrink-0"
              >
                Xóa hết
              </button>
            </div>

            {/* Shopping Cart itemized listing */}
            {currentCart.length === 0 ? (
              <div className="py-20 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <ShoppingCart className="w-8 h-8 text-slate-200 animate-bounce" />
                <p className="font-semibold">Đơn hàng trống</p>
                <p className="text-[10px] text-slate-400">Chọn món trong catalog để thanh toán.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {currentCart.map((item, idx) => {
                  const prod = simProducts.find(p => p.id === item.productId);
                  if (!prod) return null;

                  return (
                    <div key={`${item.productId}-${idx}`} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <h5 className="text-xs font-black text-slate-800 truncate">{prod.name}</h5>
                          <span className="text-[10px] text-blue-600 font-bold">{prod.price.toLocaleString('vi-VN')} đ</span>
                        </div>
                        <button
                          onClick={() => handleUpdateQty(item.productId, -item.quantity, item.note)}
                          className="text-slate-400 hover:text-red-500 p-0.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Modifier quantities & note modifiers */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/50">
                        <button
                          onClick={() => handleUpdateItemNote(item.productId, item.note)}
                          className="text-[10px] font-bold text-slate-500 hover:text-blue-600 flex items-center gap-0.5 font-sans"
                        >
                          <Edit3 className="w-3 h-3" /> {item.note ? `Chú ý: ${item.note}` : '+ Ghi chú'}
                        </button>

                        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-0.5">
                          <button
                            onClick={() => handleUpdateQty(item.productId, -1, item.note)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-black text-slate-800 min-w-5 text-center">{item.quantity}</span>
                          <button
                            onClick={() => handleUpdateQty(item.productId, 1, item.note)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cart checkout CTA bottom panels */}
          <div className="border-t border-slate-200 pt-3 mt-3 space-y-3.5">
            <div className="flex justify-between items-center text-slate-900 font-black">
              <span className="text-xs">TỔNG CẦN THANH TOÁN:</span>
              <span className="text-base text-blue-600">{cartSubtotal.toLocaleString('vi-VN')} đ</span>
            </div>

            {simStoreType === 'fnb' ? (
              // FNB Operations: Gửi Bếp (KDS) only, pay is in the right panel
              <button
                onClick={handleSendToKitchen}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-extrabold tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95 transition-all"
              >
                <ChefHat className="w-4.5 h-4.5 animate-pulse" />
                GỬI PHỤC VỤ & BẾP CHẾ BIẾN (KDS)
              </button>
            ) : (
              // Retail Checkout
              <button
                onClick={() => { setCheckoutModalOpen(true); playBeep(true); }}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/10 active:scale-95 transition-all"
              >
                Tiến hành thanh toán POS <Printer className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Column 3: FloorPlan (FNB) / Scanned & Cash Pad (Retail) (Right - 3 cols) */}
        <div className="lg:col-span-3 space-y-4">
          {simStoreType === 'fnb' ? (
            <div className="space-y-4">
              
              {/* Main integrated billing, cash pad, and loyalty card */}
              <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-sm text-slate-800">
                <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                  <h3 className="text-xs font-black text-slate-900 uppercase flex items-center gap-1.5">
                    <Landmark className="w-4 h-4 text-amber-500" /> Bảng Tính &amp; Thanh Toán
                  </h3>
                  <span className="text-[9px] bg-amber-50 text-amber-600 border border-amber-200 font-bold px-2.5 py-0.5 rounded-full uppercase font-mono">F&amp;B Pay</span>
                </div>

                {/* Sơ đồ phòng bàn được chọn trực tiếp ngay tại đây */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Bàn Thanh Toán / Phục vụ:</label>
                  <select
                    value={simSelectedTableId}
                    onChange={(e) => { setSimSelectedTableId(e.target.value); playBeep(true); }}
                    className="w-full h-11 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3 text-xs font-black focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                  >
                    {simTables.map(t => {
                      const zone = simZones.find(z => z.id === t.zoneId);
                      return (
                        <option key={t.id} value={t.id} className="text-slate-800">
                          🪑 {t.name} ({zone?.name || 'Khu vực'}) - {t.status === TableStatus.SERVING ? '🔴 Có khách' : '🟢 Trống'}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 1. Tổng thanh toán (Read Only) */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Tổng Thanh Toán (Cố định):</label>
                  <div className="h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-bold">Tổng tiền</span>
                    <span className="text-base font-black text-emerald-600 font-mono">
                      {cartSubtotal.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                </div>

                {/* 2. Khách hàng & Tích điểm */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-blue-500" /> Khách Hàng Tích Điểm
                    </label>
                    <button
                      type="button"
                      onClick={() => { setShowAddCustomer(!showAddCustomer); playBeep(true); }}
                      className="text-[9px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                    >
                      <UserPlus className="w-3 h-3" /> {showAddCustomer ? 'Hủy' : '+ Thêm mới'}
                    </button>
                  </div>

                  {showAddCustomer ? (
                    /* Embedded quick customer registration form */
                    <form onSubmit={handleAddNewCustomer} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 animate-fadeIn">
                      <span className="text-[9px] font-black text-blue-600 uppercase block">Thêm khách hàng mới</span>
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={newCustName}
                          onChange={(e) => setNewCustName(e.target.value)}
                          placeholder="Tên khách hàng"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 text-slate-800 rounded-lg text-xs"
                          required
                        />
                        <input
                          type="text"
                          value={newCustPhone}
                          onChange={(e) => setNewCustPhone(e.target.value)}
                          placeholder="Số điện thoại"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 text-slate-800 rounded-lg text-xs"
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[10px] rounded-lg transition-all cursor-pointer"
                      >
                        Lưu khách hàng
                      </button>
                    </form>
                  ) : (
                    /* Customer dropdown selection */
                    <div className="space-y-1.5">
                      <select
                        value={selectedCustomerId}
                        onChange={(e) => { setSelectedCustomerId(e.target.value); playBeep(true); }}
                        className="w-full h-11 px-3 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                      >
                        <option value="">-- Chọn khách hàng thành viên --</option>
                        {simCustomers.map(c => (
                          <option key={c.id} value={c.id} className="text-slate-800">
                            👤 {c.name} ({c.phone}) - {c.points} điểm
                          </option>
                        ))}
                      </select>

                      {selectedCustomerId && (
                        <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl flex justify-between items-center text-[10px] text-indigo-700 animate-fadeIn">
                          <div className="flex items-center gap-1 font-bold">
                            <Coins className="w-3.5 h-3.5 text-amber-500" />
                            <span>Điểm tích lũy hiện có:</span>
                          </div>
                          <span className="font-mono font-black text-xs text-amber-600">
                            {simCustomers.find(c => c.id === selectedCustomerId)?.points || 0} điểm
                          </span>
                        </div>
                      )}

                      <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center text-[10px] text-slate-500">
                        <div className="flex items-center gap-1 font-bold">
                          <Coins className="w-3.5 h-3.5 text-blue-500" />
                          <span>Tích thêm cho đơn này:</span>
                        </div>
                        <span className="font-mono font-black text-xs text-blue-500">
                          +{Math.floor(cartSubtotal / 10000)} điểm
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Conditional show of payment options / calculation block */}
                {!showPaymentOptions ? (
                  <div className="pt-2">
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
                      className="w-full py-4 bg-gradient-to-tr from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-lg shadow-amber-500/25 active:scale-95 transition-all cursor-pointer border border-transparent"
                    >
                      <Landmark className="w-4.5 h-4.5 animate-pulse" />
                      BẤM TÍNH HÓA ĐƠN (CALCULATE)
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 pt-2 border-t border-slate-100">
                    
                    {/* 3. Tiền khách đưa (Input-able) */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Tiền Khách Đưa (Nhập):</label>
                        <button 
                          onClick={() => { setCashPadInput(''); setCashChangeDue(0); playBeep(true); }}
                          className="text-[9px] font-bold text-amber-600 hover:text-amber-700 cursor-pointer"
                        >
                          Xóa nhập lại
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          value={cashPadInput ? (parseInt(cashPadInput) || 0).toLocaleString('vi-VN') + ' đ' : '0 đ'}
                          readOnly
                          placeholder="0 đ"
                          className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm text-right px-3 font-bold text-emerald-600 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* 4. Tiền thối lại (GIANT EYE-CATCHING DESIGN) */}
                    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4.5 text-center shadow-sm space-y-1">
                      <span className="text-[9px] font-extrabold text-rose-600 uppercase tracking-widest block">Số Tiền Thối Lại Cho Khách:</span>
                      <span className="text-2xl font-mono font-black text-rose-600 block tracking-tight">
                        {cashChangeDue.toLocaleString('vi-VN')} đ
                      </span>
                    </div>

                    {/* 5. Chọn phương thức thanh toán trực tiếp */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Hình thức thanh toán:</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { id: 'cash', label: 'Tiền mặt', icon: '💵' },
                          { id: 'qr', label: 'QR Pay', icon: '📱' },
                          { id: 'card', label: 'Thẻ POS', icon: '💳' }
                        ].map(p => {
                          const active = fnbPaymentMethod === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setFnbPaymentMethod(p.id as 'cash' | 'qr' | 'card');
                                if (p.id !== 'cash') {
                                  setCashPadInput(cartSubtotal.toString());
                                  setCashChangeDue(0);
                                } else {
                                  setCashPadInput('');
                                  setCashChangeDue(0);
                                }
                                playBeep(true);
                              }}
                              className={`py-2 px-1 rounded-xl border text-[10px] font-bold transition-all text-center space-y-0.5 cursor-pointer ${
                                active
                                  ? 'bg-amber-500 text-white border-amber-500 shadow-sm shadow-amber-500/10'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              <span className="text-sm block">{p.icon}</span>
                              <span className="block">{p.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 6. GIANT SUBMIT & PRINT RECEIPT BUTTON */}
                    <div>
                      <button
                        onClick={() => {
                          if (currentCart.length === 0) {
                            playBeep(false);
                            alert('Giỏ hàng trống! Hãy chọn món trước khi thanh toán.');
                            return;
                          }
                          handleCheckoutSubmit(fnbPaymentMethod);
                        }}
                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/15 transition-all cursor-pointer"
                      >
                        <Printer className="w-4 h-4 animate-bounce" />
                        HOÀN TẤT &amp; IN HÓA ĐƠN
                      </button>
                    </div>

                    {/* 7. Fast numeric touch keypads for cash input */}
                    {fnbPaymentMethod === 'cash' && (
                      <div className="pt-3 border-t border-slate-100 space-y-2 animate-fadeIn">
                        <span className="text-[9px] font-bold text-slate-500 uppercase block text-center">BÀN PHÍM CHẠM SỐ TIỀN KHÁCH ĐƯA</span>
                        <div className="grid grid-cols-3 gap-1">
                          {['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '000', 'C'].map(val => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => handleCashPadPress(val)}
                              className={`py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                                val === 'C' 
                                  ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100' 
                                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-sm font-black'
                              }`}
                            >
                              {val}
                            </button>
                          ))}
                        </div>

                        {/* Direct quick cash denomination shortcuts */}
                        <div className="grid grid-cols-2 gap-1 pt-1">
                          {[50000, 100000, 200000, 500000].map(amt => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => {
                                setCashPadInput(amt.toString());
                                setCashChangeDue(Math.max(0, amt - cartSubtotal));
                                playBeep(true);
                              }}
                              className="py-1.5 px-1 bg-slate-50 border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 text-slate-600 text-[9px] font-bold rounded-lg transition-colors text-center cursor-pointer"
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
            </div>
          ) : (
            // Retail Utility: Barcode inputs & Num Keypad
            <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-sm">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-900 uppercase flex items-center gap-1.5">
                  <ScanLine className="w-4 h-4 text-blue-600 animate-pulse" /> Giả Lập Quét Mã
                </h3>
              </div>

              {/* Barcode scanner sim */}
              <form onSubmit={handleSimulateBarcodeScan} className="space-y-2">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Nhập tay SKU mã vạch</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={barcodeInputValue}
                    onChange={(e) => setBarcodeInputValue(e.target.value)}
                    placeholder="8930001001..."
                    className="flex-1 px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-mono"
                  />
                  <button
                    type="submit"
                    className="py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    Quét
                  </button>
                </div>
              </form>

              {/* Fast click scanner options */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase block">Danh mục quét nhanh</span>
                <div className="grid grid-cols-1 gap-1">
                  {simProducts.slice(0, 3).map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setBarcodeInputValue(p.sku); playBeep(true); }}
                      className="py-1 px-2 bg-slate-50 border border-slate-200 hover:border-blue-400 text-left rounded-lg text-[10px] font-mono truncate cursor-pointer"
                    >
                      📟 {p.name} ({p.sku})
                    </button>
                  ))}
                </div>
              </div>

              {/* Cash counter fast numeric pads */}
              <div className="space-y-2.5 pt-2 border-t border-slate-150">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Nhập nhanh số tiền khách đưa</span>
                <div className="h-10 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm text-right px-3 flex items-center justify-end font-bold text-emerald-600 select-all truncate">
                  {(parseInt(cashPadInput) || 0).toLocaleString('vi-VN')} đ
                </div>

                <div className="grid grid-cols-3 gap-1">
                  {['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '000', 'C'].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleCashPadPress(val)}
                      className={`py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        val === 'C' 
                          ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100' 
                          : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>

                {/* Return cash detail */}
                <div className="flex justify-between items-center text-xs font-bold pt-1.5 text-slate-600">
                  <span>Tiền thối lại:</span>
                  <span className="text-rose-600">{cashChangeDue.toLocaleString('vi-VN')} đ</span>
                </div>
              </div>

            </div>
          )}
        </div>

      </div>



      {/* Overlay modal 1: Cash Checkout payment selector details */}
      {checkoutModalOpen && (
        <div id="checkout-drawer-modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            
            {/* Modal header details */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase">Quy trình Thanh toán POS</h3>
              <button
                onClick={() => setCheckoutModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal payload body */}
            <div className="p-6 space-y-4">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex justify-between items-center text-xs font-bold">
                <span className="text-slate-500">Tổng thanh toán:</span>
                <span className="text-base text-blue-600 font-black">{cartSubtotal.toLocaleString('vi-VN')} đ</span>
              </div>

              {checkoutStep === 'processing' ? (
                <div className="py-8 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
                  <p className="text-xs font-semibold text-slate-700">Đang truyền tải và ghi nhận sổ cái Cloud...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Chọn phương thức</span>
                  
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={() => handleCheckoutSubmit('cash')}
                      className="p-4 rounded-2xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 text-center space-y-2 transition-all cursor-pointer group"
                    >
                      <span className="text-2xl block">💵</span>
                      <span className="text-[10px] font-bold text-slate-700 group-hover:text-emerald-700 block">Tiền mặt</span>
                    </button>

                    <button
                      onClick={() => handleCheckoutSubmit('qr')}
                      className="p-4 rounded-2xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 text-center space-y-2 transition-all cursor-pointer group"
                    >
                      <span className="text-2xl block">📱</span>
                      <span className="text-[10px] font-bold text-slate-700 group-hover:text-blue-700 block">Chuyển QR</span>
                    </button>

                    <button
                      onClick={() => handleCheckoutSubmit('card')}
                      className="p-4 rounded-2xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/50 text-center space-y-2 transition-all cursor-pointer group"
                    >
                      <span className="text-2xl block">💳</span>
                      <span className="text-[10px] font-bold text-slate-700 group-hover:text-indigo-700 block">Thẻ POS</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer controls */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-right">
              <button
                onClick={() => setCheckoutModalOpen(false)}
                className="py-2 px-4 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
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
        <div id="table-map-popup" className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-amber-500/15 text-amber-400 rounded-2xl flex items-center justify-center">
                  <ClipboardList className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">Sơ đồ phòng bàn & Zone hiện tại</h3>
                  <p className="text-[10px] text-slate-400">Chọn bàn bất kỳ để bắt đầu bán hàng / thanh toán</p>
                </div>
              </div>
              <button
                onClick={() => setTableMapPopupOpen(false)}
                className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-1.5 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-slate-900">
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
