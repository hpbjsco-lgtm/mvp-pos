/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AUTH_CONFIG } from './authConfig';
import React, { useState, useEffect, useRef } from 'react';
import { 
  ShoppingBag, 
  Layers, 
  TrendingUp, 
  Cloud, 
  User, 
  LogOut, 
  Store, 
  ChevronRight, 
  ChevronDown,
  Info,
  Coffee,
  Check,
  X,
  XCircle,
  Plus,
  AlertTriangle,
  ShieldAlert,
  MapPin,
  Phone,
  BarChart2,
  Lock,
  Cpu,
  UserCheck,
  Settings,
  HelpCircle,
  Clock,
  Wifi,
  WifiOff,
  UserCircle,
  ChefHat,
  ClipboardList,
  Users,
  Briefcase,
  Truck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from './firebase';
import KitchenDisplay from './components/KitchenDisplay';
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
  onSnapshot, 
  writeBatch,
  updateDoc
} from 'firebase/firestore';

// Clean screen imports
import LoginScreen from './components/LoginScreen';
import POSScreen from './components/POSScreen';
import InventoryScreen from './components/InventoryScreen';
import ReportsSection from './components/ReportsSection';
import MenuManagement from './components/MenuManagement';
import TableMap from './components/TableMap';
import CustomersSection from './components/CustomersSection';
import EmployeesSection from './components/EmployeesSection';
import SuppliersSection from './components/SuppliersSection';
import DemoApp from './demo';
import SysAdminDashboard from './components/SysAdminDashboard';
import { setLogContext, logOperation } from './utils/logger';

import { getFromCache, saveToCache, syncOfflineOperations, queueOfflineOperation } from './utils/offlineManager';

export default function App() {
  const [activeScreen, setActiveScreen] = useState<'pos' | 'inventory' | 'reports' | 'account' | 'kitchen' | 'menu' | 'tables' | 'customers' | 'employees' | 'suppliers' | 'sysadmin'>('reports');
  const [showProjectDemo, setShowProjectDemo] = useState<boolean>(false);
  
  // --- CORE DATA & REALTIME SYNC STATES ---
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [demoSession, setDemoSession] = useState<{
    userName: string;
    storeId: string;
    storeType: 'fnb' | 'retail';
    storeName: string;
  } | null>(null);

  // Load initial state from cache or fallback JSON
  const [simCustomers, setSimCustomers] = useState<any[]>(() => getFromCache('Sandbox', 'simCustomers'));
  const [simSuppliers, setSimSuppliers] = useState<any[]>(() => getFromCache('Sandbox', 'simSuppliers'));
  const [simEmployees, setSimEmployees] = useState<any[]>(() => getFromCache('Sandbox', 'simEmployees'));
  const [simAttendance, setSimAttendance] = useState<any[]>(() => getFromCache('Sandbox', 'simAttendance'));

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
  const [authError, setAuthError] = useState<string>('');
  const [isDemoOfflineMode, setIsDemoOfflineMode] = useState<boolean>(true);

  const [simStoreType, setSimStoreType] = useState<'fnb' | 'retail'>('fnb');
  const [simSelectedTableId, setSimSelectedTableId] = useState<string>('T1');
  const [simUserRole, setSimUserRole] = useState<'admin' | 'staff'>('admin');
  
  // Audio-visual alert state (beep simulator triggers)
  const [simSuccessBeep, setSimSuccessBeep] = useState<boolean>(false);
  const [simErrorBeep, setSimErrorBeep] = useState<boolean>(false);

  // Hardcoded Auth from config
  const HARDCODED_EMAIL = AUTH_CONFIG.EMAIL;

  // Default Offline / Demo States
  const [simZones, setSimZones] = useState(() => getFromCache('Sandbox', 'simZones'));
  const [simTables, setSimTables] = useState(() => getFromCache('Sandbox', 'simTables'));
  const [simProducts, setSimProducts] = useState(() => getFromCache('Sandbox', 'simProducts'));
  const [simKitchenItems, setSimKitchenItems] = useState(() => getFromCache('Sandbox', 'simKitchenItems'));
  const [simCarts, setSimCarts] = useState<Record<string, Array<{ productId: string; quantity: number; note: string }>>>(() => getFromCache('Sandbox', 'simCarts'));
  const [simOrders, setSimOrders] = useState<any[]>(() => getFromCache('Sandbox', 'simOrders'));
  const [simBatches, setSimBatches] = useState<any[]>(() => getFromCache('Sandbox', 'simBatches'));
  const [simTransactions, setSimTransactions] = useState<any[]>(() => getFromCache('Sandbox', 'simTransactions'));

  // --- F&B RAW MATERIALS INVENTORY DATA ---
  const [simIngredients, setSimIngredients] = useState<any[]>(() => getFromCache('Sandbox', 'simIngredients'));
  const [simIngredientBatches, setSimIngredientBatches] = useState<any[]>(() => getFromCache('Sandbox', 'simIngredientBatches'));
  const [simIngredientTransactions, setSimIngredientTransactions] = useState<any[]>(() => getFromCache('Sandbox', 'simIngredientTransactions'));

  // Sidebar collapsibility state
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

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

  // --- FIREBASE AUTHENTICATION EFFECT ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthLoading(true);
      
      if (user) {
        setFbUser(user);
        setIsDemoOfflineMode(false);
        try {
          const userDocSnap = await getDoc(doc(db, 'users', user.uid));
          if (userDocSnap.exists()) {
            let uprof = userDocSnap.data() as any;
            setFbUserProfile(uprof);
            
            // Logic to determine role/screen
            if (uprof.role !== 'sysadmin' && user.email?.toLowerCase() === AUTH_CONFIG.EMAIL.toLowerCase()) {
              await updateDoc(doc(db, 'users', user.uid), { role: 'sysadmin' });
              uprof = { ...uprof, role: 'sysadmin' };
              setFbUserProfile(uprof);
            }

            const isCurrentUserSysAdmin = uprof.role === 'sysadmin' && user.email?.toLowerCase() === AUTH_CONFIG.EMAIL.toLowerCase();

            if (isCurrentUserSysAdmin) {
              setSimUserRole('admin');
              setFbStoreProfile(null);
              setActiveScreen('reports');
            } else {
              setSimUserRole((uprof.role === 'owner' || uprof.role === 'manager') ? 'admin' : 'staff');
              if (uprof.storeId) {
                const storeDocSnap = await getDoc(doc(db, 'stores', uprof.storeId));
                if (storeDocSnap.exists()) {
                  const storeData = storeDocSnap.data() as any;
                  setFbStoreProfile(storeData);
                  setSimStoreType(storeData.storeType || 'fnb');
                }
              }
              if (uprof.role === 'staff') {
                setActiveScreen('pos');
              } else {
                setActiveScreen('reports');
              }
            }
          } else {
            // Profile doesn't exist yet!
            if (user.email?.toLowerCase() === AUTH_CONFIG.EMAIL.toLowerCase()) {
              const adminProfile = {
                uid: user.uid,
                email: user.email,
                role: 'sysadmin',
                name: 'Quản Trị Hệ Thống',
                createdAt: new Date().toISOString()
              };
              await setDoc(doc(db, 'users', user.uid), adminProfile);
              setFbUserProfile(adminProfile);
              setSimUserRole('admin');
              setFbStoreProfile(null);
              setActiveScreen('reports');
            } else {
              const defaultProfile = {
                uid: user.uid,
                email: user.email,
                role: 'owner',
                name: user.displayName || 'Chủ Cửa Hàng',
                createdAt: new Date().toISOString()
              };
              await setDoc(doc(db, 'users', user.uid), defaultProfile);
              setFbUserProfile(defaultProfile);
              setSimUserRole('admin');
              setActiveScreen('reports');
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

  // --- LOG CONTEXT SYNC EFFECT ---
  useEffect(() => {
    if (fbUser && fbUserProfile) {
      setLogContext({
        userId: fbUser.uid,
        userName: fbUserProfile.name || 'User',
        storeId: fbUserProfile.storeId || 'Sandbox',
        isOffline: isDemoOfflineMode
      });
    } else if (demoSession) {
      setLogContext({
        userId: 'demo-uid',
        userName: demoSession.userName || 'Demo Worker',
        storeId: demoSession.storeId || 'Sandbox',
        isOffline: isDemoOfflineMode
      });
    } else {
      setLogContext({
        userId: 'unknown_user',
        userName: 'Khách vãng lai / Hệ thống',
        storeId: 'Sandbox',
        isOffline: true
      });
    }
  }, [fbUser, fbUserProfile, demoSession, isDemoOfflineMode]);

  // --- REAL-TIME DATA SYNCHRONIZATION EFFECT ---
  useEffect(() => {
    if (isDemoOfflineMode || !fbUserProfile?.storeId) return;

    const storeId = fbUserProfile.storeId;
    console.log("Khởi chạy đồng bộ hóa Firestore Real-time cho Cửa hàng: ", storeId);

    // Listen to Zones
    const unsubscribeZones = onSnapshot(collection(db, 'stores', storeId, 'zones'), (snapshot) => {
      const zonesData: any[] = [];
      snapshot.forEach((doc) => {
        zonesData.push({ id: doc.id, ...doc.data() });
      });
      setSimZones(zonesData);
      saveToCache(storeId, 'simZones', zonesData);
    });

    // Listen to Tables
    const unsubscribeTables = onSnapshot(collection(db, 'stores', storeId, 'tables'), (snapshot) => {
      const tablesData: any[] = [];
      snapshot.forEach((doc) => {
        tablesData.push({ id: doc.id, ...doc.data() });
      });
      tablesData.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      setSimTables(tablesData);
      saveToCache(storeId, 'simTables', tablesData);
    });

    // Listen to Products
    const unsubscribeProducts = onSnapshot(collection(db, 'stores', storeId, 'products'), (snapshot) => {
      const productsData: any[] = [];
      snapshot.forEach((doc) => {
        productsData.push({ id: doc.id, ...doc.data() });
      });
      setSimProducts(productsData);
      saveToCache(storeId, 'simProducts', productsData);
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
      saveToCache(storeId, 'simKitchenItems', kitchenData);
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
      saveToCache(storeId, 'simOrders', ordersData);
    });

    // Listen to Batches (Inventory Batches)
    const unsubscribeBatches = onSnapshot(collection(db, 'stores', storeId, 'batches'), (snapshot) => {
      const batchesData: any[] = [];
      snapshot.forEach((doc) => {
        batchesData.push({ id: doc.id, ...doc.data() });
      });
      if (simStoreType === 'fnb') {
        setSimIngredientBatches(batchesData);
        saveToCache(storeId, 'simIngredientBatches', batchesData);
      } else {
        setSimBatches(batchesData);
        saveToCache(storeId, 'simBatches', batchesData);
      }
    });

    // Listen to Transactions
    const unsubscribeTransactions = onSnapshot(collection(db, 'stores', storeId, 'transactions'), (snapshot) => {
      const transactionsData: any[] = [];
      snapshot.forEach((doc) => {
        transactionsData.push({ id: doc.id, ...doc.data() });
      });
      transactionsData.sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dbVal = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dbVal - da;
      });
      if (simStoreType === 'fnb') {
        setSimIngredientTransactions(transactionsData);
        saveToCache(storeId, 'simIngredientTransactions', transactionsData);
      } else {
        setSimTransactions(transactionsData);
        saveToCache(storeId, 'simTransactions', transactionsData);
      }
    });

    // Listen to Ingredients (only for F&B)
    let unsubscribeIngredients = () => {};
    if (simStoreType === 'fnb') {
      unsubscribeIngredients = onSnapshot(collection(db, 'stores', storeId, 'ingredients'), (snapshot) => {
        const ingredientsData: any[] = [];
        snapshot.forEach((doc) => {
          ingredientsData.push({ id: doc.id, ...doc.data() });
        });
        setSimIngredients(ingredientsData);
        saveToCache(storeId, 'simIngredients', ingredientsData);
      });
    }

    return () => {
      unsubscribeZones();
      unsubscribeTables();
      unsubscribeProducts();
      unsubscribeKitchen();
      unsubscribeOrders();
      unsubscribeBatches();
      unsubscribeTransactions();
      unsubscribeIngredients();
    };
  }, [isDemoOfflineMode, fbUserProfile?.storeId, simStoreType]);

  // --- OFFLINE AUTO-PERSIST EFFECT (WHEN OFFLINE) ---
  useEffect(() => {
    if (!isDemoOfflineMode) return;
    const sId = fbUserProfile?.storeId || demoSession?.storeId || 'Sandbox';
    
    saveToCache(sId, 'simCustomers', simCustomers);
    saveToCache(sId, 'simSuppliers', simSuppliers);
    saveToCache(sId, 'simEmployees', simEmployees);
    saveToCache(sId, 'simAttendance', simAttendance);
    saveToCache(sId, 'simZones', simZones);
    saveToCache(sId, 'simTables', simTables);
    saveToCache(sId, 'simProducts', simProducts);
    saveToCache(sId, 'simKitchenItems', simKitchenItems);
    saveToCache(sId, 'simCarts', simCarts);
    saveToCache(sId, 'simOrders', simOrders);
    saveToCache(sId, 'simBatches', simBatches);
    saveToCache(sId, 'simTransactions', simTransactions);
    saveToCache(sId, 'simIngredients', simIngredients);
    saveToCache(sId, 'simIngredientBatches', simIngredientBatches);
    saveToCache(sId, 'simIngredientTransactions', simIngredientTransactions);
  }, [
    isDemoOfflineMode,
    fbUserProfile?.storeId,
    demoSession?.storeId,
    simCustomers,
    simSuppliers,
    simEmployees,
    simAttendance,
    simZones,
    simTables,
    simProducts,
    simKitchenItems,
    simCarts,
    simOrders,
    simBatches,
    simTransactions,
    simIngredients,
    simIngredientBatches,
    simIngredientTransactions
  ]);

  // --- STORE-CHANGE CACHE LOADING & SYNC EFFECT ---
  useEffect(() => {
    const sId = fbUserProfile?.storeId || demoSession?.storeId || 'Sandbox';
    
    setSimCustomers(getFromCache(sId, 'simCustomers'));
    setSimSuppliers(getFromCache(sId, 'simSuppliers'));
    setSimEmployees(getFromCache(sId, 'simEmployees'));
    setSimAttendance(getFromCache(sId, 'simAttendance'));
    setSimZones(getFromCache(sId, 'simZones'));
    setSimTables(getFromCache(sId, 'simTables'));
    setSimProducts(getFromCache(sId, 'simProducts'));
    setSimKitchenItems(getFromCache(sId, 'simKitchenItems'));
    setSimCarts(getFromCache(sId, 'simCarts'));
    setSimOrders(getFromCache(sId, 'simOrders'));
    setSimBatches(getFromCache(sId, 'simBatches'));
    setSimTransactions(getFromCache(sId, 'simTransactions'));
    setSimIngredients(getFromCache(sId, 'simIngredients'));
    setSimIngredientBatches(getFromCache(sId, 'simIngredientBatches'));
    setSimIngredientTransactions(getFromCache(sId, 'simIngredientTransactions'));

    // Trigger sync when going online
    if (!isDemoOfflineMode && sId !== 'Sandbox') {
      console.log(`[SYNC MANAGER] Switching to online mode. Syncing queued offline writes for: ${sId}`);
      syncOfflineOperations(sId).then((synced) => {
        if (synced) {
          triggerBeep(true);
        }
      });
    }
  }, [fbUserProfile?.storeId, demoSession?.storeId, isDemoOfflineMode]);

  // Seed Data function for freshly registered stores
  const seedStoreData = async (storeId: string, storeType: 'fnb' | 'retail'): Promise<boolean> => {
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

        const defaultIngredients = [
          { id: 'I1', sku: 'RAW-001', name: 'Hạt Cà Phê Robusta Măng Đen', price: 0, cost: 120000, category: 'Đồ uống', isAvailable: true, createdAt: new Date().toISOString() },
          { id: 'I2', sku: 'RAW-002', name: 'Sữa Đặc Có Đường Ông Thọ', price: 0, cost: 22000, category: 'Đồ uống', isAvailable: true, createdAt: new Date().toISOString() },
          { id: 'I3', sku: 'RAW-003', name: 'Trà Đen Phúc Long Cao Cấp', price: 0, cost: 140000, category: 'Đồ uống', isAvailable: true, createdAt: new Date().toISOString() },
          { id: 'I4', sku: 'RAW-004', name: 'Thịt Bò Thượng Hạng Mỹ', price: 0, cost: 320000, category: 'Món ăn', isAvailable: true, createdAt: new Date().toISOString() },
          { id: 'I5', sku: 'RAW-005', name: 'Bánh Phở Tươi Trong Ngày', price: 0, cost: 15000, category: 'Món ăn', isAvailable: true, createdAt: new Date().toISOString() },
          { id: 'I6', sku: 'RAW-006', name: 'Bơ Lạt Anchor Nhập Khẩu', price: 0, cost: 240000, category: 'Món ăn', isAvailable: true, createdAt: new Date().toISOString() },
          { id: 'I7', sku: 'RAW-007', name: 'Cam Sành Hàm Yên Hữu Cơ', price: 0, cost: 30000, category: 'Khác', isAvailable: true, createdAt: new Date().toISOString() },
          { id: 'I8', sku: 'RAW-008', name: 'Đá Viên Tinh Khiết (Bao 10kg)', price: 0, cost: 12000, category: 'Khác', isAvailable: true, createdAt: new Date().toISOString() }
        ];
        defaultIngredients.forEach(i => {
          batch.set(doc(db, 'stores', storeId, 'ingredients', i.id), { ...i });
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
      console.log("Seeding dữ liệu thành công!");
      return true;
    } catch (err) {
      console.error("Lỗi seeding dữ liệu: ", err);
      return false;
    }
  };

  // Auth helper callbacks passed to login screen
  const handleFirebaseLogin = async (e?: React.FormEvent, overrideEmail?: string, overridePass?: string) => {
    if (e) e.preventDefault();
    const email = overrideEmail?.trim().toLowerCase();
    const pass = overridePass;
    if (!email || !pass) {
      setAuthError("Vui lòng điền đầy đủ email và mật khẩu.");
      return;
    }
    setAuthError("");
    try {
      if (email === AUTH_CONFIG.EMAIL.toLowerCase() && pass === AUTH_CONFIG.PASS) {
        try {
          await signInWithEmailAndPassword(auth, email, pass);
        } catch (signInErr: any) {
          if (signInErr.code === 'auth/user-not-found') {
            console.log("Tài khoản chưa tồn tại, đang tự động tạo...");
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            const uid = userCredential.user.uid;
            await setDoc(doc(db, 'users', uid), {
              uid: uid,
              email: email,
              role: 'sysadmin',
              name: 'Quản Trị Hệ Thống',
              createdAt: new Date().toISOString()
            });
            await signInWithEmailAndPassword(auth, email, pass);
          } else {
            throw signInErr; // Re-throw other errors (wrong password etc)
          }
        }
      } else {
        await signInWithEmailAndPassword(auth, email, pass);
      }
      triggerBeep(true);
    } catch (err: any) {
      console.error(err);
      setAuthError("Đăng nhập thất bại: " + (err.message || "Kiểm tra lại tài khoản."));
      triggerBeep(false);
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
    const email = overrideEmail?.trim().toLowerCase();
    const pass = overridePass;
    const name = overrideName;
    const storeName = overrideStoreName;
    const storeType = overrideStoreType || 'fnb';
    const phone = overridePhone;
    const address = overrideAddress;

    if (!email || !pass || !name || !storeName || !phone || !address) {
      setAuthError("Vui lòng điền đầy đủ tất cả các trường thông tin.");
      return;
    }
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
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      // Seed default data for the registered store so they have products, zones, tables immediately!
      await seedStoreData(storeId, storeType);

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
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      setFbUser(userCredential.user);
      setFbUserProfile(uprof);
      setFbStoreProfile(sprof);
      setSimStoreType(storeType);
      setSimUserRole('admin');
      setIsDemoOfflineMode(false);

      triggerBeep(true);
      alert("Đăng ký thành công! Cửa hàng " + storeName + " đang chờ ban quản trị phê duyệt để kích hoạt.");
    } catch (err: any) {
      console.error(err);
      setAuthError("Đăng ký thất bại: " + (err.message || "Đã xảy ra lỗi hệ thống."));
      triggerBeep(false);
    }
  };

  const handleFirebaseLogout = async () => {
    try {
      await signOut(auth);
      setFbUser(null);
      setFbUserProfile(null);
      setFbStoreProfile(null);
      setIsDemoOfflineMode(true);
      setActiveScreen('pos');
      triggerBeep(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCheckIn = async (userId: string, userName: string) => {
    const todayStr = new Date().toLocaleDateString('sv-SE');
    const attId = `att-${userId}-${todayStr}`;
    const checkInTime = new Date().toISOString();
    const storeId = fbUserProfile?.storeId || demoSession?.storeId || 'Sandbox';
    
    const newAttendance = {
      id: attId,
      storeId,
      userId,
      userName,
      date: todayStr,
      checkIn: checkInTime,
      checkOut: null,
      hoursWorked: 0,
      hourlyRate: 25000,
      dailyWage: 0,
      status: 'working' as const
    };

    try {
      logOperation('Chấm công', 'Nhân viên Check-in', { userId, userName, checkInTime });
      if (isDemoOfflineMode) {
        queueOfflineOperation(storeId, 'attendance', 'set', attId, newAttendance);
        setSimAttendance(prev => [newAttendance, ...prev.filter(a => a.id !== attId)]);
      } else {
        // Query employee profile to find current rate
        const userDoc = await getDoc(doc(db, 'users', userId));
        const rate = userDoc.exists() ? (userDoc.data().hourlyRate || 25000) : 25000;
        newAttendance.hourlyRate = rate;

        await setDoc(doc(db, 'stores', storeId, 'attendance', attId), {
          ...newAttendance,
          storeId
        });
      }
      triggerBeep(true);
      alert(`Check-in thành công lúc ${new Date(checkInTime).toLocaleTimeString('vi-VN')}!`);
    } catch (err) {
      console.error(err);
      triggerBeep(false);
      alert("Lỗi ghi nhận Check-in!");
    }
  };

  const handleCheckOut = async (userId: string) => {
    const todayStr = new Date().toLocaleDateString('sv-SE');
    const attId = `att-${userId}-${todayStr}`;
    const checkOutTime = new Date().toISOString();
    const storeId = fbUserProfile?.storeId || demoSession?.storeId || 'Sandbox';

    try {
      logOperation('Chấm công', 'Nhân viên Check-out', { userId, checkOutTime });
      if (isDemoOfflineMode) {
        const existingAtt = simAttendance.find(a => a.id === attId);
        if (existingAtt) {
          const checkInDate = new Date(existingAtt.checkIn);
          const checkOutDate = new Date(checkOutTime);
          const diffMs = checkOutDate.getTime() - checkInDate.getTime();
          const hours = Number(Math.max(0.01, diffMs / (1000 * 60 * 60)));
          const empRecord = simEmployees.find(e => e.uid === userId);
          const hourlyRate = empRecord?.hourlyRate || 25000;
          const updatedAtt = {
            ...existingAtt,
            checkOut: checkOutTime,
            hoursWorked: hours,
            hourlyRate,
            dailyWage: Number((hours * hourlyRate).toFixed(0)),
            status: 'completed' as const
          };
          queueOfflineOperation(storeId, 'attendance', 'set', attId, updatedAtt);
        }

        setSimAttendance(prev => prev.map(a => {
          if (a.id === attId) {
            const checkInDate = new Date(a.checkIn);
            const checkOutDate = new Date(checkOutTime);
            const diffMs = checkOutDate.getTime() - checkInDate.getTime();
            const hours = Number(Math.max(0.01, diffMs / (1000 * 60 * 60)));
            const empRecord = simEmployees.find(e => e.uid === userId);
            const hourlyRate = empRecord?.hourlyRate || 25000;
            return {
              ...a,
              checkOut: checkOutTime,
              hoursWorked: hours,
              hourlyRate,
              dailyWage: Number((hours * hourlyRate).toFixed(0)),
              status: 'completed' as const
            };
          }
          return a;
        }));
      } else {
        const docRef = doc(db, 'stores', storeId, 'attendance', attId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const checkInDate = new Date(data.checkIn);
          const checkOutDate = new Date(checkOutTime);
          const diffMs = checkOutDate.getTime() - checkInDate.getTime();
          const hours = Number(Math.max(0.01, diffMs / (1000 * 60 * 60)));
          
          const userDoc = await getDoc(doc(db, 'users', userId));
          const rate = userDoc.exists() ? (userDoc.data().hourlyRate || 25000) : 25000;

          await updateDoc(docRef, {
            checkOut: checkOutTime,
            hoursWorked: hours,
            hourlyRate: rate,
            dailyWage: Number((hours * rate).toFixed(0)),
            status: 'completed'
          });
        }
      }
      triggerBeep(true);
      alert("Check-out thành công! Ca trực đã hoàn tất và kết toán lương ngày.");
    } catch (err) {
      console.error(err);
      triggerBeep(false);
      alert("Lỗi ghi nhận Check-out!");
    }
  };

  // Live Clock for Header
  const [timeStr, setTimeStr] = useState<string>('');
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Redirect staff users away from restricted sections (reports, employees, suppliers, account)
  useEffect(() => {
    if (simUserRole === 'staff') {
      const restrictedScreens = ['reports', 'employees', 'suppliers', 'account'];
      if (restrictedScreens.includes(activeScreen)) {
        setActiveScreen('pos');
      }
    }
  }, [simUserRole, activeScreen]);

  // Show Loading Spinner while setting up initial Auth state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-100">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium tracking-wide text-slate-400">Đang khởi động hệ thống SmartPOS...</p>
      </div>
    );
  }

  const isSysAdmin = fbUserProfile?.role === 'sysadmin' && fbUserProfile?.email?.toLowerCase() === AUTH_CONFIG.EMAIL.toLowerCase();

  // Define Navigation Items dynamically based on active Store Type
  const navItems = isSysAdmin ? [
    { id: 'reports', name: 'Báo cáo doanh thu', icon: TrendingUp, color: 'text-amber-500' },
    { id: 'sysadmin', name: 'Quản trị hệ thống', icon: ShieldAlert, color: 'text-rose-500' }
  ] : [
    ...(simUserRole !== 'staff' ? [{ id: 'reports', name: 'Báo cáo doanh thu', icon: TrendingUp, color: 'text-amber-500' }] : []),
    { id: 'pos', name: simStoreType === 'fnb' ? 'Bán hàng (F&B Order)' : 'Quầy bán lẻ (POS)', icon: ShoppingBag, color: 'text-emerald-500' },
    ...(simStoreType === 'fnb' ? [
      { id: 'kitchen', name: 'Màn hình Bếp (KDS)', icon: ChefHat, color: 'text-orange-500' },
      { id: 'menu', name: 'Thực đơn & Menu', icon: Coffee, color: 'text-pink-500' },
      { id: 'tables', name: 'Sơ đồ bàn', icon: ClipboardList, color: 'text-violet-500' }
    ] : []),
    { id: 'inventory', name: 'Quản lý kho (FEFO)', icon: Layers, color: 'text-blue-500' },
    { id: 'customers', name: 'Quản lý khách hàng', icon: Users, color: 'text-emerald-500' },
    ...(simUserRole !== 'staff' ? [
      { id: 'employees', name: 'Quản lý nhân viên', icon: Briefcase, color: 'text-amber-500' },
      { id: 'suppliers', name: 'Quản lý nhà cung cấp', icon: Truck, color: 'text-blue-500' }
    ] : []),
  ];

  const hasActiveSession = !!(fbUser || demoSession);

  if (showProjectDemo) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col">
        <div className="bg-slate-900 border-b border-slate-800 px-6 py-3.5 flex justify-between items-center z-50">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 bg-amber-500/10 text-amber-500 rounded-lg text-[10px] font-black tracking-widest uppercase">SANDBOX REVIEW</span>
            <h1 className="text-xs font-black text-white tracking-tight uppercase">Bảng Giải Thích Tổng Thể & Trực Quan Dự Án</h1>
          </div>
          <button
            onClick={() => { setShowProjectDemo(false); triggerBeep(true); }}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5"
          >
            Quay lại Đăng nhập
          </button>
        </div>
        <div className="flex-grow overflow-auto">
          <DemoApp />
        </div>
      </div>
    );
  }

  // Full-screen Login view if no active session
  if (!hasActiveSession) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-6xl">
          <LoginScreen
            fbUser={fbUser}
            fbUserProfile={fbUserProfile}
            fbStoreProfile={fbStoreProfile}
            authLoading={authLoading}
            authError={authError}
            isDemoOfflineMode={isDemoOfflineMode}
            setIsDemoOfflineMode={setIsDemoOfflineMode}
            onLogin={handleFirebaseLogin}
            onRegister={handleFirebaseRegister}
            onLogout={handleFirebaseLogout}
            onOpenDemoExplanation={() => { setShowProjectDemo(true); triggerBeep(true); }}
            onDemoLogin={(userName, storeId, storeType, storeName) => {
              setDemoSession({
                userName,
                storeId,
                storeType,
                storeName
              });
              setSimStoreType(storeType);
              setIsDemoOfflineMode(true);
              triggerBeep(true);
              setActiveScreen('reports'); // Start with reports!
            }}
            triggerBeep={triggerBeep}
          />
        </div>
      </div>
    );
  }

  const isStorePending = !isDemoOfflineMode && fbUserProfile && fbUserProfile.role !== 'sysadmin' && fbStoreProfile?.status === 'pending';
  const isStoreRejected = !isDemoOfflineMode && fbUserProfile && fbUserProfile.role !== 'sysadmin' && fbStoreProfile?.status === 'rejected';

  if (isStorePending) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 text-center shadow-xl relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent pointer-events-none opacity-50"></div>
          
          <div className="relative z-10 space-y-4">
            <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 text-amber-500 rounded-2xl flex items-center justify-center mx-auto animate-pulse">
              <Clock className="w-8 h-8" />
            </div>
            
            <div className="space-y-2">
              <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md text-[10px] font-black tracking-widest uppercase font-mono">
                PENDING APPROVAL
              </span>
              <h2 className="text-xl font-black text-white uppercase tracking-tight">Cửa hàng đang chờ duyệt</h2>
              <p className="text-xs text-slate-400 font-medium">
                Cửa hàng <strong className="text-slate-200">"{fbStoreProfile?.name}"</strong> của bạn đã được đăng ký thành công trên Cloud. Hiện tại đang chờ Ban quản trị phê duyệt để kích hoạt hệ thống bán hàng.
              </p>
            </div>

            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800/80 text-left space-y-2 text-xs text-slate-400 font-medium">
              <div className="flex justify-between">
                <span>Mã định danh:</span>
                <span className="font-mono text-slate-300">{fbStoreProfile?.id}</span>
              </div>
              <div className="flex justify-between">
                <span>Người liên hệ:</span>
                <span className="text-slate-300">{fbUserProfile?.name}</span>
              </div>
              <div className="flex justify-between">
                <span>Mô hình:</span>
                <span className="text-slate-300">{fbStoreProfile?.storeType === 'fnb' ? '🍔 F&B (Nhà hàng)' : '🛍️ Bán lẻ'}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
              Vui lòng liên hệ quản trị viên qua email <strong className="text-slate-200">{AUTH_CONFIG.EMAIL}</strong> hoặc hotline <strong className="text-slate-200">0900.POS.SYS</strong> để được phê duyệt nhanh nhất.
            </p>

            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={handleFirebaseLogout}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-98 transition-all text-xs font-bold rounded-xl border border-slate-700 text-white cursor-pointer"
              >
                Đăng xuất tài khoản
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isStoreRejected) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100">
        <div className="w-full max-w-md bg-slate-900 border border-rose-950 rounded-3xl p-8 space-y-6 text-center shadow-xl relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-rose-500/10 via-transparent to-transparent pointer-events-none opacity-50"></div>
          
          <div className="relative z-10 space-y-4">
            <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/30 text-rose-500 rounded-2xl flex items-center justify-center mx-auto">
              <XCircle className="w-8 h-8" />
            </div>
            
            <div className="space-y-2">
              <span className="px-2.5 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-md text-[10px] font-black tracking-widest uppercase font-mono">
                ACCESS REJECTED
              </span>
              <h2 className="text-xl font-black text-white uppercase tracking-tight">Kích hoạt bị từ chối</h2>
              <p className="text-xs text-slate-400 font-medium">
                Cửa hàng <strong className="text-slate-200">"{fbStoreProfile?.name}"</strong> đã bị từ chối kích hoạt hoạt động hoặc bị khóa bởi Quản trị viên hệ thống.
              </p>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
              Vui lòng liên hệ quản trị viên qua email <strong className="text-slate-200">{AUTH_CONFIG.EMAIL}</strong> để biết thêm thông tin chi tiết.
            </p>

            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={handleFirebaseLogout}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-98 transition-all text-xs font-bold rounded-xl border border-slate-700 text-white cursor-pointer"
              >
                Đăng xuất tài khoản
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/60 font-sans text-slate-800 flex flex-col md:flex-row antialiased">
      
      {/* Audio-visual virtual speaker indicator (simulated beeps) */}
      <AnimatePresence>
        {simSuccessBeep && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed bottom-6 right-6 z-50 px-4 py-3 bg-emerald-600 text-white rounded-xl shadow-lg border border-emerald-500 flex items-center space-x-3 pointer-events-none"
          >
            <div className="w-2.5 h-2.5 bg-white rounded-full animate-ping" />
            <span className="text-xs font-bold tracking-wider uppercase">🔔 BEEP SUCCESS</span>
          </motion.div>
        )}
        {simErrorBeep && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed bottom-6 right-6 z-50 px-4 py-3 bg-rose-600 text-white rounded-xl shadow-lg border border-rose-500 flex items-center space-x-3 pointer-events-none"
          >
            <div className="w-2.5 h-2.5 bg-white rounded-full animate-ping" />
            <span className="text-xs font-bold tracking-wider uppercase">🚨 BEEP ERROR</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- SIDEBAR NAVIGATION (Desktop) --- */}
      <aside className={`w-full ${sidebarCollapsed ? 'md:w-20' : 'md:w-72'} bg-slate-900 text-slate-300 flex-shrink-0 flex flex-col border-r border-slate-800 shadow-xl relative z-10 transition-all duration-300`}>
        
        {/* Logo & Store Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 flex-shrink-0">
              <Store className="w-5 h-5" />
            </div>
            {!sidebarCollapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="min-w-0">
                <h1 className="text-base font-extrabold text-white tracking-tight uppercase truncate max-w-[170px]" title={fbStoreProfile?.name || demoSession?.storeName || 'SmartPOS Lite'}>
                  {fbStoreProfile?.name || demoSession?.storeName || 'SmartPOS Lite'}
                </h1>
                <p className="text-[10px] text-slate-400 font-medium flex items-center mt-0.5 whitespace-nowrap">
                  {isDemoOfflineMode ? (
                    <>
                      <WifiOff className="w-3 h-3 text-amber-500 mr-1 flex-shrink-0" />
                      Demo Ngoại tuyến
                    </>
                  ) : (
                    <>
                      <Wifi className="w-3 h-3 text-emerald-400 mr-1 animate-pulse flex-shrink-0" />
                      Đã kết nối Cloud
                    </>
                  )}
                </p>
              </motion.div>
            )}
          </div>
          {/* Collapse/Expand Toggle button */}
          <button 
            onClick={() => { setSidebarCollapsed(!sidebarCollapsed); triggerBeep(true); }}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors hidden md:block cursor-pointer"
            title={sidebarCollapsed ? "Mở rộng menu" : "Thu gọn menu"}
          >
            {sidebarCollapsed ? <ChevronRight className="w-4.5 h-4.5" /> : <ChevronDown className="w-4.5 h-4.5 -rotate-90" />}
          </button>
        </div>

        {/* Navigation Options */}
        <nav className="flex-1 p-3 space-y-1.5 mt-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveScreen(item.id as any)}
                className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center px-0 py-3' : 'space-x-3.5 px-4 py-3'} rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                  isActive 
                    ? 'bg-slate-800/80 text-white shadow-inner border-l-4 border-emerald-500' 
                    : 'hover:bg-slate-800/40 text-slate-400 hover:text-slate-100'
                }`}
                title={item.name}
              >
                <Icon className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? item.color : 'text-slate-500'}`} />
                {!sidebarCollapsed && (
                  <span className="flex-1 text-left whitespace-nowrap truncate">{item.name}</span>
                )}
                {!sidebarCollapsed && isActive && (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </nav>

        {/* User Card & Logout bottom region */}
        <div className={`p-4 border-t border-slate-800 bg-slate-950/60 flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 flex-shrink-0" title={fbUserProfile?.name || demoSession?.userName || 'Nhân viên Demo'}>
              <UserCircle className="w-5 h-5 text-slate-400" />
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  {fbUserProfile?.name || demoSession?.userName || 'Nhân viên Demo'}
                </p>
                <p className="text-[10px] text-slate-500 truncate mt-0.5">
                  {fbUserProfile?.email || `ID: ${demoSession?.storeId || 'Sandbox'}`}
                </p>
              </div>
            )}
          </div>
          {!sidebarCollapsed && (
            <button 
              onClick={() => {
                if (isDemoOfflineMode) {
                  setDemoSession(null);
                  triggerBeep(true);
                } else {
                  handleFirebaseLogout();
                }
              }}
              className="p-2 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800/80 transition-colors cursor-pointer"
              title="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* --- MAIN CORE SECTION VIEWPORT --- */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* --- GLOBAL APP BAR / HEADER --- */}
        <header className="bg-white border-b border-slate-200 h-16 px-4 md:px-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <h2 className="text-sm font-extrabold text-slate-900 tracking-tight uppercase hidden md:block">
              {activeScreen === 'pos' && 'QUẦY BÁN HÀNG'}
              {activeScreen === 'kitchen' && 'MÀN HÌNH BẾP CHẾ BIẾN (KDS)'}
              {activeScreen === 'menu' && 'THIẾT LẬP THỰC ĐƠN & MENU'}
              {activeScreen === 'tables' && 'THIẾT LẬP & CHỈNH SỬA SƠ ĐỒ BÀN'}
              {activeScreen === 'inventory' && (simStoreType === 'fnb' ? 'QUẢN LÝ KHO NGUYÊN VẬT LIỆU (FIFO/FEFO)' : 'QUẢN LÝ KHO HÀNG HÓA (FIFO)')}
              {activeScreen === 'reports' && 'BÁO CÁO DOANH THU & CHỈ SỐ'}
              {activeScreen === 'account' && 'THIẾT LẬP TÀI KHOẢN CLOUD'}
            </h2>
            
            {/* Store ID Tag next to title */}
            <div className="hidden md:flex items-center space-x-1.5 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-xl text-[10px] font-black text-indigo-700 font-mono shadow-sm">
              <span>MÃ CỬA HÀNG (STORE ID):</span>
              <span className="text-emerald-600 select-all">{fbUserProfile?.storeId || demoSession?.storeId || 'LOCAL-DEMO'}</span>
            </div>

            <div className="md:hidden flex items-center space-x-2">
              <Store className="w-4.5 h-4.5 text-emerald-500" />
              <span className="text-xs font-bold text-slate-900 uppercase truncate max-w-[120px]">
                {fbStoreProfile?.name || demoSession?.storeName || 'SmartPOS'}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            
            {/* Quick stats tags */}
            <div className="hidden lg:flex items-center space-x-3.5 text-xs text-slate-500 border-r border-slate-200 pr-4 font-semibold">
              <div className="flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
                Món khả dụng: <strong className="text-slate-800 ml-1">{simProducts.filter(p => p.isAvailable).length}</strong>
              </div>
              {simStoreType === 'fnb' && (
                <div className="flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mr-1.5" />
                  Bàn đang dùng: <strong className="text-slate-800 ml-1">{simTables.filter(t => t.status === 'serving').length}</strong>
                </div>
              )}
            </div>

            {/* Current Real Time */}
            <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600 font-mono shadow-sm">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{timeStr || '00:00:00'}</span>
            </div>

            {/* Status Indicator */}
            {isDemoOfflineMode ? (
              <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200/60 rounded-xl text-[10px] font-bold flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse mr-1.5" />
                OFFLINE DEMO
              </span>
            ) : (
              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-xl text-[10px] font-bold flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5" />
                CLOUD ACTIVE
              </span>
            )}
          </div>
        </header>

        {/* --- DYNAMIC SCREEN RENDER STAGE --- */}
        <section className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/50">
          
          <AnimatePresence mode="wait">
            {activeScreen === 'pos' && (
              <motion.div
                key="pos"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
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
              </motion.div>
            )}

            {activeScreen === 'inventory' && (
              <motion.div
                key="inventory"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <InventoryScreen
                  simProducts={simStoreType === 'fnb' ? simIngredients : simProducts}
                  setSimProducts={simStoreType === 'fnb' ? setSimIngredients : setSimProducts}
                  simBatches={simStoreType === 'fnb' ? simIngredientBatches : simBatches}
                  setSimBatches={simStoreType === 'fnb' ? setSimIngredientBatches : setSimBatches}
                  simTransactions={simStoreType === 'fnb' ? simIngredientTransactions : simTransactions}
                  setSimTransactions={simStoreType === 'fnb' ? setSimIngredientTransactions : setSimTransactions}
                  triggerBeep={triggerBeep}
                  fbUserProfile={fbUserProfile}
                  simStoreType={simStoreType}
                  isOffline={isDemoOfflineMode}
                  storeId={fbUserProfile?.storeId || demoSession?.storeId || 'Sandbox'}
                />
              </motion.div>
            )}

            {activeScreen === 'reports' && (
              <motion.div
                key="reports"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <ReportsSection
                  simOrders={simOrders}
                  simProducts={simProducts}
                  triggerBeep={triggerBeep}
                  isOffline={isDemoOfflineMode}
                  storeId={fbUserProfile?.storeId || demoSession?.storeId || 'Sandbox'}
                  currentUser={{
                    uid: fbUser?.uid || 'demo-user-123',
                    name: fbUserProfile?.name || demoSession?.userName || 'Quản trị viên Demo'
                  }}
                  attendanceLogs={simAttendance}
                  onCheckIn={handleCheckIn}
                  onCheckOut={handleCheckOut}
                  isSysAdmin={isSysAdmin}
                />
              </motion.div>
            )}

            {activeScreen === 'menu' && simStoreType === 'fnb' && (
              <motion.div
                key="menu"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <MenuManagement
                  simProducts={simProducts}
                  setSimProducts={setSimProducts}
                  triggerBeep={triggerBeep}
                  isOffline={isDemoOfflineMode}
                  storeId={fbUserProfile?.storeId || demoSession?.storeId || 'Sandbox'}
                />
              </motion.div>
            )}

            {activeScreen === 'tables' && simStoreType === 'fnb' && (
              <motion.div
                key="tables"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="max-w-6xl mx-auto"
              >
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-base font-black text-slate-900 uppercase">Quản lý sơ đồ phòng bàn F&B</h3>
                      <p className="text-xs text-slate-500">Chỉnh sửa khu vực, thêm bàn ăn, kéo thả di chuyển vị trí bàn trực quan trong chế độ thiết kế.</p>
                    </div>
                  </div>
                  <TableMap
                    simTables={simTables}
                    setSimTables={setSimTables}
                    simZones={simZones}
                    setSimZones={setSimZones}
                    simSelectedTableId={simSelectedTableId}
                    setSimSelectedTableId={setSimSelectedTableId}
                    simUserRole={simUserRole}
                    triggerBeep={triggerBeep}
                    isOffline={isDemoOfflineMode}
                    storeId={fbUserProfile?.storeId || demoSession?.storeId || 'Sandbox'}
                  />
                </div>
              </motion.div>
            )}

            {activeScreen === 'kitchen' && simStoreType === 'fnb' && (
              <motion.div
                key="kitchen"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <KitchenDisplay
                  simKitchenItems={simKitchenItems}
                  setSimKitchenItems={setSimKitchenItems}
                  triggerBeep={triggerBeep}
                  isOffline={isDemoOfflineMode}
                  storeId={fbUserProfile?.storeId || demoSession?.storeId || 'Sandbox'}
                />
              </motion.div>
            )}

            {activeScreen === 'customers' && (
              <motion.div
                key="customers"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <CustomersSection
                  isOffline={isDemoOfflineMode}
                  storeId={fbUserProfile?.storeId || demoSession?.storeId || 'Sandbox'}
                  triggerBeep={triggerBeep}
                  simCustomers={simCustomers}
                  setSimCustomers={setSimCustomers}
                />
              </motion.div>
            )}

            {activeScreen === 'employees' && (
              <motion.div
                key="employees"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <EmployeesSection
                  isOffline={isDemoOfflineMode}
                  storeId={fbUserProfile?.storeId || demoSession?.storeId || 'Sandbox'}
                  triggerBeep={triggerBeep}
                  simEmployees={simEmployees}
                  setSimEmployees={setSimEmployees}
                  simAttendance={simAttendance}
                  setSimAttendance={setSimAttendance}
                />
              </motion.div>
            )}

            {activeScreen === 'suppliers' && (
              <motion.div
                key="suppliers"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <SuppliersSection
                  isOffline={isDemoOfflineMode}
                  storeId={fbUserProfile?.storeId || demoSession?.storeId || 'Sandbox'}
                  triggerBeep={triggerBeep}
                  simSuppliers={simSuppliers}
                  setSimSuppliers={setSimSuppliers}
                />
              </motion.div>
            )}

            {activeScreen === 'sysadmin' && (
              <motion.div
                key="sysadmin"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <SysAdminDashboard
                  onLogout={handleFirebaseLogout}
                  triggerBeep={triggerBeep}
                  seedStoreData={seedStoreData}
                />
              </motion.div>
            )}

            {activeScreen === 'account' && (
              <motion.div
                key="account"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="max-w-4xl mx-auto"
              >
                {/* Active Session Display */}
                {isDemoOfflineMode && demoSession ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 border-b border-slate-100 gap-4">
                      <div className="flex items-center space-x-3.5">
                        <div className="w-12 h-12 bg-gradient-to-tr from-amber-500 to-amber-600 rounded-xl flex items-center justify-center text-white shadow shadow-amber-500/15">
                          <Store className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-base font-extrabold text-slate-900 uppercase">Cửa hàng Demo Ngoại tuyến</h3>
                          <p className="text-xs text-slate-500">Mã định danh Sandbox: <code className="font-mono bg-slate-50 px-1 py-0.5 rounded border border-slate-200/50">{demoSession.storeId}</code></p>
                        </div>
                      </div>
                      <div>
                        <button 
                          onClick={() => {
                            setDemoSession(null);
                            triggerBeep(true);
                          }}
                          className="px-4 py-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold hover:bg-rose-100 transition-colors flex items-center space-x-2 cursor-pointer shadow-sm active:scale-98"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>ĐĂNG XUẤT DEMO</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Tên cửa hàng</span>
                          <p className="text-sm font-bold text-slate-900 bg-slate-50/50 px-3 py-2.5 border border-slate-100 rounded-xl">{demoSession.storeName}</p>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Số điện thoại liên hệ</span>
                          <p className="text-sm font-bold text-slate-900 bg-slate-50/50 px-3 py-2.5 border border-slate-100 rounded-xl flex items-center">
                            <Phone className="w-4 h-4 text-slate-400 mr-2" />
                            0900000000 (Chế độ Demo Sandbox)
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Mô hình hoạt động</span>
                          <p className="text-sm font-bold text-slate-900 bg-slate-50/50 px-3 py-2.5 border border-slate-100 rounded-xl uppercase">
                            {demoSession.storeType === 'fnb' ? '🍔 FnB (Nhà hàng / Bàn ăn)' : '🛍️ Retail (Bán lẻ / Mã vạch)'}
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Nhân viên hiện tại</span>
                          <p className="text-sm font-bold text-slate-900 bg-slate-50/50 px-3 py-2.5 border border-slate-100 rounded-xl">{demoSession.userName}</p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                      <span>Cơ sở dữ liệu: Local React State</span>
                      <span>Máy chủ Cloud: Offline Sandbox</span>
                    </div>
                  </div>
                ) : !isDemoOfflineMode && fbStoreProfile ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 border-b border-slate-100 gap-4">
                      <div className="flex items-center space-x-3.5">
                        <div className="w-12 h-12 bg-gradient-to-tr from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center text-white shadow shadow-emerald-500/15">
                          <Store className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-base font-extrabold text-slate-900 uppercase">Cửa hàng hoạt động</h3>
                          <p className="text-xs text-slate-500">Mã định danh: <code className="font-mono bg-slate-50 px-1 py-0.5 rounded border border-slate-200/50">{fbStoreProfile.id}</code></p>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button 
                          onClick={handleFirebaseLogout}
                          className="px-4 py-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold hover:bg-rose-100 transition-colors flex items-center space-x-2 cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>ĐĂNG XUẤT</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Tên cửa hàng</span>
                          <p className="text-sm font-bold text-slate-900 bg-slate-50/50 px-3 py-2.5 border border-slate-100 rounded-xl">{fbStoreProfile.name}</p>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Số điện thoại liên hệ</span>
                          <p className="text-sm font-bold text-slate-900 bg-slate-50/50 px-3 py-2.5 border border-slate-100 rounded-xl flex items-center">
                            <Phone className="w-4 h-4 text-slate-400 mr-2" />
                            {fbStoreProfile.phone}
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Địa chỉ chi nhánh</span>
                          <p className="text-sm font-bold text-slate-900 bg-slate-50/50 px-3 py-2.5 border border-slate-100 rounded-xl flex items-center">
                            <MapPin className="w-4 h-4 text-slate-400 mr-2" />
                            {fbStoreProfile.address}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Mô hình hoạt động</span>
                          <p className="text-sm font-bold text-slate-900 bg-slate-50/50 px-3 py-2.5 border border-slate-100 rounded-xl uppercase">
                            {fbStoreProfile.storeType === 'fnb' ? '🍔 FnB (Nhà hàng / Bàn ăn)' : '🛍️ Retail (Bán lẻ / Mã vạch)'}
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Quản trị viên liên kết</span>
                          <p className="text-sm font-bold text-slate-900 bg-slate-50/50 px-3 py-2.5 border border-slate-100 rounded-xl">{fbUserProfile?.name}</p>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Trạng thái đồng bộ</span>
                          <div className="px-3 py-2.5 border border-emerald-100 bg-emerald-50/30 rounded-xl flex items-center text-xs text-emerald-800 font-bold">
                            <Check className="w-4 h-4 mr-2 text-emerald-600" />
                            Thời gian thực Firestore hoạt động tốt
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                      <span>Cơ sở dữ liệu đám mây: Firestore</span>
                      <span>Máy chủ Cloud: Cloud Run container</span>
                    </div>
                  </div>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
          
        </section>

      </main>

    </div>
  );
}
