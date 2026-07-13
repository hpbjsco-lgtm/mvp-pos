/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Folder, 
  FolderOpen, 
  FileCode, 
  Database, 
  Lock, 
  Server, 
  ChevronRight, 
  ChevronDown, 
  Check, 
  Layers, 
  ShoppingBag, 
  ScanLine, 
  Printer, 
  ArrowRight, 
  Terminal, 
  Info,
  Code,
  Coffee,
  Utensils,
  ChefHat,
  X,
  Plus,
  Minus,
  Trash2,
  Clock,
  AlertTriangle,
  Tag,
  RefreshCw,
  Store,
  DollarSign,
  Calendar,
  Maximize2,
  Minimize2,
  Settings,
  Edit3,
  MapPin,
  Search,
  Cloud,
  User,
  LogOut,
  Phone
} from 'lucide-react';
import { motion } from 'motion/react';
import { db, auth } from './firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  where, 
  writeBatch 
} from 'firebase/firestore';

// Subcomponents for Sales, Inventory (FEFO), and Reporting
import ReportsSection from './components/ReportsSection';
import LoginScreen from './components/LoginScreen';
import POSScreen from './components/POSScreen';
import InventoryScreen from './components/InventoryScreen';

// Structure of file explorer
interface FileNode {
  name: string;
  type: 'file' | 'folder';
  status: 'created' | 'pending';
  desc: string;
  content?: string;
  children?: FileNode[];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'structure' | 'database' | 'architecture' | 'playground'>('playground');
  const [playgroundSubTab, setPlaygroundSubTab] = useState<'sales' | 'inventory' | 'reports'>('sales');
  const [selectedEntity, setSelectedEntity] = useState<string>('User');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'src': true,
    'src/components': true,
    'root': true
  });

  // --- INTERACTIVE SIMULATOR STATES ---
  // --- FIREBASE SECURITY, AUTH & TENANT STATES ---
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [fbUserProfile, setFbUserProfile] = useState<{
    uid: string;
    email: string;
    name: string;
    storeId: string;
    role: 'owner' | 'staff';
    createdAt: string;
  } | null>(null);
  const [fbStoreProfile, setFbStoreProfile] = useState<{
    id: string;
    name: string;
    address: string;
    phone: string;
    storeType: 'fnb' | 'retail';
    createdAt: string;
  } | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authName, setAuthName] = useState<string>('');
  const [authStoreName, setAuthStoreName] = useState<string>('');
  const [authStoreType, setAuthStoreType] = useState<'fnb' | 'retail'>('fnb');
  const [authStoreAddress, setAuthStoreAddress] = useState<string>('');
  const [authStorePhone, setAuthStorePhone] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');
  const [isDemoOfflineMode, setIsDemoOfflineMode] = useState<boolean>(true);

  const [simStoreType, setSimStoreType] = useState<'fnb' | 'retail'>('fnb');
  const [simSelectedTableId, setSimSelectedTableId] = useState<string>('T1');
  const [simSelectedCategory, setSimSelectedCategory] = useState<string>('Tất cả');
  const [simBarcodeInputValue, setSimBarcodeInputValue] = useState<string>('');
  const [simSuccessBeep, setSimSuccessBeep] = useState<boolean>(false);
  const [simErrorBeep, setSimErrorBeep] = useState<boolean>(false);

  // Zones Master List
  const [simZones, setSimZones] = useState([
    { id: 'z1', name: 'Khu chung (Tầng 1)' },
    { id: 'z2', name: 'Tầng 2' },
    { id: 'z3', name: 'Tầng 3' }
  ]);
  const [simSelectedZoneId, setSimSelectedZoneId] = useState<string>('z1');
  
  // Drag and drop state variables
  const [draggingTableId, setDraggingTableId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // User authorization role (Admin has editing / dragging privileges)
  const [simUserRole, setSimUserRole] = useState<'admin' | 'staff'>('admin');

  // Toggle state to collapse / expand floor plan map and sidebar
  const [isFloorPlanCollapsed, setIsFloorPlanCollapsed] = useState<boolean>(false);

  // Dining Tables Master list (F&B) with Zone & coordinate layout
  const [simTables, setSimTables] = useState([
    { id: 'T1', name: 'Bàn 01', status: 'serving', capacity: 4, zoneId: 'z1', x: 10, y: 15, width: 95, height: 95, createdAt: '2026-07-02T20:45:00-07:00' },
    { id: 'T2', name: 'Bàn 02', status: 'empty', capacity: 2, zoneId: 'z1', x: 40, y: 15, width: 95, height: 95, createdAt: '2026-07-02T20:45:00-07:00' },
    { id: 'T3', name: 'Bàn 03', status: 'serving', capacity: 6, zoneId: 'z1', x: 70, y: 15, width: 110, height: 95, createdAt: '2026-07-02T20:45:00-07:00' },
    { id: 'T4', name: 'Bàn 04', status: 'empty', capacity: 4, zoneId: 'z2', x: 25, y: 30, width: 95, height: 95, createdAt: '2026-07-02T20:45:00-07:00' },
    { id: 'T5', name: 'Bàn 05 (VIP)', status: 'empty', capacity: 8, zoneId: 'z3', x: 45, y: 35, width: 130, height: 110, createdAt: '2026-07-02T20:45:00-07:00' },
  ]);

  // Local form state for UI Zone/Table creation
  const [newZoneName, setNewZoneName] = useState<string>('');
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editingZoneName, setEditingZoneName] = useState<string>('');
  
  const [newTableName, setNewTableName] = useState<string>('');
  const [newTableCapacity, setNewTableCapacity] = useState<number>(4);
  const [tableSearchQuery, setTableSearchQuery] = useState<string>('');

  // Products with isAvailable attribute (Availability check)
  const [simProducts, setSimProducts] = useState([
    { id: 'P1', sku: '8930001001', name: 'Cà Phê Sữa Đá Sài Gòn', price: 29000, cost: 10000, category: 'Đồ uống', isAvailable: true, createdAt: '2026-07-02T20:45:00-07:00' },
    { id: 'P2', sku: '8930001002', name: 'Trà Đào Cam Sả Hồng Đài', price: 35000, cost: 12000, category: 'Đồ uống', isAvailable: true, createdAt: '2026-07-02T20:45:00-07:00' },
    { id: 'P3', sku: '8930001003', name: 'Phở Bò Thượng Hạng Kobe', price: 89000, cost: 35000, category: 'Món ăn', isAvailable: true, createdAt: '2026-07-02T20:45:00-07:00' },
    { id: 'P4', sku: '8930001004', name: 'Bún Chả Hà Nội Gia Truyền', price: 45000, cost: 18000, category: 'Món ăn', isAvailable: false, createdAt: '2026-07-02T20:45:00-07:00' }, // Out of stock
    { id: 'P5', sku: '8930001005', name: 'Bánh Mì Garlic Bơ Tỏi', price: 25000, cost: 8000, category: 'Ăn nhẹ', isAvailable: true, createdAt: '2026-07-02T20:45:00-07:00' },
    { id: 'P6', sku: '8930001006', name: 'Nước Ngọt Coca Cola Lon', price: 15000, cost: 6000, category: 'Đồ uống', isAvailable: true, createdAt: '2026-07-02T20:45:00-07:00' },
  ]);

  // Kitchen preparation orders queue (Kitchen display system - KDS)
  const [simKitchenItems, setSimKitchenItems] = useState([
    { id: 'K1', orderId: 'ORD-980', productId: 'P3', productName: 'Phở Bò Thượng Hạng Kobe', quantity: 1, tableNumber: 'Bàn 01', status: 'preparing', note: 'Không hành tây, chín kỹ', createdAt: '2026-07-02T20:30:00-07:00' },
    { id: 'K2', orderId: 'ORD-980', productId: 'P1', productName: 'Cà Phê Sữa Đá Sài Gòn', quantity: 2, tableNumber: 'Bàn 01', status: 'pending', note: 'Nhiều đá sữa', createdAt: '2026-07-02T20:31:00-07:00' },
    { id: 'K3', orderId: 'ORD-981', productId: 'P5', productName: 'Bánh Mì Garlic Bơ Tỏi', quantity: 1, tableNumber: 'Bàn 03', status: 'completed', note: 'Nướng giòn nóng', createdAt: '2026-07-02T20:38:00-07:00' },
  ]);

  // Carts separate by Table (F&B) vs Retail single checkout
  const [simCarts, setSimCarts] = useState<Record<string, Array<{ productId: string; quantity: number; note: string }>>>({
    'T1': [
      { productId: 'P1', quantity: 2, note: 'Nhiều sữa' },
      { productId: 'P3', quantity: 1, note: 'Ít hành' },
    ],
    'T3': [
      { productId: 'P5', quantity: 1, note: 'Nướng nóng' },
    ],
    'retail': []
  });

  // Completed Orders log
  const [simOrders, setSimOrders] = useState<Array<{
    id: string;
    orderNumber: string;
    storeType: 'fnb' | 'retail';
    tableNumber?: string;
    items: Array<{ name: string; quantity: number; price: number }>;
    totalAmount: number;
    paymentMethod: string;
    createdAt: string;
  }>>([
    {
      id: 'ORD-101',
      orderNumber: 'HD-00101',
      storeType: 'fnb',
      tableNumber: 'Bàn 03',
      items: [{ name: 'Bánh Mì Garlic Bơ Tỏi', quantity: 1, price: 25000 }],
      totalAmount: 25000,
      paymentMethod: 'qr',
      createdAt: '2026-07-02T20:10:00-07:00'
    }
  ]);

  const [activeReceipt, setActiveReceipt] = useState<any>(null);

  // Multi-tenant FIFO/FEFO Inventory Batches
  const [simBatches, setSimBatches] = useState<any[]>([
    { id: 'B1', productId: 'P1', batchCode: 'LOT-C01', expiryDate: '2027-12-31', quantity: 85, originalQuantity: 100, createdAt: '2026-07-02T20:45:00-07:00' },
    { id: 'B2', productId: 'P2', batchCode: 'LOT-T02', expiryDate: '2026-08-15', quantity: 45, originalQuantity: 50, createdAt: '2026-07-02T20:45:00-07:00' }, // close to expiry!
    { id: 'B3', productId: 'P3', batchCode: 'LOT-F03', expiryDate: '2027-06-30', quantity: 30, originalQuantity: 30, createdAt: '2026-07-02T20:45:00-07:00' },
    { id: 'B4', productId: 'P5', batchCode: 'LOT-B05', expiryDate: '2026-07-20', quantity: 12, originalQuantity: 20, createdAt: '2026-07-02T20:45:00-07:00' } // extremely close to expiry!
  ]);

  // Inventory Transaction logs (import/export history)
  const [simTransactions, setSimTransactions] = useState<any[]>([
    {
      id: 'TX-101',
      transactionNumber: 'PNK-00101',
      type: 'import',
      items: [{ productId: 'P1', batchCode: 'LOT-C01', quantity: 100, price: 10000 }],
      totalAmount: 1000000,
      staffId: 'STAFF-ADMIN',
      note: 'Nhập kho nguyên liệu đầu tháng 7',
      createdAt: '2026-07-01T10:00:00-07:00'
    },
    {
      id: 'TX-102',
      transactionNumber: 'PNK-00102',
      type: 'import',
      items: [{ productId: 'P2', batchCode: 'LOT-T02', quantity: 50, price: 12000 }],
      totalAmount: 600000,
      staffId: 'STAFF-ADMIN',
      note: 'Nhập trà hồng đài cao cấp',
      createdAt: '2026-07-01T11:30:00-07:00'
    }
  ]);

  // Play audio-visual Beep simulators
  const triggerBeep = (success: boolean) => {
    if (success) {
      setSimSuccessBeep(true);
      setTimeout(() => setSimSuccessBeep(false), 250);
    } else {
      setSimErrorBeep(true);
      setTimeout(() => setSimErrorBeep(false), 250);
    }
  };

  // --- FIREBASE AUTHENTICATION, REAL-TIME LISTENERS, AND SEEDING EFFECTS ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthLoading(true);
      if (user) {
        setFbUser(user);
        setIsDemoOfflineMode(false);
        try {
          const userDocSnap = await getDoc(doc(db, 'users', user.uid));
          if (userDocSnap.exists()) {
            const uprof = userDocSnap.data() as any;
            setFbUserProfile(uprof);
            setSimUserRole(uprof.role === 'owner' ? 'admin' : 'staff');

            const storeDocSnap = await getDoc(doc(db, 'stores', uprof.storeId));
            if (storeDocSnap.exists()) {
              const sprof = storeDocSnap.data() as any;
              setFbStoreProfile(sprof);
              setSimStoreType(sprof.storeType);
            }
          }
        } catch (error) {
          console.error("Lỗi lấy thông tin định danh: ", error);
        }
      } else {
        setFbUser(null);
        setFbUserProfile(null);
        setFbStoreProfile(null);
        setIsDemoOfflineMode(true);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isDemoOfflineMode || !fbUserProfile?.storeId) return;

    const storeId = fbUserProfile.storeId;
    console.log("Khởi chạy bộ lắng nghe Firestore Real-time cho Store: ", storeId);

    // Listen to Zones
    const unsubscribeZones = onSnapshot(collection(db, 'stores', storeId, 'zones'), (snapshot) => {
      const zonesData: any[] = [];
      snapshot.forEach((doc) => {
        zonesData.push({ id: doc.id, ...doc.data() });
      });
      if (zonesData.length > 0) {
        setSimZones(zonesData);
      }
    });

    // Listen to Tables
    const unsubscribeTables = onSnapshot(collection(db, 'stores', storeId, 'tables'), (snapshot) => {
      const tablesData: any[] = [];
      snapshot.forEach((doc) => {
        tablesData.push({ id: doc.id, ...doc.data() });
      });
      if (tablesData.length > 0) {
        // Sort tables naturally
        tablesData.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        setSimTables(tablesData);
      }
    });

    // Listen to Products
    const unsubscribeProducts = onSnapshot(collection(db, 'stores', storeId, 'products'), (snapshot) => {
      const productsData: any[] = [];
      snapshot.forEach((doc) => {
        productsData.push({ id: doc.id, ...doc.data() });
      });
      if (productsData.length > 0) {
        setSimProducts(productsData);
      }
    });

    // Listen to Kitchen Items
    const unsubscribeKitchen = onSnapshot(collection(db, 'stores', storeId, 'kitchenItems'), (snapshot) => {
      const kitchenData: any[] = [];
      snapshot.forEach((doc) => {
        kitchenData.push({ id: doc.id, ...doc.data() });
      });
      kitchenData.sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dbVal = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return da - dbVal;
      });
      setSimKitchenItems(kitchenData);
    });

    // Listen to Orders
    const unsubscribeOrders = onSnapshot(collection(db, 'stores', storeId, 'orders'), (snapshot) => {
      const ordersData: any[] = [];
      snapshot.forEach((doc) => {
        ordersData.push({ id: doc.id, ...doc.data() });
      });
      ordersData.sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dbVal = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dbVal - da;
      });
      setSimOrders(ordersData);
    });

    return () => {
      unsubscribeZones();
      unsubscribeTables();
      unsubscribeProducts();
      unsubscribeKitchen();
      unsubscribeOrders();
    };
  }, [isDemoOfflineMode, fbUserProfile?.storeId]);

  const seedStoreData = async (storeId: string, storeType: 'fnb' | 'retail') => {
    try {
      const batch = writeBatch(db);

      if (storeType === 'fnb') {
        const defaultZones = [
          { id: 'z1', name: 'Khu chung (Tầng 1)' },
          { id: 'z2', name: 'Tầng 2' },
          { id: 'z3', name: 'Tầng 3' }
        ];
        defaultZones.forEach(z => {
          batch.set(doc(db, 'stores', storeId, 'zones', z.id), { name: z.name, createdAt: new Date().toISOString() });
        });

        const defaultTables = [
          { id: 'T1', name: 'Bàn 01', status: 'serving', capacity: 4, zoneId: 'z1', x: 10, y: 15, width: 95, height: 95, createdAt: new Date().toISOString() },
          { id: 'T2', name: 'Bàn 02', status: 'empty', capacity: 2, zoneId: 'z1', x: 40, y: 15, width: 95, height: 95, createdAt: new Date().toISOString() },
          { id: 'T3', name: 'Bàn 03', status: 'serving', capacity: 6, zoneId: 'z1', x: 70, y: 15, width: 110, height: 95, createdAt: new Date().toISOString() },
          { id: 'T4', name: 'Bàn 04', status: 'empty', capacity: 4, zoneId: 'z2', x: 25, y: 30, width: 95, height: 95, createdAt: new Date().toISOString() },
          { id: 'T5', name: 'Bàn 05 (VIP)', status: 'empty', capacity: 8, zoneId: 'z3', x: 45, y: 35, width: 130, height: 110, createdAt: new Date().toISOString() }
        ];
        defaultTables.forEach(t => {
          batch.set(doc(db, 'stores', storeId, 'tables', t.id), { ...t });
        });

        const defaultProducts = [
          { id: 'P1', sku: '8930001001', name: 'Cà Phê Sữa Đá Sài Gòn', price: 29000, cost: 10000, category: 'Đồ uống', isAvailable: true, createdAt: new Date().toISOString() },
          { id: 'P2', sku: '8930001002', name: 'Trà Đào Cam Sả Hồng Đài', price: 35000, cost: 12000, category: 'Đồ uống', isAvailable: true, createdAt: new Date().toISOString() },
          { id: 'P3', sku: '8930001003', name: 'Phở Bò Thượng Hạng Kobe', price: 89000, cost: 35000, category: 'Món ăn', isAvailable: true, createdAt: new Date().toISOString() },
          { id: 'P4', sku: '8930001004', name: 'Bún Chả Hà Nội Gia Truyền', price: 45000, cost: 18000, category: 'Món ăn', isAvailable: false, createdAt: new Date().toISOString() },
          { id: 'P5', sku: '8930001005', name: 'Bánh Mì Garlic Bơ Tỏi', price: 25000, cost: 8000, category: 'Ăn nhẹ', isAvailable: true, createdAt: new Date().toISOString() },
          { id: 'P6', sku: '8930001006', name: 'Nước Ngọt Coca Cola Lon', price: 15000, cost: 6000, category: 'Đồ uống', isAvailable: true, createdAt: new Date().toISOString() }
        ];
        defaultProducts.forEach(p => {
          batch.set(doc(db, 'stores', storeId, 'products', p.id), { ...p });
        });
      } else {
        const defaultProducts = [
          { id: 'P1', sku: '8930001001', name: 'Gạo ST25 Thượng Hạng (5kg)', price: 185000, cost: 140000, category: 'Nhu yếu phẩm', isAvailable: true, createdAt: new Date().toISOString() },
          { id: 'P2', sku: '8930001002', name: 'Nước Mắm Nam Ngư (750ml)', price: 42000, cost: 30000, category: 'Gia vị', isAvailable: true, createdAt: new Date().toISOString() },
          { id: 'P3', sku: '8930001003', name: 'Mì Hảo Hảo Tôm Chua Cay', price: 4500, cost: 3200, category: 'Mì ăn liền', isAvailable: true, createdAt: new Date().toISOString() },
          { id: 'P4', sku: '8930001004', name: 'Dầu Ăn Simply (1L)', price: 58000, cost: 45000, category: 'Gia vị', isAvailable: true, createdAt: new Date().toISOString() },
          { id: 'P5', sku: '8930001005', name: 'Sữa Tươi Vinamilk Ít Đường', price: 8500, cost: 6500, category: 'Đồ uống', isAvailable: true, createdAt: new Date().toISOString() },
          { id: 'P6', sku: '8930001006', name: 'Khăn Giấy Bless You', price: 22000, cost: 15000, category: 'Gia dụng', isAvailable: true, createdAt: new Date().toISOString() }
        ];
        defaultProducts.forEach(p => {
          batch.set(doc(db, 'stores', storeId, 'products', p.id), { ...p });
        });
      }

      await batch.commit();
    } catch (e) {
      console.error("Lỗi gieo dữ liệu mẫu: ", e);
    }
  };

  const handleFirebaseLogin = async (e?: React.FormEvent, overrideEmail?: string, overridePass?: string) => {
    if (e) e.preventDefault();
    const email = overrideEmail || authEmail;
    const pass = overridePass || authPassword;
    if (!email || !pass) {
      setAuthError("Vui lòng điền đầy đủ email và mật khẩu.");
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      triggerBeep(true);
    } catch (err: any) {
      console.error(err);
      setAuthError("Đăng nhập thất bại: " + (err.message || "Kiểm tra thông tin tài khoản."));
      triggerBeep(false);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleFirebaseRegister = async (
    e?: React.FormEvent,
    overrideEmail?: string,
    overridePass?: string,
    overrideName?: string,
    overrideStoreName?: string,
    overrideStoreType?: 'fnb' | 'retail',
    overridePhone?: string,
    overrideAddress?: string
  ) => {
    if (e) e.preventDefault();
    const email = overrideEmail || authEmail;
    const pass = overridePass || authPassword;
    const name = overrideName || authName;
    const storeName = overrideStoreName || authStoreName;
    const storeType = overrideStoreType || authStoreType;
    const phone = overridePhone || authStorePhone;
    const address = overrideAddress || authStoreAddress;

    if (!email || !pass || !name || !storeName || !phone || !address) {
      setAuthError("Vui lòng điền đầy đủ tất cả các trường thông tin.");
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const uid = userCredential.user.uid;
      const storeId = `store-${Date.now()}`;

      await setDoc(doc(db, 'users', uid), {
        uid: uid,
        email: email,
        storeId: storeId,
        role: 'owner',
        name: name,
        createdAt: new Date().toISOString()
      });

      await setDoc(doc(db, 'stores', storeId), {
        id: storeId,
        name: storeName,
        address: address,
        phone: phone,
        storeType: storeType,
        createdAt: new Date().toISOString()
      });

      // Update state directly to prevent lag from onAuthStateChanged
      const uprof = {
        uid: uid,
        email: email,
        storeId: storeId,
        role: 'owner',
        name: name,
        createdAt: new Date().toISOString()
      };
      const sprof = {
        id: storeId,
        name: storeName,
        address: address,
        phone: phone,
        storeType: storeType,
        createdAt: new Date().toISOString()
      };

      setFbUser(userCredential.user);
      setFbUserProfile(uprof);
      setFbStoreProfile(sprof);
      setSimStoreType(storeType);
      setSimUserRole('admin');
      setIsDemoOfflineMode(false);

      await seedStoreData(storeId, storeType);
      triggerBeep(true);
      alert("Đăng ký thành công! Đã khởi tạo cửa hàng " + storeName + " của bạn trên Firebase Cloud.");
    } catch (err: any) {
      console.error(err);
      setAuthError("Đăng ký thất bại: " + (err.message || "Đã xảy ra lỗi hệ thống."));
      triggerBeep(false);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleFirebaseLogout = async () => {
    if (confirm("Xác nhận đăng xuất khỏi tài khoản cửa hàng đám mây?")) {
      setAuthLoading(true);
      try {
        await signOut(auth);
        setIsDemoOfflineMode(true);
        triggerBeep(true);
      } catch (err) {
        console.error("Lỗi đăng xuất: ", err);
      } finally {
        setAuthLoading(false);
      }
    }
  };

  // --- HELPERS FOR THE INTERACTIVE POS & KDS SIMULATOR ---
  const tablesStateRef = useRef(simTables);
  useEffect(() => {
    tablesStateRef.current = simTables;
  }, [simTables]);

  // A. Drag and drop window event listener
  useEffect(() => {
    if (!draggingTableId) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.getElementById('table-map-canvas');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      
      let newX = ((e.clientX - rect.left - dragOffset.x) / rect.width) * 100;
      let newY = ((e.clientY - rect.top - dragOffset.y) / rect.height) * 100;
      
      // Clamp values so table doesn't go completely out of boundary
      newX = Math.max(0, Math.min(92, newX));
      newY = Math.max(0, Math.min(92, newY));

      setSimTables(prev => prev.map(t => 
        t.id === draggingTableId ? { ...t, x: Math.round(newX), y: Math.round(newY) } : t
      ));
    };

    const handleMouseUp = async () => {
      if (!isDemoOfflineMode && fbUserProfile?.storeId) {
        const tableObj = tablesStateRef.current.find(t => t.id === draggingTableId);
        if (tableObj) {
          try {
            await updateDoc(doc(db, 'stores', fbUserProfile.storeId, 'tables', draggingTableId), {
              x: tableObj.x,
              y: tableObj.y
            });
          } catch (e) {
            console.error("Lỗi cập nhật vị trí bàn lên Firestore: ", e);
          }
        }
      }
      setDraggingTableId(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingTableId, dragOffset, isDemoOfflineMode, fbUserProfile?.storeId]);

  // Helper to enforce admin-only editing permissions
  const checkAdminPermission = (): boolean => {
    if (simUserRole !== 'admin') {
      triggerBeep(false);
      alert("⚠️ KHÔNG CÓ QUYỀN: Chỉ quản trị viên (Admin) mới có quyền chỉnh sửa vị trí, thêm/xóa bàn và cấu hình sơ đồ khu vực!");
      return false;
    }
    return true;
  };

  // B. Zone management helpers
  const handleAddZone = async (name: string) => {
    if (!checkAdminPermission()) return;
    if (!name.trim()) return;
    const newId = `z-${Date.now()}`;
    if (!isDemoOfflineMode && fbUserProfile?.storeId) {
      try {
        await setDoc(doc(db, 'stores', fbUserProfile.storeId, 'zones', newId), {
          name: name.trim(),
          createdAt: new Date().toISOString()
        });
        setSimSelectedZoneId(newId);
        triggerBeep(true);
      } catch (e) {
        console.error("Lỗi thêm khu vực lên Firestore: ", e);
      }
    } else {
      setSimZones(prev => [...prev, { id: newId, name: name.trim() }]);
      setSimSelectedZoneId(newId);
      triggerBeep(true);
    }
  };

  const handleUpdateZone = async (id: string, newName: string) => {
    if (!checkAdminPermission()) return;
    if (!newName.trim()) return;
    if (!isDemoOfflineMode && fbUserProfile?.storeId) {
      try {
        await updateDoc(doc(db, 'stores', fbUserProfile.storeId, 'zones', id), {
          name: newName.trim()
        });
        triggerBeep(true);
      } catch (e) {
        console.error("Lỗi cập nhật khu vực: ", e);
      }
    } else {
      setSimZones(prev => prev.map(z => z.id === id ? { ...z, name: newName.trim() } : z));
      triggerBeep(true);
    }
  };

  const handleDeleteZone = async (id: string) => {
    if (!checkAdminPermission()) return;
    if (simZones.length <= 1) {
      alert("Hệ thống phải có ít nhất một khu vực!");
      triggerBeep(false);
      return;
    }
    
    // Find a fallback zone
    const remainingZones = simZones.filter(z => z.id !== id);
    const fallbackId = remainingZones[0].id;

    if (!isDemoOfflineMode && fbUserProfile?.storeId) {
      try {
        const batch = writeBatch(db);
        // Delete zone
        batch.delete(doc(db, 'stores', fbUserProfile.storeId, 'zones', id));
        // Move tables to fallback
        const affectedTables = simTables.filter(t => t.zoneId === id);
        affectedTables.forEach(t => {
          batch.update(doc(db, 'stores', fbUserProfile.storeId, 'tables', t.id), {
            zoneId: fallbackId
          });
        });
        await batch.commit();
        if (simSelectedZoneId === id) {
          setSimSelectedZoneId(fallbackId);
        }
        triggerBeep(true);
        alert(`Đã xóa khu vực. Tất cả bàn thuộc khu này đã được chuyển sang "${remainingZones[0].name}".`);
      } catch (e) {
        console.error("Lỗi xóa khu vực: ", e);
      }
    } else {
      // Move all tables from the deleted zone to fallback zone
      setSimTables(prev => prev.map(t => t.zoneId === id ? { ...t, zoneId: fallbackId } : t));
      setSimZones(remainingZones);
      if (simSelectedZoneId === id) {
        setSimSelectedZoneId(fallbackId);
      }
      triggerBeep(true);
      alert(`Đã xóa khu vực. Tất cả bàn thuộc khu này đã được chuyển sang "${remainingZones[0].name}".`);
    }
  };

  // C. Table creation and adjustment helpers
  const handleAddTable = async (name: string, capacity: number, zoneId: string) => {
    if (!checkAdminPermission()) return;
    if (!name.trim()) return;
    const newId = `T-${Date.now()}`;
    
    // Position newly added table slightly randomly or sequentially to prevent overlap
    const count = simTables.filter(t => t.zoneId === zoneId).length;
    const x = 10 + (count * 15) % 75;
    const y = 15 + (Math.floor(count / 5) * 20) % 65;

    const newTable = {
      id: newId,
      name: name.trim(),
      status: 'empty' as any,
      capacity: Number(capacity) || 4,
      zoneId: zoneId,
      x,
      y,
      width: 95,
      height: 95,
      createdAt: new Date().toISOString()
    };

    if (!isDemoOfflineMode && fbUserProfile?.storeId) {
      try {
        await setDoc(doc(db, 'stores', fbUserProfile.storeId, 'tables', newId), newTable);
        setSimSelectedTableId(newId);
        triggerBeep(true);
      } catch (e) {
        console.error("Lỗi thêm bàn vào Firestore: ", e);
      }
    } else {
      setSimTables(prev => [...prev, newTable]);
      setSimSelectedTableId(newId);
      triggerBeep(true);
    }
  };

  const handleDeleteTable = async (id: string) => {
    if (!checkAdminPermission()) return;
    if (confirm("Bạn có chắc chắn muốn xóa bàn này?")) {
      if (!isDemoOfflineMode && fbUserProfile?.storeId) {
        try {
          await deleteDoc(doc(db, 'stores', fbUserProfile.storeId, 'tables', id));
          setSimCarts(prev => {
            const copy = { ...prev };
            delete copy[id];
            return copy;
          });
          if (simSelectedTableId === id) {
            const remaining = simTables.filter(t => t.id !== id);
            if (remaining.length > 0) {
              setSimSelectedTableId(remaining[0].id);
            }
          }
          triggerBeep(true);
        } catch (e) {
          console.error("Lỗi xóa bàn: ", e);
        }
      } else {
        setSimTables(prev => prev.filter(t => t.id !== id));
        setSimCarts(prev => {
          const copy = { ...prev };
          delete copy[id];
          return copy;
        });
        // If the deleted table was selected, select another one
        if (simSelectedTableId === id) {
          const remaining = simTables.filter(t => t.id !== id);
          if (remaining.length > 0) {
            setSimSelectedTableId(remaining[0].id);
          }
        }
        triggerBeep(true);
      }
    }
  };

  const handleResizeTable = async (id: string, widthDelta: number, heightDelta: number) => {
    if (!checkAdminPermission()) return;
    const currentTable = simTables.find(t => t.id === id);
    if (!currentTable) return;
    const currentW = currentTable.width || 95;
    const currentH = currentTable.height || 95;
    const newW = Math.max(70, Math.min(200, currentW + widthDelta));
    const newH = Math.max(70, Math.min(200, currentH + heightDelta));

    if (!isDemoOfflineMode && fbUserProfile?.storeId) {
      try {
        await updateDoc(doc(db, 'stores', fbUserProfile.storeId, 'tables', id), {
          width: newW,
          height: newH
        });
      } catch (e) {
        console.error("Lỗi co giãn bàn: ", e);
      }
    } else {
      setSimTables(prev => prev.map(t => {
        if (t.id === id) {
          return { ...t, width: newW, height: newH };
        }
        return t;
      }));
    }
  };

  const handleToggleExpandTable = async (id: string) => {
    if (!checkAdminPermission()) return;
    const currentTable = simTables.find(t => t.id === id);
    if (!currentTable) return;
    const currentW = currentTable.width || 95;
    const isCurrentlyCompact = currentW < 120;
    const targetW = isCurrentlyCompact ? 150 : 95;
    const targetH = isCurrentlyCompact ? 110 : 95;

    if (!isDemoOfflineMode && fbUserProfile?.storeId) {
      try {
        await updateDoc(doc(db, 'stores', fbUserProfile.storeId, 'tables', id), {
          width: targetW,
          height: targetH
        });
        triggerBeep(true);
      } catch (e) {
        console.error("Lỗi mở rộng bàn: ", e);
      }
    } else {
      setSimTables(prev => prev.map(t => {
        if (t.id === id) {
          return {
            ...t,
            width: targetW,
            height: targetH
          };
        }
        return t;
      }));
      triggerBeep(true);
    }
  };

  // Helper to generate a large number of tables for testing
  const handleBulkGenerateTables = async () => {
    if (!checkAdminPermission()) return;
    const batchTables: any[] = [];
    // Create tables in Zone 1
    for (let i = 6; i <= 25; i++) {
      const x = 5 + ((i - 6) % 6) * 15;
      const y = 30 + Math.floor((i - 6) / 6) * 20;
      batchTables.push({
        id: `T-bulk-z1-${i}`,
        name: `Bàn ${i < 10 ? '0' + i : i}`,
        status: Math.random() > 0.65 ? 'serving' : 'empty' as any,
        capacity: [2, 4, 6, 8][Math.floor(Math.random() * 4)],
        zoneId: 'z1',
        x,
        y,
        width: 95,
        height: 95,
        createdAt: new Date().toISOString()
      });
    }

    // Create tables in Zone 2
    for (let i = 1; i <= 15; i++) {
      const x = 5 + ((i - 1) % 5) * 18;
      const y = 15 + Math.floor((i - 1) / 5) * 25;
      batchTables.push({
        id: `T-bulk-z2-${i}`,
        name: `T2 - Bàn ${i < 10 ? '0' + i : i}`,
        status: Math.random() > 0.75 ? 'serving' : 'empty' as any,
        capacity: [2, 4, 6][Math.floor(Math.random() * 3)],
        zoneId: 'z2',
        x,
        y,
        width: 95,
        height: 95,
        createdAt: new Date().toISOString()
      });
    }

    // Create tables in Zone 3
    for (let i = 1; i <= 10; i++) {
      const x = 10 + ((i - 1) % 4) * 22;
      const y = 20 + Math.floor((i - 1) / 4) * 25;
      batchTables.push({
        id: `T-bulk-z3-${i}`,
        name: `VIP ${i}`,
        status: Math.random() > 0.5 ? 'serving' : 'empty' as any,
        capacity: [6, 8, 10, 12][Math.floor(Math.random() * 4)],
        zoneId: 'z3',
        x,
        y,
        width: 130,
        height: 110,
        createdAt: new Date().toISOString()
      });
    }

    if (!isDemoOfflineMode && fbUserProfile?.storeId) {
      try {
        const batch = writeBatch(db);
        batchTables.forEach(t => {
          batch.set(doc(db, 'stores', fbUserProfile.storeId, 'tables', t.id), t);
        });
        await batch.commit();
        triggerBeep(true);
        alert(`Đã tạo hàng loạt 45 bàn mẫu mới và đồng bộ lên Firebase Firestore thành công!`);
      } catch (e) {
        console.error("Lỗi gieo bàn hàng loạt lên Firestore: ", e);
      }
    } else {
      setSimTables(prev => {
        // Keep initial five, add newly generated ones
        const initialFive = prev.filter(t => !t.id.startsWith('T-bulk-'));
        return [...initialFive, ...batchTables];
      });
      triggerBeep(true);
      alert(`Đã tạo hàng loạt 45 bàn mới trải đều trên 3 khu vực! Số lượng bàn hiện tại trong hệ thống: ${simTables.length + 45} bàn.`);
    }
  };

  // 1. Toggle product availability (isAvailable status)
  const toggleProductAvailability = async (productId: string) => {
    const p = simProducts.find(item => item.id === productId);
    if (!p) return;
    const nextState = !p.isAvailable;
    if (!isDemoOfflineMode && fbUserProfile?.storeId) {
      try {
        await updateDoc(doc(db, 'stores', fbUserProfile.storeId, 'products', productId), {
          isAvailable: nextState
        });
        triggerBeep(true);
      } catch (e) {
        console.error("Lỗi cập nhật trạng thái món ăn: ", e);
      }
    } else {
      setSimProducts(prev => prev.map(p => {
        if (p.id === productId) {
          triggerBeep(true);
          return { ...p, isAvailable: nextState };
        }
        return p;
      }));
    }
  };

  // 2. Add item to cart (links to current selected table or retail)
  const addToCart = (productId: string) => {
    const prod = simProducts.find(p => p.id === productId);
    if (!prod) return;
    if (!prod.isAvailable) {
      triggerBeep(false);
      return;
    }

    const targetKey = simStoreType === 'fnb' ? simSelectedTableId : 'retail';
    const currentCart = simCarts[targetKey] || [];
    const exists = currentCart.find(item => item.productId === productId);

    let updatedCart;
    if (exists) {
      updatedCart = currentCart.map(item => 
        item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item
      );
    } else {
      updatedCart = [...currentCart, { productId, quantity: 1, note: '' }];
    }

    setSimCarts(prev => ({ ...prev, [targetKey]: updatedCart }));
    triggerBeep(true);
  };

  // 3. Remove/Decrease from cart
  const decreaseCartQuantity = (productId: string) => {
    const targetKey = simStoreType === 'fnb' ? simSelectedTableId : 'retail';
    const currentCart = simCarts[targetKey] || [];
    const exists = currentCart.find(item => item.productId === productId);
    if (!exists) return;

    let updatedCart;
    if (exists.quantity <= 1) {
      updatedCart = currentCart.filter(item => item.productId !== productId);
    } else {
      updatedCart = currentCart.map(item => 
        item.productId === productId ? { ...item, quantity: item.quantity - 1 } : item
      );
    }

    setSimCarts(prev => ({ ...prev, [targetKey]: updatedCart }));
    triggerBeep(true);
  };

  // 4. Update note in cart
  const updateCartItemNote = (productId: string, note: string) => {
    const targetKey = simStoreType === 'fnb' ? simSelectedTableId : 'retail';
    const currentCart = simCarts[targetKey] || [];
    const updatedCart = currentCart.map(item => 
      item.productId === productId ? { ...item, note } : item
    );
    setSimCarts(prev => ({ ...prev, [targetKey]: updatedCart }));
  };

  // 5. Delete item completely from cart
  const deleteFromCart = (productId: string) => {
    const targetKey = simStoreType === 'fnb' ? simSelectedTableId : 'retail';
    const currentCart = simCarts[targetKey] || [];
    const updatedCart = currentCart.filter(item => item.productId !== productId);
    setSimCarts(prev => ({ ...prev, [targetKey]: updatedCart }));
    triggerBeep(false);
  };

  // 6. Send order from Table to Kitchen queue (KDS)
  const sendTableToKitchen = async () => {
    const currentCart = simCarts[simSelectedTableId] || [];
    if (currentCart.length === 0) return;

    const tableName = simTables.find(t => t.id === simSelectedTableId)?.name || simSelectedTableId;
    const orderId = `ORD-${Math.floor(100 + Math.random() * 900)}`;

    const newKitchenItems = currentCart.map((item, idx) => {
      const prod = simProducts.find(p => p.id === item.productId);
      return {
        id: `K-${Date.now()}-${idx}`,
        orderId: orderId,
        productId: item.productId,
        productName: prod?.name || 'Sản phẩm',
        quantity: item.quantity,
        tableNumber: tableName,
        status: 'pending',
        note: item.note || "",
        createdAt: new Date().toISOString()
      };
    });

    if (!isDemoOfflineMode && fbUserProfile?.storeId) {
      try {
        const batch = writeBatch(db);
        newKitchenItems.forEach(item => {
          batch.set(doc(db, 'stores', fbUserProfile.storeId!, 'kitchenItems', item.id), item);
        });
        batch.update(doc(db, 'stores', fbUserProfile.storeId, 'tables', simSelectedTableId), {
          status: 'serving'
        });
        await batch.commit();

        setSimCarts(prev => ({ ...prev, [simSelectedTableId]: [] }));
        triggerBeep(true);
        alert(`Đã gửi thành công ${newKitchenItems.length} món ăn/đồ uống của ${tableName} xuống Bếp và đồng bộ trực tuyến!`);
      } catch (e) {
        console.error("Lỗi gửi bếp Firestore: ", e);
      }
    } else {
      setSimKitchenItems(prev => [...prev, ...newKitchenItems]);
      setSimTables(prev => prev.map(t => 
        t.id === simSelectedTableId ? { ...t, status: 'serving' } : t
      ));
      setSimCarts(prev => ({ ...prev, [simSelectedTableId]: [] }));
      triggerBeep(true);
      alert(`Đã gửi ${newKitchenItems.length} món ăn/đồ uống của ${tableName} xuống Bếp chế biến! Hãy kiểm tra hàng đợi bếp phía dưới.`);
    }
  };

  // 7. Update status of kitchen queue items (cooking process)
  const updateKitchenItemStatus = async (itemId: string, currentStatus: string) => {
    let nextStatus = 'pending';
    if (currentStatus === 'pending') nextStatus = 'preparing';
    else if (currentStatus === 'preparing') nextStatus = 'completed';
    else if (currentStatus === 'completed') nextStatus = 'served';
    else return;

    if (!isDemoOfflineMode && fbUserProfile?.storeId) {
      try {
        await updateDoc(doc(db, 'stores', fbUserProfile.storeId, 'kitchenItems', itemId), {
          status: nextStatus
        });
        triggerBeep(true);
      } catch (e) {
        console.error("Lỗi cập nhật trạng thái bếp Firestore: ", e);
      }
    } else {
      setSimKitchenItems(prev => prev.map(item => 
        item.id === itemId ? { ...item, status: nextStatus } : item
      ));
      triggerBeep(true);
    }
  };

  // 8. Checkout / Print Thermal Receipt
  const checkoutOrder = async (
    paymentMethod: 'cash' | 'qr' | 'card', 
    paidAmount: number = 0, 
    changeAmount: number = 0, 
    details?: { tableId?: string, tableNumber?: string }
  ) => {
    const tableId = details?.tableId || (simStoreType === 'fnb' ? simSelectedTableId : 'retail');
    const targetKey = simStoreType === 'fnb' ? tableId : 'retail';
    const currentCart = simCarts[targetKey] || [];
    if (currentCart.length === 0) return;

    const tableName = details?.tableNumber || (simStoreType === 'fnb' ? (simTables.find(t => t.id === tableId)?.name || tableId) : undefined);
    const items = currentCart.map(item => {
      const prod = simProducts.find(p => p.id === item.productId);
      return {
        name: prod?.name || 'Sản phẩm',
        quantity: item.quantity,
        price: prod?.price || 0
      };
    });

    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const orderNumber = `HD-${Math.floor(10000 + Math.random() * 90000)}`;

    const newOrder = {
      id: `ORD-${Date.now()}`,
      orderNumber,
      storeType: simStoreType,
      tableNumber: tableName,
      items,
      totalAmount,
      paymentMethod,
      paidAmount,
      changeAmount,
      createdAt: new Date().toISOString()
    };

    if (!isDemoOfflineMode && fbUserProfile?.storeId) {
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'stores', fbUserProfile.storeId, 'orders', newOrder.id), newOrder);
        
        if (simStoreType === 'fnb') {
          batch.update(doc(db, 'stores', fbUserProfile.storeId, 'tables', tableId), {
            status: 'empty'
          });
        }
        await batch.commit();

        setSimCarts(prev => ({ ...prev, [targetKey]: [] }));
        setActiveReceipt(newOrder);
        triggerBeep(true);
      } catch (e) {
        console.error("Lỗi thanh toán hóa đơn Firestore: ", e);
      }
    } else {
      setSimOrders(prev => [newOrder, ...prev]);
      setSimCarts(prev => ({ ...prev, [targetKey]: [] }));
      if (simStoreType === 'fnb') {
        setSimTables(prev => prev.map(t => 
          t.id === tableId ? { ...t, status: 'empty' } : t
        ));
      }
      setActiveReceipt(newOrder);
      triggerBeep(true);
    }
  };

  // 9. Barcode scan simulation
  const simulateBarcodeScan = (sku: string) => {
    const prod = simProducts.find(p => p.sku === sku);
    if (prod) {
      addToCart(prod.id);
    } else {
      triggerBeep(false);
      alert(`Mã SKU vạch "${sku}" không tồn tại!`);
    }
  };

  const toggleNode = (path: string) => {
    setExpandedNodes(prev => ({ ...prev, [path]: !prev[path] }));
  };

  // Directory structure data
  const projectTree: FileNode = {
    name: "pos-inventory-system",
    type: "folder",
    status: "created",
    desc: "Thư mục gốc của dự án",
    children: [
      { name: "firebase-blueprint.json", type: "file", status: "created", desc: "Mô hình Blueprint Firestore JSON (Step 2 - Đã thiết lập)" },
      { name: "metadata.json", type: "file", status: "created", desc: "Cấu hình Metadata của AI Studio Applet" },
      { name: "package.json", type: "file", status: "created", desc: "Khai báo các thư viện phụ thuộc (React 19, Motion, Lucide, Tailwind)" },
      { name: "vite.config.ts", type: "file", status: "created", desc: "Cấu hình Vite + Tailwind CSS v4" },
      {
        name: "src",
        type: "folder",
        status: "created",
        desc: "Thư mục mã nguồn chính",
        children: [
          { name: "main.tsx", type: "file", status: "created", desc: "Điểm khởi chạy ứng dụng React" },
          { name: "App.tsx", type: "file", status: "created", desc: "Giao diện chính điều hướng & hiển thị tài liệu này" },
          { name: "index.css", type: "file", status: "created", desc: "Khai báo Tailwind CSS v4 và phông chữ Inter" },
          { name: "types.ts", type: "file", status: "created", desc: "Định nghĩa TypeScript Interfaces & Enums của hệ thống (Step 1 - Đã thiết lập)" },
          { name: "firebase.ts", type: "file", status: "created", desc: "Cấu hình & Khởi tạo Firebase SDK (Hỗ trợ Real-time offline persistence)" },
          {
            name: "components",
            type: "folder",
            status: "created",
            desc: "Các thành phần UI dùng chung và các màn hình chính",
            children: [
              { name: "POSSection.tsx", type: "file", status: "created", desc: "Màn hình POS bán hàng chuyên sâu (Hỗ trợ Quán Café F&B + Bán lẻ Tạp hoá, có keypad số và in bill K80)" },
              { name: "InventorySection.tsx", type: "file", status: "created", desc: "Màn hình quản lý tồn kho đa lô (Inventory Batches), sắp xếp FEFO tránh quá hạn và in nhãn dán" },
              { name: "ReportsSection.tsx", type: "file", status: "created", desc: "Màn hình báo cáo doanh thu, thống kê mặt hàng chạy nhất, lọc ngày/tháng/năm trực quan" }
            ]
          }
        ]
      }
    ]
  };

  // Database Schema specifications for Step 2
  const databaseModels = {
    User: {
      collection: "/users/{userId}",
      description: "Root collection chứa thông tin hồ sơ người dùng để xác định Store (Tenant) và phân quyền (Role). Khi đăng nhập, Token Auth sẽ đối chiếu storeId để cấp quyền truy cập.",
      fields: [
        { name: "uid", type: "string", desc: "ID định danh duy nhất từ Firebase Auth" },
        { name: "email", type: "string", desc: "Email đăng nhập" },
        { name: "storeId", type: "string", desc: "ID cửa hàng liên kết (Multi-tenant Key)" },
        { name: "role", type: "owner | staff", desc: "Chức vụ: 'owner' (Chủ - toàn quyền) hoặc 'staff' (Nhân viên - hạn chế cấu hình)" },
        { name: "name", type: "string", desc: "Tên hiển thị của nhân viên" },
        { name: "createdAt", type: "string (date-time)", desc: "Thời gian đăng ký tài khoản" }
      ],
      securityRule: `match /users/{userId} {
  allow read: if isSignedIn() && request.auth.uid == userId;
  allow write: if isSignedIn() && request.auth.uid == userId && incoming().role == existing().role;
}`
    },
    Store: {
      collection: "/stores/{storeId}",
      description: "Root chi nhánh/Cửa hàng. Mọi dữ liệu kinh doanh sẽ nằm trong các Sub-collection thuộc stores/{storeId} để đảm bảo cách ly dữ liệu triệt để giữa các Tenant. Có thuộc tính storeType để phân biệt F&B (Nhà hàng, quán cafe) và Retail (Tạp hóa, siêu thị, bán lẻ).",
      fields: [
        { name: "id", type: "string", desc: "ID chi nhánh duy nhất" },
        { name: "name", type: "string", desc: "Tên cửa hàng/chi nhánh" },
        { name: "address", type: "string", desc: "Địa chỉ chi nhánh" },
        { name: "phone", type: "string", desc: "Số điện thoại liên hệ" },
        { name: "storeType", type: "fnb | retail", desc: "Phân loại cửa hàng: fnb (Ăn uống có sơ đồ bàn, order món, nhà bếp) hoặc retail (Bán lẻ quét mã vạch)" },
        { name: "createdAt", type: "string (date-time)", desc: "Ngày tạo chi nhánh" }
      ],
      securityRule: `match /stores/{storeId} {
  allow read: if isSignedIn() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId == storeId;
  allow write: if isSignedIn() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId == storeId && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "owner";
}`
    },
    Product: {
      collection: "/stores/{storeId}/products/{productId}",
      description: "Danh mục sản phẩm của từng chi nhánh. Mỗi chi nhánh có một danh sách sản phẩm riêng, hỗ trợ SKU độc lập hoặc quét mã vạch nhanh. Có trạng thái sẵn sàng để kiểm soát việc gọi món trong F&B.",
      fields: [
        { name: "id", type: "string", desc: "ID sản phẩm" },
        { name: "sku", type: "string", desc: "Mã vạch / SKU (Dùng để nhận diện quét mã nhanh)" },
        { name: "name", type: "string", desc: "Tên sản phẩm / Tên món ăn" },
        { name: "price", type: "number", desc: "Giá bán lẻ niêm yết" },
        { name: "cost", type: "number", desc: "Giá vốn nhập kho" },
        { name: "category", type: "string", desc: "Danh mục sản phẩm / nhóm món ăn" },
        { name: "isAvailable", type: "boolean", desc: "Trạng thái sẵn sàng phục vụ (true nếu còn món, false nếu hết món/nguyên liệu không thể order)" },
        { name: "createdAt", type: "string (date-time)", desc: "Ngày tạo sản phẩm" }
      ],
      securityRule: `match /stores/{storeId}/products/{productId} {
  allow read: if isSignedIn() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId == storeId;
  allow write: if isSignedIn() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId == storeId;
}`
    },
    InventoryBatch: {
      collection: "/stores/{storeId}/batches/{batchId}",
      description: "Quản lý tồn kho nâng cao theo lô hàng (Inventory_Batches). Giúp cửa hàng bán hàng theo nguyên tắc FIFO (hàng hết hạn trước xuất trước) và theo dõi sát sao hạn sử dụng (HSD), ngày sản xuất, giá nhập và liên kết tới phiếu xuất nhập kho để truy xuất nguồn gốc.",
      fields: [
        { name: "id", type: "string", desc: "ID lô hàng" },
        { name: "productId", type: "string", desc: "Liên kết tới mã ID sản phẩm" },
        { name: "batchCode", type: "string", desc: "Mã Lô (ví dụ: LÔ-A-01, LOT-2026)" },
        { name: "expiryDate", type: "string (YYYY-MM-DD)", desc: "Hạn sử dụng của lô này" },
        { name: "manufactureDate", type: "string (YYYY-MM-DD)", desc: "Ngày sản xuất của lô hàng" },
        { name: "importPrice", type: "number", desc: "Giá nhập của sản phẩm thuộc lô hàng này" },
        { name: "transactionId", type: "string", desc: "ID phiếu xuất nhập kho liên kết để truy xuất nguồn gốc chứng từ" },
        { name: "quantity", type: "number", desc: "Số lượng khả dụng thực tế hiện tại" },
        { name: "originalQuantity", type: "number", desc: "Số lượng nhập kho ban đầu" },
        { name: "createdAt", type: "string (date-time)", desc: "Ngày nhập lô hàng" }
      ],
      securityRule: `match /stores/{storeId}/batches/{batchId} {
  allow read: if isSignedIn() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId == storeId;
  allow write: if isSignedIn() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId == storeId;
}`
    },
    Order: {
      collection: "/stores/{storeId}/orders/{orderId}",
      description: "Lịch sử hóa đơn bán lẻ từ màn hình POS. Lưu trữ danh sách sản phẩm, số lượng, lô hàng xuất kho, doanh thu và hình thức thanh toán, liên kết với ID khách hàng, điểm tích lũy, và thông tin bàn ăn / loại phục vụ cho F&B.",
      fields: [
        { name: "id", type: "string", desc: "ID hóa đơn" },
        { name: "orderNumber", type: "string", desc: "Mã hóa đơn hiển thị (ví dụ: HD-00001)" },
        { name: "items", type: "array (maps)", desc: "Danh sách sản phẩm mua: [ { productId, name, quantity, price, batchCode } ]" },
        { name: "totalAmount", type: "number", desc: "Tổng tiền hóa đơn" },
        { name: "paymentMethod", type: "cash | card | qr", desc: "Phương thức: Tiền mặt, Thẻ hoặc Chuyển khoản QR" },
        { name: "paidAmount", type: "number", desc: "Khách đưa" },
        { name: "changeAmount", type: "number", desc: "Tiền thừa trả khách" },
        { name: "staffId", type: "string", desc: "ID nhân viên thu ngân" },
        { name: "customerId", type: "string", desc: "ID của khách hàng (hoặc 'khach-vang-lai' để thống kê)" },
        { name: "customerPointsEarned", type: "number", desc: "Số điểm tích lũy được từ giao dịch này" },
        { name: "tableId", type: "string", desc: "ID của bàn ăn (nếu là FNB ăn tại bàn)" },
        { name: "tableNumber", type: "string", desc: "Số bàn hiển thị (ví dụ: Bàn 5)" },
        { name: "orderType", type: "dine-in | takeaway", desc: "Hình thức: Ăn tại bàn (dine-in) hoặc mang về (takeaway)" },
        { name: "createdAt", type: "string (date-time)", desc: "Thời gian thanh toán hóa đơn" }
      ],
      securityRule: `match /stores/{storeId}/orders/{orderId} {
  allow read: if isSignedIn() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId == storeId;
  allow create: if isSignedIn() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId == storeId;
  allow update, delete: if false; // Hóa đơn sau khi in không thể sửa hoặc xóa để chống gian lận
}`
    },
    Supplier: {
      collection: "/stores/{storeId}/suppliers/{supplierId}",
      description: "Danh bạ nhà cung cấp hàng hóa/nguyên vật liệu cho từng chi nhánh. Giúp quản lý nguồn cung cấp và tối ưu hóa quy trình nhập kho.",
      fields: [
        { name: "id", type: "string", desc: "ID nhà cung cấp" },
        { name: "name", type: "string", desc: "Tên nhà cung cấp" },
        { name: "phone", type: "string", desc: "Số điện thoại liên hệ" },
        { name: "email", type: "string", desc: "Email liên hệ" },
        { name: "address", type: "string", desc: "Địa chỉ của nhà cung cấp" },
        { name: "createdAt", type: "string (date-time)", desc: "Ngày tạo thông tin nhà cung cấp" }
      ],
      securityRule: `match /stores/{storeId}/suppliers/{supplierId} {
  allow read: if isSignedIn() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId == storeId;
  allow write: if isSignedIn() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId == storeId;
}`
    },
    InventoryTransaction: {
      collection: "/stores/{storeId}/inventoryTransactions/{transactionId}",
      description: "Quản lý phiếu xuất/nhập/điều chỉnh tồn kho. Lưu trữ chứng từ nhập hàng từ nhà cung cấp, xuất kho thanh lý hoặc điều chỉnh chênh lệch kiểm kho.",
      fields: [
        { name: "id", type: "string", desc: "ID phiếu xuất nhập kho" },
        { name: "transactionNumber", type: "string", desc: "Mã số phiếu hiển thị (ví dụ: PNK-00001, PXK-00001)" },
        { name: "type", type: "import | export | adjustment", desc: "Loại giao dịch: Nhập từ NCC, Xuất kho, Điều chỉnh hao hụt" },
        { name: "supplierId", type: "string", desc: "ID nhà cung cấp (bắt buộc đối với phiếu nhập)" },
        { name: "items", type: "array (maps)", desc: "Danh sách sản phẩm điều chuyển: [ { productId, batchCode, quantity, price } ]" },
        { name: "totalAmount", type: "number", desc: "Tổng giá trị tài chính của phiếu (nếu có)" },
        { name: "staffId", type: "string", desc: "ID nhân viên lập phiếu" },
        { name: "note", type: "string", desc: "Ghi chú/lý do xuất nhập" },
        { name: "createdAt", type: "string (date-time)", desc: "Ngày giờ lập phiếu" }
      ],
      securityRule: `match /stores/{storeId}/inventoryTransactions/{transactionId} {
  allow read: if isSignedIn() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId == storeId;
  allow write: if isSignedIn() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId == storeId;
}`
    },
    Customer: {
      collection: "/stores/{storeId}/customers/{customerId}",
      description: "Cơ sở dữ liệu khách hàng thân thiết. Quản lý điểm thưởng (Loyalty points), lịch sử mua hàng, tần suất giao dịch giúp gia tăng lòng trung thành.",
      fields: [
        { name: "id", type: "string", desc: "ID khách hàng (Mặc định 'khach-vang-lai' là Khách Vãng Lai được tạo sẵn phục vụ thống kê)" },
        { name: "name", type: "string", desc: "Họ và tên khách hàng" },
        { name: "phone", type: "string", desc: "Số điện thoại phục vụ tìm kiếm nhanh khi tính tiền" },
        { name: "email", type: "string", desc: "Địa chỉ email nhận ưu đãi" },
        { name: "points", type: "number", desc: "Số điểm tích lũy hiện tại (có thể quy đổi ra tiền/quà)" },
        { name: "createdAt", type: "string (date-time)", desc: "Ngày đăng ký thông tin khách hàng" }
      ],
      securityRule: `match /stores/{storeId}/customers/{customerId} {
  allow read: if isSignedIn() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId == storeId;
  allow write: if isSignedIn() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId == storeId;
}`
    },
    DiningTable: {
      collection: "/stores/{storeId}/tables/{tableId}",
      description: "Bảng quản lý sơ đồ bàn dành riêng cho mô hình FNB. Giúp theo dõi danh sách bàn, trạng thái phục vụ (trống, đang phục vụ) để tối ưu công suất bàn ăn.",
      fields: [
        { name: "id", type: "string", desc: "ID bàn ăn duy nhất" },
        { name: "name", type: "string", desc: "Tên/Số bàn (ví dụ: Bàn 01, VIP 02)" },
        { name: "status", type: "empty | serving", desc: "Trạng thái phục vụ: empty (Bàn trống) hoặc serving (Đang phục vụ)" },
        { name: "capacity", type: "number", desc: "Sức chứa tối đa của bàn (số ghế)" },
        { name: "createdAt", type: "string (date-time)", desc: "Ngày tạo bàn ăn" }
      ],
      securityRule: `match /stores/{storeId}/tables/{tableId} {
  allow read: if isSignedIn() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId == storeId;
  allow write: if isSignedIn() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId == storeId;
}`
    },
    KitchenItem: {
      collection: "/stores/{storeId}/kitchenItems/{kitchenItemId}",
      description: "Hệ thống hiển thị nhà bếp (KDS - Kitchen Display System). Lưu trữ hàng đợi các món ăn đang được chế biến dưới bếp, cập nhật trạng thái chế biến thời gian thực.",
      fields: [
        { name: "id", type: "string", desc: "ID món ăn trong hàng đợi bếp" },
        { name: "orderId", type: "string", desc: "ID hóa đơn order tương ứng" },
        { name: "productId", type: "string", desc: "ID món ăn/sản phẩm" },
        { name: "productName", type: "string", desc: "Tên món ăn hiển thị cho đầu bếp" },
        { name: "quantity", type: "number", desc: "Số lượng xuất chế biến" },
        { name: "tableNumber", type: "string", desc: "Số bàn yêu cầu phục vụ" },
        { name: "status", type: "pending | preparing | completed | served", desc: "Trạng thái chế biến: pending (Chờ làm), preparing (Đang làm), completed (Làm xong chờ mang lên), served (Đã bưng lên cho khách)" },
        { name: "note", type: "string", desc: "Ghi chú gọi món (ví dụ: Không cay, ít ngọt)" },
        { name: "createdAt", type: "string (date-time)", desc: "Thời điểm khách gọi món gửi xuống bếp" }
      ],
      securityRule: `match /stores/{storeId}/kitchenItems/{kitchenItemId} {
  allow read: if isSignedIn() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId == storeId;
  allow write: if isSignedIn() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId == storeId;
}`
    }
  };

  // Helper to render tree nodes recursively
  const renderTree = (node: FileNode, path: string = 'root') => {
    const currentPath = `${path}/${node.name}`;
    const isExpanded = expandedNodes[currentPath];
    const isFolder = node.type === 'folder';

    return (
      <div key={currentPath} className="ml-4 font-mono text-sm">
        <div 
          onClick={() => isFolder && toggleNode(currentPath)}
          className={`flex items-start py-1.5 px-2 rounded-md transition-colors ${isFolder ? 'cursor-pointer hover:bg-slate-800/60' : 'hover:bg-slate-800/30'} group`}
        >
          {isFolder ? (
            <span className="mr-1 text-slate-500 mt-0.5">
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </span>
          ) : (
            <span className="w-4 mr-1"></span>
          )}

          <span className="mr-2 mt-0.5">
            {isFolder ? (
              isExpanded ? (
                <FolderOpen className="w-4 h-4 text-amber-400" />
              ) : (
                <Folder className="w-4 h-4 text-amber-500" />
              )
            ) : (
              <FileCode className={`w-4 h-4 ${node.name.endsWith('.json') ? 'text-cyan-400' : 'text-sky-400'}`} />
            )}
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`font-semibold ${node.status === 'created' ? 'text-slate-200' : 'text-slate-400 italic'}`}>
                {node.name}
              </span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-sans uppercase font-bold tracking-wider ${
                node.status === 'created' 
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              }`}>
                {node.status === 'created' ? 'Đã tạo' : 'Sẽ tạo'}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-sans mt-0.5 group-hover:text-slate-300">
              {node.desc}
            </p>
          </div>
        </div>

        {isFolder && isExpanded && node.children && (
          <div className="border-l border-slate-700/60 ml-2 mt-1 pl-1">
            {node.children.map(child => renderTree(child, currentPath))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans selection:bg-blue-500/10 selection:text-blue-800">
      
      {/* Upper Brand Info Banner - Styled like the Gourmet Coffee POS header */}
      <header className="h-16 bg-slate-900 text-white flex items-center justify-between px-6 shadow-md shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none">POS & Inventory System</h1>
            <p className="text-xs text-slate-400">Store ID: Pending Configuration • Multi-tenant MVP</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 px-3 py-1 bg-green-500/20 border border-green-500/40 rounded-full text-green-400 text-xs font-semibold">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> TRỰC TUYẾN
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium">Hệ thống sẵn sàng</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">Giai đoạn 1 & 2</p>
          </div>
        </div>
      </header>

      {/* Sub-header description */}
      <div className="bg-white border-b border-slate-200 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-sm text-slate-600">
            Chào mừng bạn đến với môi trường thiết kế MVP của <strong>Hệ thống POS & Quản lý kho đa điểm (Multi-tenant)</strong>. 
            Chúng tôi đã thiết lập thành công <strong>Bước 1 (Cấu trúc thư mục)</strong> và <strong>Bước 2 (Firestore Database Schema)</strong> dưới đây.
          </p>
        </div>
      </div>

      {/* Main Content Areas */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Columns - Documentation Panels */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Navigation Tabs - Sleek Interface Style */}
          <div className="flex flex-col md:flex-row p-1 bg-slate-200/80 rounded-xl border border-slate-300/60 shadow-inner gap-1">
            <button 
              onClick={() => setActiveTab('playground')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-bold tracking-wide transition-all ${
                activeTab === 'playground' 
                  ? 'bg-blue-600 text-white shadow-md border border-blue-500 font-extrabold' 
                  : 'text-slate-700 hover:text-slate-900 hover:bg-white/40'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              MÔ PHỎNG GIAO DIỆN (F&B / RETAIL)
            </button>
            <button 
              onClick={() => setActiveTab('structure')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-bold tracking-wide transition-all ${
                activeTab === 'structure' 
                  ? 'bg-white text-slate-900 shadow-md border border-slate-200' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
              }`}
            >
              <FolderOpen className="w-4 h-4 text-blue-600" />
              Thư mục dự án
            </button>
            <button 
              onClick={() => setActiveTab('database')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-bold tracking-wide transition-all ${
                activeTab === 'database' 
                  ? 'bg-white text-slate-900 shadow-md border border-slate-200' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
              }`}
            >
              <Database className="w-4 h-4 text-blue-600" />
              Firestore Schema
            </button>
            <button 
              onClick={() => setActiveTab('architecture')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-bold tracking-wide transition-all ${
                activeTab === 'architecture' 
                  ? 'bg-white text-slate-900 shadow-md border border-slate-200' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
              }`}
            >
              <Server className="w-4 h-4 text-blue-600" />
              Lý thuyết Kiến trúc
            </button>
          </div>

          {/* Tab Content 0: POS, Inventory & Reports Enterprise Dashboard */}
          {activeTab === 'playground' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6 animate-fadeIn"
            >
              {/* Sleek Sub-Tabs Selector */}
              <div className="flex flex-col sm:flex-row bg-slate-200/60 p-1.5 rounded-2xl border border-slate-300/40 shadow-sm gap-2">
                <button
                  onClick={() => { setPlaygroundSubTab('sales'); triggerBeep(true); }}
                  className={`flex-1 py-3 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    playgroundSubTab === 'sales'
                      ? 'bg-slate-900 text-white shadow-md font-extrabold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <ShoppingBag className="w-4 h-4 text-emerald-500" />
                  🛒 1. MÀN HÌNH BÁN HÀNG (POS)
                </button>
                <button
                  onClick={() => { setPlaygroundSubTab('inventory'); triggerBeep(true); }}
                  className={`flex-1 py-3 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    playgroundSubTab === 'inventory'
                      ? 'bg-slate-900 text-white shadow-md font-extrabold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <Layers className="w-4 h-4 text-amber-500" />
                  📦 2. QUẢN LÝ KHO (FEFO/BATCH)
                </button>
                <button
                  onClick={() => { setPlaygroundSubTab('reports'); triggerBeep(true); }}
                  className={`flex-1 py-3 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    playgroundSubTab === 'reports'
                      ? 'bg-slate-900 text-white shadow-md font-extrabold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <Database className="w-4 h-4 text-sky-500" />
                  📊 3. THỐNG KÊ DOANH THU & ĐỒNG BỘ
                </button>
              </div>

              {/* Render Selected Sub-Section */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl shadow-sm p-1 sm:p-3">
                {playgroundSubTab === 'sales' && (
                  <POSScreen
                    simStoreType={simStoreType}
                    setSimStoreType={setSimStoreType}
                    simProducts={simProducts}
                    simTables={simTables}
                    setSimTables={setSimTables}
                    simZones={simZones}
                    setSimZones={setSimZones}
                    simCarts={simCarts}
                    setSimCarts={setSimCarts}
                    simKitchenItems={simKitchenItems}
                    setSimKitchenItems={setSimKitchenItems}
                    simOrders={simOrders}
                    setSimOrders={setSimOrders}
                    simSelectedTableId={simSelectedTableId}
                    setSimSelectedTableId={setSimSelectedTableId}
                    simUserRole={simUserRole}
                    isDemoOfflineMode={isDemoOfflineMode}
                    fbUserProfile={fbUserProfile}
                    fbStoreProfile={fbStoreProfile}
                    triggerBeep={triggerBeep}
                    simBatches={simBatches}
                    setSimBatches={setSimBatches}
                  />
                )}

                {playgroundSubTab === 'inventory' && (
                  <InventoryScreen
                    simProducts={simProducts}
                    setSimProducts={setSimProducts}
                    simBatches={simBatches}
                    setSimBatches={setSimBatches}
                    simTransactions={simTransactions}
                    setSimTransactions={setSimTransactions}
                    triggerBeep={triggerBeep}
                    fbUserProfile={fbUserProfile}
                  />
                )}

                 {playgroundSubTab === 'reports' && (
                  <ReportsSection
                    simOrders={simOrders}
                    simProducts={simProducts}
                    triggerBeep={triggerBeep}
                    isOffline={true}
                    storeId="demo-store"
                    currentUser={{ uid: 'demo-uid', name: 'Quản lý Demo', role: 'owner' } as any}
                    attendanceLogs={[]}
                    onCheckIn={async () => { alert('Simulated check-in'); }}
                    onCheckOut={async () => { alert('Simulated check-out'); }}
                  />
                )}
              </div>
            </motion.div>
          )}

          {/* Legacy Playground simulator content is safely bypassed and retained for offline fallbacks */}
          {false && activeTab === 'playground' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Simulator Card Frame */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-6 space-y-6">
                
                {/* Mode Selector & Title */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                  <div>
                    <h2 className="text-xl font-bold text-slate-950 flex items-center gap-2">
                      <ShoppingBag className="text-blue-600 w-5.5 h-5.5 animate-pulse" />
                      Trình Mô Phỏng Giao Diện POS Đa Cửa Hàng
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">Dựa vào thuộc tính <code>storeType</code> trong Firestore để vẽ giao diện chuẩn cho từng ngành hàng.</p>
                  </div>

                  {/* Toggle Store Type */}
                  <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                      onClick={() => { setSimStoreType('fnb'); triggerBeep(true); }}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                        simStoreType === 'fnb'
                          ? 'bg-blue-600 text-white shadow-md font-extrabold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Coffee className="w-3.5 h-3.5" />
                      Mô hình F&B (Ăn uống)
                    </button>
                    <button
                      onClick={() => { setSimStoreType('retail'); triggerBeep(true); }}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                        simStoreType === 'retail'
                          ? 'bg-blue-600 text-white shadow-md font-extrabold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Store className="w-3.5 h-3.5" />
                      Mô hình Bán lẻ (Siêu thị)
                    </button>
                  </div>
                </div>

                {/* SIMULATOR MAIN LAYOUT */}
                {simStoreType === 'fnb' ? (
                  // --- TYPE 1: F&B LAYOUT (Sơ đồ bàn, menu gọi món, KDS Bếp) ---
                  <div className="space-y-6">

                     {/* Control Bar: Collapse/Expand and User Role authorization switcher */}
                     <div className="flex flex-wrap items-center justify-between gap-3 bg-blue-50/50 border border-blue-100 rounded-2xl p-4">
                       <div className="flex items-center gap-3">
                         {/* Toggle collapse button */}
                         <button
                           onClick={() => { setIsFloorPlanCollapsed(!isFloorPlanCollapsed); triggerBeep(true); }}
                           className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 border shadow-sm transition-all cursor-pointer ${
                             isFloorPlanCollapsed
                               ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 animate-pulse'
                               : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                           }`}
                         >
                           {isFloorPlanCollapsed ? (
                             <>
                               <Maximize2 className="w-4 h-4" />
                               📂 Mở rộng Sơ đồ bàn & Mặt bằng
                             </>
                           ) : (
                             <>
                               <Minimize2 className="w-4 h-4" />
                               📁 Thu gọn Sơ đồ bàn ăn
                             </>
                           )}
                         </button>
                         <div className="text-left">
                           <p className="text-xs font-bold text-slate-700">
                             Trạng thái Sơ đồ: {isFloorPlanCollapsed ? "Đã thu gọn" : "Đang hiển thị"}
                           </p>
                           <p className="text-[10px] text-slate-500 hidden sm:block">
                             {isFloorPlanCollapsed 
                               ? "Giao diện được thu gọn tối đa để nhường chỗ cho phần gọi món / thực đơn." 
                               : "Hiển thị đầy đủ trực quan, kéo thả di chuyển vị trí tự do."}
                           </p>
                         </div>
                       </div>

                       {/* User Role authorization switcher */}
                       <div className="flex items-center gap-2 bg-white border border-slate-200 p-1.5 rounded-xl shadow-sm text-xs">
                         <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider px-2">Quyền hạn hệ thống:</span>
                         
                         <button
                           onClick={() => { setSimUserRole('admin'); triggerBeep(true); }}
                           className={`px-3 py-1.5 rounded-lg font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                             simUserRole === 'admin'
                               ? 'bg-amber-600 text-white shadow-sm'
                               : 'bg-white text-slate-600 hover:text-slate-900'
                           }`}
                         >
                           🔑 Admin (Toàn quyền)
                         </button>
                         
                         <button
                           onClick={() => { setSimUserRole('staff'); triggerBeep(true); }}
                           className={`px-3 py-1.5 rounded-lg font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                             simUserRole === 'staff'
                               ? 'bg-slate-600 text-white shadow-sm'
                               : 'bg-white text-slate-600 hover:text-slate-900'
                           }`}
                         >
                           🧑 Staff (Chỉ xem sơ đồ)
                         </button>
                       </div>
                     </div>
                    
                     {!isFloorPlanCollapsed && (
                       /* Part A: Dining Tables Map & Smart Zone Manager */
                       <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-5">
                       
                       {/* Section Header */}
                       <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-4">
                         <div className="space-y-1">
                           <div className="flex items-center gap-2">
                             <Utensils className="w-5 h-5 text-blue-600" />
                             <h3 className="text-base font-bold text-slate-950">Mặt bằng Sơ đồ Bàn ăn thông minh (Draggable Floor Plan Map)</h3>
                           </div>
                           <p className="text-xs text-slate-500">Kéo thả bàn để thay đổi vị trí. Điều chỉnh kích thước to nhỏ. Hỗ trợ quản lý lên tới hàng trăm bàn.</p>
                         </div>
                         
                         {/* Bulk Generate and Reset Buttons */}
                         <div className="flex gap-2">
                           <button
                             onClick={handleBulkGenerateTables}
                             className="px-3.5 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-xl text-xs font-extrabold flex items-center gap-1.5 hover:bg-green-100 transition-all cursor-pointer"
                             title="Tạo giả lập 45 bàn trải đều các tầng để test khả năng chịu tải hàng trăm bàn"
                           >
                             ⚡ Tạo nhanh 45 bàn mẫu
                           </button>
                           
                           <button
                             onClick={() => {
                               if (confirm("Reset lại sơ đồ về ban đầu?")) {
                                 setSimTables([
                                   { id: 'T1', name: 'Bàn 01', status: 'serving' as any, capacity: 4, zoneId: 'z1', x: 10, y: 15, width: 95, height: 95, createdAt: '2026-07-02T20:45:00-07:00' },
                                   { id: 'T2', name: 'Bàn 02', status: 'empty' as any, capacity: 2, zoneId: 'z1', x: 40, y: 15, width: 95, height: 95, createdAt: '2026-07-02T20:45:00-07:00' },
                                   { id: 'T3', name: 'Bàn 03', status: 'serving' as any, capacity: 6, zoneId: 'z1', x: 70, y: 15, width: 110, height: 95, createdAt: '2026-07-02T20:45:00-07:00' },
                                   { id: 'T4', name: 'Bàn 04', status: 'empty' as any, capacity: 4, zoneId: 'z2', x: 25, y: 30, width: 95, height: 95, createdAt: '2026-07-02T20:45:00-07:00' },
                                   { id: 'T5', name: 'Bàn 05 (VIP)', status: 'empty' as any, capacity: 8, zoneId: 'z3', x: 45, y: 35, width: 130, height: 110, createdAt: '2026-07-02T20:45:00-07:00' },
                                 ]);
                                 setSimZones([
                                   { id: 'z1', name: 'Khu chung (Tầng 1)' },
                                   { id: 'z2', name: 'Tầng 2' },
                                   { id: 'z3', name: 'Tầng 3' }
                                 ]);
                                 setSimSelectedZoneId('z1');
                                 triggerBeep(true);
                               }
                             }}
                             className="px-2.5 py-1.5 bg-white text-slate-500 border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer"
                           >
                             Cài lại mặc định
                           </button>
                         </div>
                       </div>

                       {/* ZONE MANAGER PANEL */}
                       <div className="bg-slate-100 border border-slate-200 rounded-xl p-3.5 space-y-3">
                         <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                           
                           {/* Select Zone Tabs */}
                           <div className="flex flex-wrap items-center gap-1.5">
                             <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Khu vực:</span>
                             <button
                               onClick={() => { setSimSelectedZoneId('all'); triggerBeep(true); }}
                               className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all border ${
                                 simSelectedZoneId === 'all'
                                   ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                   : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                               }`}
                             >
                               🌍 Tất cả các khu ({simTables.length})
                             </button>
                             {simZones.map((z) => {
                               const count = simTables.filter(t => t.zoneId === z.id).length;
                               return (
                                 <button
                                   key={z.id}
                                   onClick={() => { setSimSelectedZoneId(z.id); triggerBeep(true); }}
                                   className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all border flex items-center gap-1.5 ${
                                     simSelectedZoneId === z.id
                                       ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                       : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                   }`}
                                 >
                                   <MapPin className="w-3 h-3" />
                                   {z.name}
                                   <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                                     simSelectedZoneId === z.id ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500'
                                   }`}>
                                     {count}
                                   </span>
                                 </button>
                               );
                             })}
                           </div>

                           {/* Add Custom Zone Inline */}
                           <div className="flex items-center gap-2 w-full md:w-auto">
                             <input
                               type="text"
                               placeholder="Tên khu mới (Tầng 4...)"
                               value={newZoneName}
                               onChange={(e) => setNewZoneName(e.target.value)}
                               className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500 flex-1 md:w-40 text-slate-900"
                             />
                             <button
                               onClick={() => {
                                 handleAddZone(newZoneName);
                                 setNewZoneName('');
                               }}
                               className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                             >
                               <Plus className="w-4 h-4" />
                             </button>
                           </div>

                         </div>

                         {/* CUSTOMIZE ACTIVE ZONE PANEL */}
                         {simSelectedZoneId !== 'all' && (
                           <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-200 text-xs">
                             <div className="flex items-center gap-3">
                               <span className="text-slate-500">Đang chọn: <strong className="text-slate-900">{simZones.find(z => z.id === simSelectedZoneId)?.name}</strong></span>
                               {editingZoneId === simSelectedZoneId ? (
                                 <div className="flex items-center gap-2">
                                   <input
                                     type="text"
                                     value={editingZoneName}
                                     onChange={(e) => setEditingZoneName(e.target.value)}
                                     className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs text-slate-900 focus:outline-none"
                                   />
                                   <button
                                     onClick={() => {
                                       handleUpdateZone(simSelectedZoneId, editingZoneName);
                                       setEditingZoneId(null);
                                     }}
                                     className="px-2 py-0.5 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 cursor-pointer text-[10px]"
                                   >
                                     Lưu
                                   </button>
                                   <button
                                     onClick={() => setEditingZoneId(null)}
                                     className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded font-bold hover:bg-slate-300 cursor-pointer text-[10px]"
                                   >
                                     Hủy
                                   </button>
                                 </div>
                               ) : (
                                 <button
                                   onClick={() => {
                                     setEditingZoneId(simSelectedZoneId);
                                     setEditingZoneName(simZones.find(z => z.id === simSelectedZoneId)?.name || '');
                                   }}
                                   className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 text-[11px] bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm cursor-pointer"
                                 >
                                   <Edit3 className="w-3 h-3" /> Sửa tên khu này
                                 </button>
                               )}
                             </div>

                             {/* Delete Active Zone Button */}
                             <button
                               onClick={() => handleDeleteZone(simSelectedZoneId)}
                               className="text-red-600 hover:text-red-800 font-bold flex items-center gap-1 text-[11px] bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1 rounded cursor-pointer"
                             >
                               <Trash2 className="w-3 h-3" /> Xóa khu vực này
                             </button>
                           </div>
                         )}
                       </div>

                       {/* ADD TABLE INLINE FORM */}
                       <div className="p-3 bg-white border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                         <div className="flex flex-wrap items-center gap-3">
                           <span className="font-bold text-slate-700">Thêm bàn ăn mới:</span>
                           <input
                             type="text"
                             placeholder="Tên bàn (ví dụ: Bàn 06)"
                             value={newTableName}
                             onChange={(e) => setNewTableName(e.target.value)}
                             className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 w-36 text-slate-900"
                           />
                           
                           <div className="flex items-center gap-1.5">
                             <span className="text-slate-500">Sức chứa:</span>
                             <select
                               value={newTableCapacity}
                               onChange={(e) => setNewTableCapacity(Number(e.target.value))}
                               className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none text-slate-900 font-mono"
                             >
                               {[1, 2, 4, 6, 8, 10, 12, 16].map(n => (
                                 <option key={n} value={n}>{n} người</option>
                               ))}
                             </select>
                           </div>

                           <div className="flex items-center gap-1.5">
                             <span className="text-slate-500 font-sans">Vào khu:</span>
                             <select
                               value={simSelectedZoneId === 'all' ? simZones[0].id : simSelectedZoneId}
                               onChange={(e) => setSimSelectedZoneId(e.target.value)}
                               className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none text-slate-900 font-medium"
                             >
                               {simZones.map(z => (
                                 <option key={z.id} value={z.id}>{z.name}</option>
                               ))}
                             </select>
                           </div>
                         </div>

                         <button
                           onClick={() => {
                             const targetZone = simSelectedZoneId === 'all' ? simZones[0].id : simSelectedZoneId;
                             handleAddTable(newTableName, newTableCapacity, targetZone);
                             setNewTableName('');
                           }}
                           className="py-1.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                         >
                           <Plus className="w-3.5 h-3.5" /> Tạo bàn
                         </button>
                       </div>

                       {/* DOUBLE COLUMN LAYOUT: SIDEBAR GROUPED BY ZONE VS FLOOR PLAN MAP */}
                       <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
                         
                         {/* COLUMN 1: SIDEBAR TABLE LIST GROUPED BY ZONE */}
                         <div className="xl:col-span-1 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col h-[500px]">
                           
                           {/* Sidebar Search Bar */}
                           <div className="relative mb-3">
                             <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                             <input
                               type="text"
                               placeholder="Tìm bàn ăn..."
                               value={tableSearchQuery}
                               onChange={(e) => setTableSearchQuery(e.target.value)}
                               className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-blue-500 text-slate-900"
                             />
                             {tableSearchQuery && (
                               <button
                                 onClick={() => setTableSearchQuery('')}
                                 className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                               >
                                 <X className="w-3.5 h-3.5" />
                               </button>
                             )}
                           </div>

                           <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                             {simZones.map((z) => {
                               // Filter tables inside this zone that match search query
                               const zoneTables = simTables.filter(t => 
                                 t.zoneId === z.id && 
                                 (tableSearchQuery === '' || t.name.toLowerCase().includes(tableSearchQuery.toLowerCase()))
                               );

                               if (zoneTables.length === 0 && tableSearchQuery !== '') return null;

                               const servingCount = zoneTables.filter(t => t.status === 'serving').length;

                               return (
                                 <div key={z.id} className="space-y-1.5">
                                   <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                                     <span className="text-[11px] font-extrabold text-slate-500 truncate max-w-[140px]" title={z.name}>
                                       📁 {z.name}
                                     </span>
                                     <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-500 font-bold">
                                       {zoneTables.length} bàn ({servingCount} ăn)
                                     </span>
                                   </div>

                                   {zoneTables.length === 0 ? (
                                     <p className="text-[10px] text-slate-400 italic pl-2">Chưa có bàn.</p>
                                   ) : (
                                     <div className="grid grid-cols-1 gap-1">
                                       {zoneTables.map((table) => {
                                         const isSelected = simSelectedTableId === table.id;
                                         const isServing = table.status === 'serving';
                                         const tableCart = simCarts[table.id] || [];
                                         const cartCount = tableCart.reduce((sum, item) => sum + item.quantity, 0);

                                         return (
                                           <button
                                             key={table.id}
                                             onClick={() => {
                                               // Switch to that table's zone to show it on map
                                               if (simSelectedZoneId !== 'all' && simSelectedZoneId !== table.zoneId) {
                                                 setSimSelectedZoneId(table.zoneId || 'z1');
                                               }
                                               setSimSelectedTableId(table.id);
                                               triggerBeep(true);
                                             }}
                                             className={`w-full p-2 rounded-lg text-left text-xs transition-all flex items-center justify-between gap-1 border border-solid ${
                                               isSelected
                                                 ? 'bg-blue-50 border-blue-400 text-blue-900 font-extrabold'
                                                 : 'bg-white border-slate-100 hover:bg-slate-50 text-slate-700'
                                             }`}
                                           >
                                             <div className="flex items-center gap-2 min-w-0">
                                               {/* Status indicator dot */}
                                               <span className={`w-2 h-2 rounded-full shrink-0 ${
                                                 isServing ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'
                                               }`}></span>
                                               <span className="truncate font-medium">{table.name}</span>
                                               <span className="text-[9px] text-slate-400 shrink-0 font-mono">({table.capacity} Ghế)</span>
                                             </div>
                                             
                                             <div className="flex items-center gap-1.5 shrink-0">
                                               {cartCount > 0 && (
                                                 <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1 rounded-full">
                                                   {cartCount}m
                                                 </span>
                                               )}
                                               <span className="text-[9px] text-slate-400 font-mono">
                                                 {table.x}%, {table.y}%
                                               </span>
                                             </div>
                                           </button>
                                         );
                                       })}
                                     </div>
                                   )}
                                 </div>
                               );
                             })}
                           </div>

                           <div className="pt-2 border-t border-slate-100 text-center">
                             <span className="text-[10px] text-slate-400 font-semibold uppercase font-mono">Tổng: {simTables.length} bàn ăn</span>
                           </div>
                         </div>

                         {/* COLUMN 2: INTERACTIVE DRAGGABLE & RESIZABLE MAP CANVAS */}
                         <div className="xl:col-span-3 flex flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden h-[500px]">
                           
                           {/* Map Navigation Bar */}
                           <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between text-xs shrink-0">
                             <div className="flex items-center gap-1.5 text-slate-600">
                               <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                               <span>Đang hiển thị: <strong className="text-slate-900">
                                 {simSelectedZoneId === 'all' ? 'Tất cả các khu' : simZones.find(z => z.id === simSelectedZoneId)?.name}
                               </strong></span>
                             </div>
                             
                             <div className="text-[10px] text-slate-400 italic font-medium">
                               💡 Kéo thả mép bàn hoặc giữ chuột để di dời bàn ăn tự do
                             </div>
                           </div>

                           {/* Blueprint Canvas Grid */}
                           <div 
                             id="table-map-canvas"
                             className="flex-1 relative bg-slate-50 overflow-hidden shadow-inner select-none cursor-default bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:30px_30px]"
                           >
                             {/* Canvas visual bounds reminder */}
                             <div className="absolute inset-x-0 top-0 text-center py-1 bg-slate-200/45 border-b border-slate-200 text-[10px] font-bold tracking-wide uppercase text-slate-400 pointer-events-none font-mono">
                               VÙNG BẢN ĐỒ SƠ ĐỒ MẶT BẰNG NHÀ HÀNG
                             </div>

                             {/* Rendering tables on Canvas */}
                             {simTables
                               .filter(table => simSelectedZoneId === 'all' || table.zoneId === simSelectedZoneId)
                               .map((table) => {
                                 const isSelected = simSelectedTableId === table.id;
                                 const isServing = table.status === 'serving';
                                 const tableCart = simCarts[table.id] || [];
                                 const cartCount = tableCart.reduce((sum, item) => sum + item.quantity, 0);

                                 const w = table.width || 95;
                                 const h = table.height || 95;

                                 return (
                                   <div
                                     key={table.id}
                                     onDoubleClick={() => handleToggleExpandTable(table.id)}
                                     onMouseDown={(e) => {
                                       // Only start drag if not clicking buttons or inside of them
                                       if ((e.target as HTMLElement).closest('button')) return;
                                       e.preventDefault();
                                       
                                       // Ensure only Admin can reposition tables
                                       if (!checkAdminPermission()) {
                                         setSimSelectedTableId(table.id);
                                         return;
                                       }
                                       
                                       const element = e.currentTarget.getBoundingClientRect();
                                       setDraggingTableId(table.id);
                                       setDragOffset({
                                         x: e.clientX - element.left,
                                         y: e.clientY - element.top
                                       });
                                       setSimSelectedTableId(table.id);
                                     }}
                                     style={{
                                       position: 'absolute',
                                       left: `${table.x || 10}%`,
                                       top: `${table.y || 15}%`,
                                       width: `${w}px`,
                                       height: `${h}px`,
                                       touchAction: 'none'
                                     }}
                                     className={`rounded-xl border shadow-sm flex flex-col justify-between p-2.5 transition-shadow duration-150 absolute ${
                                       isSelected
                                         ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/30 shadow-md z-30'
                                         : isServing
                                           ? 'bg-red-50/90 border-red-300 hover:bg-red-50 hover:shadow-sm z-10'
                                           : 'bg-white border-slate-300 hover:border-slate-400 hover:shadow-sm z-10'
                                     } ${draggingTableId === table.id ? 'opacity-80 cursor-grabbing shadow-lg scale-[1.02] z-40' : 'cursor-grab'}`}
                                   >
                                     {/* Table Top Header: Name and Quick Delete */}
                                     <div className="flex items-center justify-between w-full">
                                       <span className={`text-[11px] font-black truncate max-w-[70%] ${
                                         isSelected ? 'text-blue-700' : 'text-slate-900'
                                       }`}>
                                         {table.name}
                                       </span>
                                       
                                       {/* Delete table button */}
                                       <button
                                         onClick={() => handleDeleteTable(table.id)}
                                         className="p-0.5 text-slate-300 hover:text-red-500 rounded hover:bg-slate-100/50 transition-colors"
                                         title="Xóa bàn này"
                                       >
                                         <X className="w-3 h-3" />
                                       </button>
                                     </div>

                                     {/* Table Middle: Status, Capacity, active Orders count */}
                                     <div className="flex-1 flex flex-col items-center justify-center py-1">
                                       {/* Active Ping Dot for Serving */}
                                       {isServing && (
                                         <span className="w-2 h-2 bg-red-500 rounded-full animate-ping mb-1"></span>
                                       )}
                                       
                                       <div className="flex items-center gap-1">
                                         <span className={`text-[9px] font-bold px-1 rounded-sm ${
                                           isServing ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                                         }`}>
                                           {isServing ? 'Đang ăn' : 'Bàn trống'}
                                         </span>
                                       </div>

                                       <span className="text-[9px] text-slate-400 font-semibold font-mono mt-0.5">
                                         {table.capacity} chỗ {table.zoneId && simSelectedZoneId === 'all' && (
                                           <span className="text-slate-500">({simZones.find(z => z.id === table.zoneId)?.name.split(' ').pop()})</span>
                                         )}
                                       </span>
                                       
                                       {cartCount > 0 && (
                                         <span className="mt-1 text-[8px] font-extrabold text-blue-700 bg-blue-100 px-1 py-0.2 rounded-full truncate max-w-full">
                                           {cartCount} món
                                         </span>
                                       )}
                                     </div>

                                     {/* Table Bottom: Interactive Resize Toggles */}
                                     <div className="w-full pt-1.5 border-t border-slate-100 flex items-center justify-between gap-1">
                                       {/* Compact/Expand toggle */}
                                       <button
                                         onClick={() => handleToggleExpandTable(table.id)}
                                         className="p-0.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded flex items-center justify-center cursor-pointer"
                                         title="Thu gọn / Mở rộng"
                                       >
                                         {w < 120 ? (
                                           <Maximize2 className="w-2.5 h-2.5" />
                                         ) : (
                                           <Minimize2 className="w-2.5 h-2.5" />
                                         )}
                                       </button>

                                       {/* Fine-grained sizing buttons */}
                                       <div className="flex gap-0.5 items-center">
                                         <button
                                           onClick={() => handleResizeTable(table.id, -15, -15)}
                                           className="p-0.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded font-bold leading-none"
                                           title="Thu nhỏ 15px"
                                         >
                                           <Minus className="w-2.5 h-2.5" />
                                         </button>
                                         <button
                                           onClick={() => handleResizeTable(table.id, 15, 15)}
                                           className="p-0.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded font-bold leading-none"
                                           title="Mở rộng 15px"
                                         >
                                           <Plus className="w-2.5 h-2.5" />
                                         </button>
                                       </div>
                                     </div>

                                   </div>
                                 );
                               })}

                             {/* Fallback empty view */}
                             {simTables.filter(table => simSelectedZoneId === 'all' || table.zoneId === simSelectedZoneId).length === 0 && (
                               <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-slate-400 space-y-2 pointer-events-none">
                                 <MapPin className="w-12 h-12 text-slate-300" />
                                 <p className="text-sm font-bold">Khu vực này chưa có bàn ăn nào</p>
                                 <p className="text-xs">Hãy sử dụng thanh "Thêm bàn ăn mới" phía trên để tạo bàn!</p>
                               </div>
                             )}
                           </div>

                           {/* Canvas footer metadata */}
                           <div className="bg-slate-100 px-4 py-2 border-t border-slate-200 text-[10px] text-slate-400 font-mono flex items-center justify-between shrink-0">
                             <span>🎯 Chọn bàn bất kỳ trên sơ đồ để kích hoạt POS gọi món bên dưới</span>
                             <span>Màn hình Canvas: 100% tỷ lệ phần trăm (phản hồi theo khung)</span>
                           </div>

                         </div>

                       </div>

                     </div>

)}

                    {/* Part B: POS Menu & Table Cart Side-by-Side */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                      
                      {/* Left: Products Menu */}
                      <div className="md:col-span-7 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Thực đơn nhà hàng ({simTables.find(t=>t.id===simSelectedTableId)?.name})</h4>
                          
                          {/* Menu categories filter */}
                          <div className="flex gap-1 overflow-x-auto pb-1">
                            {['Tất cả', 'Đồ uống', 'Món ăn', 'Ăn nhẹ'].map((cat) => (
                              <button
                                key={cat}
                                onClick={() => { setSimSelectedCategory(cat); triggerBeep(true); }}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap border ${
                                  simSelectedCategory === cat
                                    ? 'bg-slate-900 text-white border-slate-950 font-extrabold'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Menu Items Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {simProducts
                            .filter(p => simSelectedCategory === 'Tất cả' || p.category === simSelectedCategory)
                            .map((p) => {
                              const isAvail = p.isAvailable;
                              return (
                                <div
                                  key={p.id}
                                  className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 bg-white transition-all ${
                                    isAvail ? 'border-slate-200 hover:shadow-md' : 'border-slate-100 opacity-60 bg-slate-50/50'
                                  }`}
                                >
                                  <div>
                                    <div className="flex justify-between items-start gap-1">
                                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded font-mono ${
                                        p.category === 'Đồ uống' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'
                                      }`}>
                                        {p.category}
                                      </span>
                                      
                                      {/* LIVE Toggle state of isAvailable (Disables Ordering if false) */}
                                      <button
                                        onClick={() => toggleProductAvailability(p.id)}
                                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border cursor-pointer ${
                                          isAvail 
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                                            : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                                        }`}
                                        title="Click để đổi trạng thái Còn hàng / Hết món"
                                      >
                                        {isAvail ? '🟢 Còn hàng' : '🔴 Hết món'}
                                      </button>
                                    </div>
                                    <h5 className="font-bold text-slate-900 text-xs mt-2">{p.name}</h5>
                                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">SKU: {p.sku}</p>
                                  </div>

                                  <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                                    <span className="font-extrabold text-blue-600 text-xs">{p.price.toLocaleString('vi-VN')} đ</span>
                                    
                                    {isAvail ? (
                                      <button
                                        onClick={() => addToCart(p.id)}
                                        className="py-1 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
                                      >
                                        <Plus className="w-3 h-3" /> Gọi món
                                      </button>
                                    ) : (
                                      <span className="py-1 px-2.5 bg-slate-100 text-slate-400 rounded-lg text-[10px] font-bold border border-slate-200">
                                        🚫 Hết món
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>

                      {/* Right: Table Cart List */}
                      <div className="md:col-span-5 bg-slate-50 rounded-2xl border border-slate-200 p-4 flex flex-col justify-between min-h-[400px]">
                        <div>
                          <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-3">
                            <div className="flex items-center gap-1.5">
                              <ShoppingBag className="w-4 h-4 text-blue-600" />
                              <span className="font-bold text-xs text-slate-900">
                                Đơn hàng: <strong className="text-blue-600">{simTables.find(t=>t.id===simSelectedTableId)?.name}</strong>
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                setSimCarts(prev => ({ ...prev, [simSelectedTableId]: [] }));
                                triggerBeep(false);
                              }}
                              className="text-[10px] text-red-500 hover:text-red-700 font-semibold"
                            >
                              Xóa tất cả
                            </button>
                          </div>

                          {/* Cart Items list */}
                          {(!simCarts[simSelectedTableId] || simCarts[simSelectedTableId].length === 0) ? (
                            <div className="py-12 text-center space-y-2">
                              <Utensils className="w-8 h-8 text-slate-300 mx-auto" />
                              <p className="text-xs text-slate-400">Chưa gọi món nào cho bàn ăn này.</p>
                              <p className="text-[10px] text-slate-400">Chọn các món bên trái để gọi lên bàn!</p>
                            </div>
                          ) : (
                            <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                              {simCarts[simSelectedTableId].map((item) => {
                                const prod = simProducts.find(p => p.id === item.productId);
                                if (!prod) return null;
                                return (
                                  <div key={item.productId} className="p-2.5 bg-white border border-slate-200 rounded-xl space-y-2">
                                    <div className="flex items-start justify-between gap-1">
                                      <div className="min-w-0">
                                        <h6 className="font-bold text-xs text-slate-900 truncate">{prod.name}</h6>
                                        <span className="text-[10px] font-extrabold text-blue-600">{(prod.price * item.quantity).toLocaleString('vi-VN')} đ</span>
                                      </div>
                                      <button 
                                        onClick={() => deleteFromCart(item.productId)}
                                        className="text-slate-300 hover:text-red-500 transition-colors"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>

                                    {/* Qty edit & Custom note to kitchen */}
                                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                                      <div className="flex items-center gap-1.5 bg-slate-100 px-1.5 py-0.5 rounded-lg">
                                        <button 
                                          onClick={() => decreaseCartQuantity(item.productId)}
                                          className="p-0.5 hover:bg-white rounded text-slate-500 cursor-pointer"
                                        >
                                          <Minus className="w-3 h-3" />
                                        </button>
                                        <span className="font-mono text-xs font-bold w-4 text-center">{item.quantity}</span>
                                        <button 
                                          onClick={() => addToCart(item.productId)}
                                          className="p-0.5 hover:bg-white rounded text-slate-500 cursor-pointer"
                                        >
                                          <Plus className="w-3 h-3" />
                                        </button>
                                      </div>

                                      <input
                                        type="text"
                                        value={item.note}
                                        onChange={(e) => updateCartItemNote(item.productId, e.target.value)}
                                        placeholder="Ghi chú bếp (cay/ngọt...)"
                                        className="flex-1 bg-white border border-slate-200 rounded px-2 py-0.5 text-[10px] focus:outline-none focus:border-blue-500 text-slate-700"
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Cart Summary & Action Buttons */}
                        {simCarts[simSelectedTableId] && simCarts[simSelectedTableId].length > 0 && (
                          <div className="border-t border-slate-200 pt-3 mt-3 space-y-3">
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-slate-500">Tổng tiền bàn ăn:</span>
                              <span className="font-extrabold text-slate-900 text-sm">
                                {simCarts[simSelectedTableId].reduce((sum, item) => {
                                  const pr = simProducts.find(p => p.id === item.productId)?.price || 0;
                                  return sum + pr * item.quantity;
                                }, 0).toLocaleString('vi-VN')} đ
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              {/* Send to Kitchen Display queue (KDS) */}
                              <button
                                onClick={sendTableToKitchen}
                                className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
                              >
                                <ChefHat className="w-3.5 h-3.5" /> Gửi Bếp (KDS)
                              </button>

                              {/* Pay and print bill */}
                              <button
                                onClick={() => checkoutOrder('qr')}
                                className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
                              >
                                <Printer className="w-3.5 h-3.5" /> Thanh toán
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Part C: Kitchen Display KDS Monitor Queue */}
                    <div className="p-5 bg-slate-950 text-white rounded-2xl border border-slate-800 space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                          <ChefHat className="w-4 h-4 text-amber-400" />
                          <h4 className="text-sm font-bold">Màn hình Đầu bếp KDS (Kitchen Display Queue)</h4>
                        </div>
                        <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded font-bold font-mono">CẬP NHẬT CHẾ BIẾN REAL-TIME</span>
                      </div>

                      {simKitchenItems.length === 0 ? (
                        <div className="py-8 text-center text-slate-500 text-xs">
                          Chưa có yêu cầu chế biến món ăn nào dưới bếp.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {simKitchenItems.map((item) => {
                            return (
                              <div 
                                key={item.id} 
                                className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 ${
                                  item.status === 'pending'
                                    ? 'bg-slate-900 border-red-900/40 text-slate-100'
                                    : item.status === 'preparing'
                                      ? 'bg-slate-900 border-amber-900/60 text-slate-100'
                                      : item.status === 'completed'
                                        ? 'bg-slate-900 border-indigo-900/60 text-slate-100'
                                        : 'bg-slate-900/55 border-slate-800 text-slate-400'
                                }`}
                              >
                                <div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-extrabold text-amber-400 font-mono">{item.tableNumber}</span>
                                    <span className="text-[10px] text-slate-500 font-mono">{item.orderId}</span>
                                  </div>
                                  <h6 className="font-extrabold text-xs mt-1">{item.productName}</h6>
                                  <p className="text-xs font-bold text-slate-300">Số lượng: <strong className="text-white text-sm">{item.quantity}</strong></p>
                                  {item.note && (
                                    <p className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-1 rounded mt-1.5 italic font-sans">
                                      ⚠️ Ghi chú: {item.note}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                                  {/* Kitchen Status Badge */}
                                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                    item.status === 'pending' 
                                      ? 'bg-red-500/20 text-red-400' 
                                      : item.status === 'preparing'
                                        ? 'bg-amber-500/20 text-amber-400'
                                        : item.status === 'completed'
                                          ? 'bg-indigo-500/20 text-indigo-400'
                                          : 'bg-slate-500/20 text-slate-400'
                                  }`}>
                                    {item.status === 'pending' && '🔴 Chờ làm'}
                                    {item.status === 'preparing' && '🟡 Đang nấu'}
                                    {item.status === 'completed' && '🔵 Đã xong'}
                                    {item.status === 'served' && '🟢 Đã lên bàn'}
                                  </span>

                                  {/* Action controller button */}
                                  {item.status !== 'served' && (
                                    <button
                                      onClick={() => updateKitchenItemStatus(item.id, item.status)}
                                      className="py-1 px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                    >
                                      {item.status === 'pending' && '👨‍🍳 Làm món'}
                                      {item.status === 'preparing' && '✅ Xong món'}
                                      {item.status === 'completed' && '🚚 Bưng lên'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                  </div>
                ) : (
                  // --- TYPE 2: RETAIL LAYOUT (Cashier view, barcode scanner, FIFO batches) ---
                  <div className="space-y-6">
                    
                    {/* Part A: Simulated Barcode Reader & FIFO config */}
                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ScanLine className="w-4 h-4 text-blue-600" />
                          <h3 className="text-sm font-bold text-slate-950">Quét mã vạch giả lập (Hardware Barcode Scanner simulation)</h3>
                        </div>
                        <span className="text-[10px] bg-blue-100 text-blue-700 font-mono px-2 py-0.5 rounded font-bold uppercase">FIFO Batches</span>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed">
                        Nhấn các nút bên dưới để mô phỏng máy đọc mã vạch quét qua nhãn sản phẩm. Hệ thống tự động tách mã SKU, 
                        beep phản hồi bằng Web Audio API, truy xuất thông tin tồn kho FIFO từ các lô hàng tương ứng.
                      </p>

                      {/* Flash beep block */}
                      <div className="flex flex-wrap gap-2 items-center">
                        <button
                          onClick={() => simulateBarcodeScan('8930001001')}
                          className="py-2.5 px-3 bg-white border border-slate-300 hover:border-blue-400 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                        >
                          <ScanLine className="w-3.5 h-3.5 text-blue-600" /> Quét mã "Cà Phê Sữa Đá" (8930001001)
                        </button>
                        <button
                          onClick={() => simulateBarcodeScan('8930001003')}
                          className="py-2.5 px-3 bg-white border border-slate-300 hover:border-blue-400 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                        >
                          <ScanLine className="w-3.5 h-3.5 text-blue-600" /> Quét mã "Phở Bò Kobe" (8930001003)
                        </button>
                        <button
                          onClick={() => simulateBarcodeScan('8930001005')}
                          className="py-2.5 px-3 bg-white border border-slate-300 hover:border-blue-400 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                        >
                          <ScanLine className="w-3.5 h-3.5 text-blue-600" /> Quét mã "Bánh Mì Garlic" (8930001005)
                        </button>
                        <button
                          onClick={() => simulateBarcodeScan('9999999999')}
                          className="py-2.5 px-3 bg-white border border-slate-300 hover:border-red-400 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer text-red-600"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> Quét mã lỗi (BEEP Lỗi)
                        </button>
                      </div>

                      {/* Visual sound beep flashes */}
                      <div className="flex gap-4 items-center pt-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">Mô phỏng tiếng BEEP:</span>
                          {simSuccessBeep && (
                            <span className="px-2.5 py-1 bg-green-500 text-white text-[10px] font-extrabold rounded animate-ping">🔊 BÍP THÀNH CÔNG (High 1200Hz)</span>
                          )}
                          {simErrorBeep && (
                            <span className="px-2.5 py-1 bg-red-500 text-white text-[10px] font-extrabold rounded animate-bounce">⚠️ BÍP LỖI (Low 250Hz)</span>
                          )}
                          {!simSuccessBeep && !simErrorBeep && (
                            <span className="text-[11px] text-slate-400 italic">Sẵn sàng chờ quét...</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Part B: Products and Cart for Retail */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                      {/* Left: Products Quick Add */}
                      <div className="md:col-span-7 space-y-4">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Danh mục sản phẩm siêu thị</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {simProducts.map((p) => {
                            const isAvail = p.isAvailable;
                            return (
                              <div
                                key={p.id}
                                className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 bg-white transition-all ${
                                  isAvail ? 'border-slate-200 hover:shadow-md' : 'border-slate-100 opacity-60 bg-slate-50/50'
                                }`}
                              >
                                <div>
                                  <div className="flex justify-between items-start gap-1">
                                    <span className="text-[10px] font-mono text-slate-400">{p.sku}</span>
                                    <button
                                      onClick={() => toggleProductAvailability(p.id)}
                                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded border cursor-pointer ${
                                        isAvail ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                                      }`}
                                    >
                                      {isAvail ? '🟢 Còn hàng' : '🔴 Hết món'}
                                    </button>
                                  </div>
                                  <h5 className="font-bold text-slate-900 text-xs mt-2">{p.name}</h5>
                                </div>

                                <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                                  <span className="font-extrabold text-blue-600 text-xs">{p.price.toLocaleString('vi-VN')} đ</span>
                                  {isAvail ? (
                                    <button
                                      onClick={() => addToCart(p.id)}
                                      className="py-1 px-3 bg-slate-900 hover:bg-slate-850 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                    >
                                      Thêm lẻ (+1)
                                    </button>
                                  ) : (
                                    <span className="py-1 px-2 text-slate-400 bg-slate-100 text-[10px] font-semibold rounded">Hết hàng</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right: Cashier Receipt Cart */}
                      <div className="md:col-span-5 bg-slate-50 rounded-2xl border border-slate-200 p-4 flex flex-col justify-between min-h-[350px]">
                        <div>
                          <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-3">
                            <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                              <ShoppingBag className="w-4 h-4 text-blue-600" />
                              Giỏ hàng thu ngân siêu thị
                            </span>
                            <button
                              onClick={() => {
                                setSimCarts(prev => ({ ...prev, retail: [] }));
                                triggerBeep(false);
                              }}
                              className="text-[10px] text-red-500 hover:text-red-700 font-semibold"
                            >
                              Xóa hết
                            </button>
                          </div>

                          {(!simCarts.retail || simCarts.retail.length === 0) ? (
                            <div className="py-12 text-center space-y-2">
                              <ScanLine className="w-8 h-8 text-slate-300 mx-auto animate-pulse" />
                              <p className="text-xs text-slate-400">Giỏ hàng siêu thị trống.</p>
                              <p className="text-[10px] text-slate-400">Ấn quét mã vạch ở trên hoặc thêm nhanh!</p>
                            </div>
                          ) : (
                            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                              {simCarts.retail.map((item) => {
                                const prod = simProducts.find(p => p.id === item.productId);
                                if (!prod) return null;
                                return (
                                  <div key={item.productId} className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <h6 className="font-bold text-xs text-slate-900 truncate">{prod.name}</h6>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] font-extrabold text-blue-600">{prod.price.toLocaleString('vi-VN')} đ</span>
                                        <span className="text-[10px] text-slate-400">x {item.quantity}</span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1">
                                      <button 
                                        onClick={() => decreaseCartQuantity(item.productId)}
                                        className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-xs cursor-pointer"
                                      >
                                        -
                                      </button>
                                      <span className="font-mono text-xs font-bold px-1">{item.quantity}</span>
                                      <button 
                                        onClick={() => addToCart(item.productId)}
                                        className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-xs cursor-pointer"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {simCarts.retail && simCarts.retail.length > 0 && (
                          <div className="border-t border-slate-200 pt-3 mt-3 space-y-3">
                            <div className="flex justify-between items-center text-xs text-slate-500">
                              <span>Tạm tính:</span>
                              <span className="font-extrabold text-slate-900 text-sm">
                                {simCarts.retail.reduce((sum, item) => {
                                  const pr = simProducts.find(p => p.id === item.productId)?.price || 0;
                                  return sum + pr * item.quantity;
                                }, 0).toLocaleString('vi-VN')} đ
                              </span>
                            </div>

                            <button
                              onClick={() => checkoutOrder('cash')}
                              className="w-full py-3 bg-slate-900 hover:bg-slate-950 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                            >
                              <Printer className="w-4 h-4" /> Thanh toán hóa đơn (In hóa đơn K80)
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                )}
              </div>

              {/* STATS LOG & SALES HISTORY OVERVIEW */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-blue-600" />
                    <h3 className="text-sm font-bold text-slate-950">Lịch sử giao dịch bán hàng (Firestore Orders collection)</h3>
                  </div>
                  <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-mono font-bold">Offline Persistence Ready</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <th className="py-2.5 px-3">Mã đơn</th>
                        <th className="py-2.5 px-3">Mô hình</th>
                        <th className="py-2.5 px-3">Bàn ăn / Thiết lập</th>
                        <th className="py-2.5 px-3">Chi tiết món</th>
                        <th className="py-2.5 px-3">Tổng cộng</th>
                        <th className="py-2.5 px-3">Thanh toán</th>
                        <th className="py-2.5 px-3">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {simOrders.map((ord) => (
                        <tr key={ord.id} className="hover:bg-slate-50/50">
                          <td className="py-3 px-3 font-mono font-bold text-slate-800">{ord.orderNumber}</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 text-[9px] font-extrabold uppercase rounded ${
                              ord.storeType === 'fnb' ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}>
                              {ord.storeType === 'fnb' ? 'F&B Restaurant' : 'Retail Super'}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-700">{ord.tableNumber || 'Khách vãng lai (Tạp hóa)'}</td>
                          <td className="py-3 px-3 text-slate-500 max-w-[200px] truncate">
                            {ord.items.map(it => `${it.name} (x${it.quantity})`).join(', ')}
                          </td>
                          <td className="py-3 px-3 font-extrabold text-blue-600">{ord.totalAmount.toLocaleString('vi-VN')} đ</td>
                          <td className="py-3 px-3">
                            <span className="uppercase text-[10px] font-extrabold font-mono text-slate-600">
                              💳 {ord.paymentMethod === 'qr' ? 'QR Chuyển khoản' : ord.paymentMethod === 'cash' ? 'Tiền mặt' : 'Thẻ ngân hàng'}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <button
                              onClick={() => { setActiveReceipt(ord); triggerBeep(true); }}
                              className="text-blue-600 hover:text-blue-800 text-[11px] font-bold underline flex items-center gap-1 cursor-pointer"
                            >
                              <Printer className="w-3 h-3" /> Xem mẫu in K80
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* POPUP THERMAL RECEIPT PREVIEW (K80 80mm format) */}
              {activeReceipt && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                  <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4 border border-slate-200 overflow-y-auto max-h-[90vh]"
                  >
                    <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                      <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-400">Xem trước hóa đơn in nhiệt K80</h4>
                      <button 
                        onClick={() => setActiveReceipt(null)}
                        className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Thermal Paper emulation block */}
                    <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl font-mono text-xs text-slate-800 space-y-3 shadow-inner">
                      <div className="text-center space-y-1">
                        <h5 className="font-extrabold text-sm uppercase">CỬA HÀNG MULTI-TENANT POS</h5>
                        <p className="text-[10px] text-slate-500">Mã chi nhánh: STORE-{simSelectedTableId}</p>
                        <p className="text-[10px] text-slate-500">Điện thoại: 1900 xxxx (Hỗ trợ 24/7)</p>
                      </div>

                      <div className="border-t border-dashed border-slate-300 my-2"></div>

                      <div className="space-y-1 text-[11px]">
                        <p>Số Hóa Đơn: <strong>{activeReceipt.orderNumber}</strong></p>
                        <p>Ngày in: {new Date(activeReceipt.createdAt).toLocaleString('vi-VN')}</p>
                        {activeReceipt.tableNumber && (
                          <p>Bàn ăn: <strong className="text-blue-600">{activeReceipt.tableNumber}</strong></p>
                        )}
                        <p>Thu ngân: AI Studio Agent</p>
                        <p>Khách hàng: Khách Vãng Lai</p>
                      </div>

                      <div className="border-t border-dashed border-slate-300 my-2"></div>

                      {/* Items table */}
                      <table className="w-full text-left text-[11px] border-collapse">
                        <thead>
                          <tr className="border-b border-dashed border-slate-300 text-slate-600 font-bold">
                            <th className="pb-1">Món ăn/Sản phẩm</th>
                            <th className="pb-1 text-center">SL</th>
                            <th className="pb-1 text-right">Đ.Giá</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeReceipt.items.map((it: any, idx: number) => (
                            <tr key={idx}>
                              <td className="py-1">{it.name}</td>
                              <td className="py-1 text-center">{it.quantity}</td>
                              <td className="py-1 text-right">{(it.price).toLocaleString('vi-VN')} đ</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="border-t border-dashed border-slate-300 my-2"></div>

                      <div className="space-y-1 text-[11px] font-bold">
                        <div className="flex justify-between">
                          <span>TỔNG CỘNG:</span>
                          <span className="text-sm font-black text-blue-600">{activeReceipt.totalAmount.toLocaleString('vi-VN')} đ</span>
                        </div>
                        <div className="flex justify-between font-normal text-slate-500 text-[10px]">
                          <span>Thanh toán bằng:</span>
                          <span className="uppercase">💳 {activeReceipt.paymentMethod === 'qr' ? 'Chuyển khoản QR' : 'Tiền mặt'}</span>
                        </div>
                      </div>

                      <div className="border-t border-dashed border-slate-300 my-3"></div>

                      <div className="text-center space-y-1">
                        <p className="text-[10px] font-bold">CẢM ƠN QUÝ KHÁCH & HẸN GẶP LẠI!</p>
                        <p className="text-[9px] text-slate-400">Thiết kế bởi AI Coding Agent cho thiết bị in nhiệt khổ 80mm</p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          alert("Đang thực hiện lệnh gửi in tới cổng máy in nhiệt USB/Bluetooth...");
                        }}
                        className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-blue-100"
                      >
                        <Printer className="w-4 h-4" /> Gửi lệnh in (K80)
                      </button>
                      <button
                        onClick={() => setActiveReceipt(null)}
                        className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                      >
                        Đóng
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}

            </motion.div>
          )}

          {/* Tab Content 1: Project Structure */}
          {activeTab === 'structure' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-6 space-y-6"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-950 flex items-center gap-2">
                    <FolderOpen className="text-blue-600 w-5 h-5" />
                    Cấu trúc thư mục dự án
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">Cấu trúc thư mục mô-đun hóa, phân tách rõ ràng trách nhiệm của từng cấu phần.</p>
                </div>
                <div className="text-xs text-slate-400 font-mono">MVP Phase 1 ready</div>
              </div>

              {/* Explanatory notes about files already created */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50/40 rounded-xl border border-blue-100 space-y-1">
                  <div className="flex items-center gap-2 text-blue-600 font-bold text-sm">
                    <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                    src/types.ts (ĐÃ TẠO & CẬP NHẬT)
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Chứa toàn bộ Interfaces của mô hình dữ liệu: <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded text-[11px]">UserProfile</code>, <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded text-[11px]">Store</code>, <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded text-[11px]">Product</code>, <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded text-[11px]">InventoryBatch</code>, <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded text-[11px]">Order</code>, <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded text-[11px]">Supplier</code>, <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded text-[11px]">InventoryTransaction</code>, <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded text-[11px]">Customer</code>, <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded text-[11px]">DiningTable</code> và <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded text-[11px]">KitchenItem</code>.
                  </p>
                </div>

                <div className="p-4 bg-blue-50/40 rounded-xl border border-blue-100 space-y-1">
                  <div className="flex items-center gap-2 text-blue-600 font-bold text-sm">
                    <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                    firebase-blueprint.json (ĐÃ TẠO & CẬP NHẬT)
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Bản đặc tả cấu trúc cơ sở dữ liệu Firestore (Intermediate Representation) dùng để AI Studio tự động tạo mã nguồn đồng bộ và phục vụ cho việc tạo Firebase Security Rules.
                  </p>
                </div>
              </div>

              {/* File Explorer Tree view */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 overflow-x-auto text-white">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-3 text-xs text-slate-400 font-mono">
                  <Terminal className="w-3.5 h-3.5 text-slate-300" />
                  <span>PROJECT FILES EXPLORER</span>
                </div>
                {renderTree(projectTree)}
              </div>
            </motion.div>
          )}

          {/* Tab Content 2: Firestore Database Schema */}
          {activeTab === 'database' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-6 space-y-6"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-950 flex items-center gap-2">
                    <Database className="text-blue-600 w-5 h-5" />
                    Database JSON Model (Schema) & Security Rules
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">Hệ thống phân chia theo root collection stores để cô lập dữ liệu tuyệt đối giữa các cửa hàng.</p>
                </div>
              </div>

              {/* Entity Selection Buttons */}
              <div className="flex flex-wrap gap-2">
                {Object.keys(databaseModels).map((key) => (
                  <button
                    key={key}
                    onClick={() => setSelectedEntity(key)}
                    className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all border ${
                      selectedEntity === key 
                        ? 'bg-blue-600 text-white border-blue-500 font-extrabold shadow-md' 
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {key === 'User' && '1. Users (Tài khoản)'}
                    {key === 'Store' && '2. Stores (Cửa hàng)'}
                    {key === 'Product' && '3. Products (Sản phẩm)'}
                    {key === 'InventoryBatch' && '4. Batches (Lô hàng)'}
                    {key === 'Order' && '5. Orders (Hóa đơn)'}
                    {key === 'Supplier' && '6. Suppliers (Nhà cung cấp)'}
                    {key === 'InventoryTransaction' && '7. Inventory Trans (Xuất/Nhập kho)'}
                    {key === 'Customer' && '8. Customers (Khách hàng)'}
                    {key === 'DiningTable' && '9. Tables (Sơ đồ bàn FNB)'}
                    {key === 'KitchenItem' && '10. Kitchen Queue (Bếp FNB)'}
                  </button>
                ))}
              </div>

              {/* Entity Detail Viewer */}
              {Object.entries(databaseModels).map(([key, data]) => {
                if (selectedEntity !== key) return null;
                return (
                  <div key={key} className="space-y-6 animate-fadeIn">
                    
                    {/* Collection Header */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold font-mono tracking-wide text-slate-500">FIRESTORE PATH COLLECTION:</span>
                        <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 font-mono rounded border border-blue-200 font-bold">
                          {data.collection}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed font-sans pt-1">
                        {data.description}
                      </p>
                    </div>

                    {/* Table Field Spec */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <Code className="w-4 h-4 text-blue-600" />
                        Danh sách thuộc tính (Fields)
                      </h3>
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                              <th className="py-3 px-4">Tên trường (Field)</th>
                              <th className="py-3 px-4">Kiểu dữ liệu</th>
                              <th className="py-3 px-4">Ý nghĩa & Ghi chú</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {data.fields.map((field, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="py-3 px-4 font-mono font-bold text-blue-600">{field.name}</td>
                                <td className="py-3 px-4 font-mono text-slate-700">{field.type}</td>
                                <td className="py-3 px-4 text-slate-600 font-sans">{field.desc}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Security Rules for this Entity */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <Lock className="w-4 h-4 text-orange-500" />
                        Firebase Security Rules (Đặc tả quyền)
                      </h3>
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 relative">
                        <div className="absolute top-3 right-3 text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                          Firestore Rules
                        </div>
                        <pre className="overflow-x-auto whitespace-pre-wrap leading-relaxed">
                          {data.securityRule}
                        </pre>
                      </div>
                    </div>

                  </div>
                );
              })}
            </motion.div>
          )}

          {/* Tab Content 3: Architecture Overview */}
          {activeTab === 'architecture' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6"
            >
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-xl font-bold text-slate-950 flex items-center gap-2">
                  <Server className="text-blue-600 w-5 h-5" />
                  Giải pháp kiến trúc cho MVP Phase 1
                </h2>
                <p className="text-xs text-slate-500 mt-1">Phân tích chuyên sâu ba tính năng cốt lõi do bạn yêu cầu.</p>
              </div>

              <div className="space-y-6">
                
                {/* Feature 1 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 bg-slate-50 border border-slate-200 w-12 h-12 rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <h3 className="text-sm font-bold text-slate-900">1. Định danh & Phân quyền cửa hàng (Multi-Tenant)</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Dữ liệu được cách ly hoàn toàn ở cấp độ Firestore. Khi người dùng đăng nhập bằng Google/Email Auth, 
                      profile trong <code className="bg-slate-100 text-blue-600 px-1 rounded text-[11px]">/users/&#123;uid&#125;</code> sẽ được lấy ra để lưu 
                      <code className="bg-slate-100 text-blue-600 px-1 rounded text-[11px]">storeId</code> vào bộ nhớ cục bộ. 
                      Mọi Query/Write tới Firestore sau đó sẽ bắt buộc đi kèm với prefix <code className="bg-slate-100 text-blue-600 px-1 rounded text-[11px]">/stores/&#123;storeId&#125;/...</code>. 
                      Security Rules chặn hoàn toàn trường hợp user cố gắng đọc ghi dữ liệu của storeId khác.
                    </p>
                  </div>
                </div>

                {/* Feature 2 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 bg-slate-50 border border-slate-200 w-12 h-12 rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
                    <ScanLine className="w-5 h-5" />
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <h3 className="text-sm font-bold text-slate-900">2. Máy quét mã vạch & Lô sản phẩm (QR Protocol)</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Trình lắng nghe sự kiện <code className="bg-slate-100 text-blue-600 px-1 rounded text-[11px]">keypress</code> toàn cục sẽ bắt chuỗi nhập từ máy quét phần cứng 
                      (vốn giả lập bàn phím). Khi nhận dạng được cấu trúc đặc biệt <code className="bg-slate-100 text-slate-700 px-1 rounded text-[11px]">[Mã SP]|[Mã Lô]|[HSD]</code> kết thúc bằng phím Enter, 
                      thuật toán sẽ bóc tách:
                    </p>
                    <ul className="list-disc pl-5 text-xs text-slate-600 space-y-1">
                      <li><strong>Mã sản phẩm (SKU)</strong>: Truy vấn tức thì trong kho và thêm vào giỏ.</li>
                      <li><strong>Mã Lô & HSD</strong>: Chọn chính xác lô hàng tương ứng để trừ số lượng thực tế khi thanh toán.</li>
                      <li>Có cơ chế phát âm thanh <strong>BEEP</strong> thành công hoặc thất bại bằng Web Audio API không cần file âm thanh ngoài.</li>
                    </ul>
                  </div>
                </div>

                {/* Feature 3 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 bg-slate-50 border border-slate-200 w-12 h-12 rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <h3 className="text-sm font-bold text-slate-900">3. In hóa đơn nhiệt Thermal Print (80mm)</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Khi bấm nút thanh toán, một khối HTML hóa đơn được tối ưu hóa cho in ấn sẽ được render ẩn trong DOM. 
                      Sử dụng CSS `@media print` đặc thù:
                    </p>
                    <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-300">
                      @media print &#123;
                      <br />&nbsp;&nbsp;body * &#123; visibility: hidden; &#125;
                      <br />&nbsp;&nbsp;#thermal-receipt, #thermal-receipt * &#123; visibility: visible; &#125;
                      <br />&nbsp;&nbsp;#thermal-receipt &#123; position: absolute; left: 0; top: 0; width: 80mm; &#125;
                      <br />&nbsp;&nbsp;@page &#123; size: 80mm auto; margin: 0; &#125;
                      <br />&#125;
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Lệnh in <code className="bg-slate-100 text-blue-600 px-1 rounded text-[11px]">window.print()</code> nội bộ sẽ được gọi để in ra hóa đơn sắc nét trên máy in nhiệt (K80).
                    </p>
                  </div>
                </div>

              </div>
            </motion.div>
          )}

        </div>

        {/* Right Column - System Orchestrator Panel */}
        <div className="space-y-6">
          
          {/* Dynamic Firebase Multi-tenant Integration Panel */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 relative overflow-hidden space-y-4 shadow-md">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl pointer-events-none"></div>
            
            {authLoading ? (
              <div className="py-12 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
                <p className="text-sm font-semibold text-slate-700">Đang đồng bộ dữ liệu đám mây...</p>
                <p className="text-xs text-slate-400">Vui lòng chờ giây lát</p>
              </div>
            ) : fbUser ? (
              // Case: Logged In (Live Cloud Mode)
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2">
                    <div className="bg-emerald-500/10 text-emerald-600 p-2 rounded-xl border border-emerald-500/20">
                      <Cloud className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider block">CLOUD CONNECTED</span>
                      <h3 className="text-sm font-extrabold text-slate-900 truncate max-w-[180px]">
                        {fbStoreProfile?.name || "Cửa hàng đám mây"}
                      </h3>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleFirebaseLogout}
                    className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer border border-rose-200 transition-colors"
                    title="Đăng xuất khỏi đám mây"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Tenant Info Specs */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5 text-xs">
                  <div className="flex justify-between items-start">
                    <span className="text-slate-400 font-medium">Tenant ID:</span>
                    <span className="font-mono font-bold text-slate-700 select-all truncate max-w-[140px]" title={fbUserProfile?.storeId}>
                      {fbUserProfile?.storeId}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-medium">Mô hình:</span>
                    <span className="font-bold text-blue-600 uppercase">
                      {simStoreType === 'fnb' ? "🍔 F&B Cafe/Nhà hàng" : "🛍️ Bán lẻ/Siêu thị"}
                    </span>
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-slate-400 font-medium">Địa chỉ:</span>
                    <span className="text-right text-slate-700 font-semibold truncate max-w-[150px]" title={fbStoreProfile?.address}>
                      {fbStoreProfile?.address}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-medium">Điện thoại:</span>
                    <span className="font-semibold text-slate-700">{fbStoreProfile?.phone}</span>
                  </div>
                </div>

                {/* User Identity specs */}
                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Nhân viên trực ban</p>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs uppercase">
                      {fbUserProfile?.name?.charAt(0) || "U"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{fbUserProfile?.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{fbUser.email}</p>
                    </div>
                  </div>
                </div>

                {/* Live Auth User Role Switcher - Client Simulator Override */}
                <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 space-y-2">
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Bộ lọc quyền giả lập đám mây:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => { setSimUserRole('admin'); triggerBeep(true); }}
                      className={`py-1.5 px-2.5 rounded-lg font-bold text-xs transition-all ${
                        simUserRole === 'admin' 
                          ? 'bg-amber-600 text-white shadow-sm' 
                          : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-600'
                      }`}
                    >
                      🔑 Admin
                    </button>
                    <button
                      onClick={() => { setSimUserRole('staff'); triggerBeep(true); }}
                      className={`py-1.5 px-2.5 rounded-lg font-bold text-xs transition-all ${
                        simUserRole === 'staff' 
                          ? 'bg-slate-700 text-white shadow-sm' 
                          : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-600'
                      }`}
                    >
                      🧑 Nhân viên
                    </button>
                  </div>
                  <p className="text-[9px] text-amber-600 leading-normal">
                    * Quyền Admin được phép thêm/xóa/co giãn bàn, chỉnh sửa sơ đồ. Quyền Nhân viên chỉ được xem và order món ăn.
                  </p>
                </div>

                {/* Real-time stats badges */}
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-2">Thống kê đồng bộ Live</span>
                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="block font-black text-blue-600 text-sm">{simTables.length}</span>
                      <span className="text-[9px] text-slate-400">Bàn ăn</span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="block font-black text-indigo-600 text-sm">{simProducts.length}</span>
                      <span className="text-[9px] text-slate-400">Sản phẩm</span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="block font-black text-emerald-600 text-sm">{simOrders.length}</span>
                      <span className="text-[9px] text-slate-400">Đơn hàng</span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="block font-black text-orange-600 text-sm">{simKitchenItems.length}</span>
                      <span className="text-[9px] text-slate-400">Hàng đợi bếp</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <LoginScreen
                fbUser={fbUser}
                fbUserProfile={fbUserProfile}
                fbStoreProfile={fbStoreProfile}
                authLoading={authLoading}
                authError={authError}
                isDemoOfflineMode={isDemoOfflineMode}
                setIsDemoOfflineMode={setIsDemoOfflineMode}
                onOpenDemoExplanation={() => {}}
                onLogin={async (e, email, pass) => {
                  return handleFirebaseLogin(e, email, pass);
                }}
                onRegister={async (e, email, pass, name, storeName, storeType, phone, address) => {
                  return handleFirebaseRegister(e, email, pass, name, storeName, storeType, phone, address);
                }}
                onLogout={handleFirebaseLogout}
                onDemoLogin={(userName, storeId, storeType, storeName) => {
                  setSimStoreType(storeType);
                  setIsDemoOfflineMode(true);
                  triggerBeep(true);
                }}
                triggerBeep={triggerBeep}
              />
            )}
          </div>

          {/* Quick Technical Specs Summary */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-950 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Terminal className="w-4 h-4 text-blue-600" />
              Thông số kỹ thuật MVP
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Framework</span>
                <span className="font-semibold text-slate-800">React 19 + TypeScript</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Styling Engine</span>
                <span className="font-semibold text-blue-600">Tailwind CSS v4</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Offline Persistence</span>
                <span className="font-semibold text-slate-800">Firestore Offline (IndexedDB)</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Mã Lô & HSD</span>
                <span className="font-semibold text-slate-800">FIFO Inventory Batches</span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-slate-500">Giao thức Quét</span>
                <span className="font-semibold text-slate-800">Global Event [SKU]|[Lô]|[HSD]</span>
              </div>
            </div>
          </div>

        </div>

      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 py-6 mt-12 text-center text-xs">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p>Hệ thống POS Multi-Tenant MVP © 2026. Xây dựng bởi AI Coding Agent.</p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-slate-300 font-mono text-[11px]">Ready for user feedback.</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
