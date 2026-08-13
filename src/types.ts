/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum UserRole {
  SYSADMIN = 'sysadmin',
  OWNER = 'owner',
  MANAGER = 'manager',
  STAFF = 'staff'
}

export interface UserProfile {
  uid: string;
  email: string;
  storeId: string;
  role: UserRole;
  name: string;
  hourlyRate?: number; // Mức lương theo giờ (đ/giờ)
  createdAt: string; // ISO 8601 string
}

export enum StoreType {
  FNB = 'fnb', // Cửa hàng đồ ăn, đồ uống
  RETAIL = 'retail' // Tạp hóa, siêu thị, vật liệu xây dựng
}

export interface Store {
  id: string;
  name: string;
  address: string;
  phone: string;
  storeType: StoreType; // Phân biệt cửa hàng FNB và tạp hóa/bán lẻ
  createdAt: string;
}

export interface Product {
  id: string;
  sku: string; // Barcode or code (used for QR/Barcode scanner)
  name: string;
  price: number;
  cost: number;
  category: string;
  isAvailable: boolean; // Trạng thái món ăn / sản phẩm (còn hàng / hết hàng, đặc biệt hữu ích cho F&B)
  createdAt: string;
}

export interface InventoryBatch {
  id: string;
  productId: string;
  batchCode: string; // Mã Lô (e.g., L2026-07)
  expiryDate: string; // Hạn Sử Dụng (e.g., 2027-12-31)
  manufactureDate?: string; // Ngày Sản Xuất (e.g., 2026-01-01)
  importPrice?: number; // Giá nhập sản phẩm của lô này
  transactionId?: string; // Liên kết với phiếu xuất nhập kho (Inventory Transaction)
  quantity: number; // Số lượng tồn kho hiện tại trong lô này
  originalQuantity: number; // Số lượng nhập ban đầu
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  batchId?: string;
  batchCode?: string;
  note?: string;
  size?: string; // Size đồ uống (Nhỏ/Vừa/Lớn...)
  sugarLevel?: string; // Mức đường (0%/30%/50%/70%/100%)
  iceLevel?: string; // Mức đá (0%/30%/50%/70%/100%)
}

export enum PaymentMethod {
  CASH = 'cash',
  CARD = 'card',
  QR = 'qr'
}

export interface Order {
  id: string;
  orderNumber: string; // HD00001 etc.
  items: OrderItem[];
  subtotal?: number;
  discountAmount?: number;
  taxAmount?: number;
  totalAmount: number;
  totalCost?: number;
  paymentMethod: PaymentMethod;
  paidAmount: number;
  changeAmount: number;
  staffId: string;
  staffName?: string;
  customerId?: string; // Reference to Customer (can be 'walk-in' / 'khach-vang-lai')
  customerName?: string;
  customerPointsEarned?: number;
  tableId?: string; // ID của bàn ăn (nếu là FNB và ăn tại bàn)
  tableNumber?: string; // Số bàn hiển thị (ví dụ: Bàn 5)
  orderType?: 'dine-in' | 'takeaway'; // Loại đơn hàng: Ăn tại bàn / mang về
  status?: 'completed' | 'void'; // Trạng thái đơn: đã hoàn tất / đã hủy
  note?: string;
  createdAt: string;
}

export enum TableStatus {
  EMPTY = 'empty', // Bàn trống
  SERVING = 'serving' // Đang phục vụ khách
}

export interface Zone {
  id: string;
  name: string;
  createdAt: string;
}

export interface DiningTable {
  id: string;
  name: string; // Tên bàn (ví dụ: Bàn 01)
  status: TableStatus; // Trạng thái bàn
  capacity: number; // Sức chứa tối đa (số người)
  zoneId?: string; // ID của khu vực/tầng
  x?: number; // Vị trí X (%) trên mặt bằng
  y?: number; // Vị trí Y (%) trên mặt bằng
  width?: number; // Chiều rộng (px)
  height?: number; // Chiều cao (px)
  reservationName?: string; // Tên khách đã đặt bàn trước (rỗng = không có đặt trước)
  reservationPhone?: string; // SĐT khách đặt bàn
  reservationTime?: string; // Giờ hẹn (ISO string hoặc HH:mm tự do)
  reservationNote?: string; // Ghi chú đặt bàn (số lượng khách, yêu cầu đặc biệt...)
  createdAt: string;
}

export enum KitchenStatus {
  PENDING = 'pending', // Chờ chế biến
  PREPARING = 'preparing', // Đang chế biến
  COMPLETED = 'completed', // Đã chế biến xong (chờ cung ứng)
  SERVED = 'served' // Đã phục vụ lên bàn cho khách
}

export interface KitchenItem {
  id: string;
  orderId: string; // ID của hóa đơn order tương ứng
  productId: string;
  productName: string;
  quantity: number;
  tableNumber?: string; // Số bàn tương ứng (nếu có)
  status: KitchenStatus; // Trạng thái chế biến món ăn cho bếp
  note?: string; // Ghi chú đặc biệt (ví dụ: Không cay, nhiều đá)
  size?: string;
  sugarLevel?: string;
  iceLevel?: string;
  createdAt: string;
}

export interface Shift {
  id: string;
  staffId: string;
  staffName: string;
  openingCash: number; // Tiền quỹ đầu ca
  closingCashExpected?: number; // Tiền mặt kỳ vọng (tính từ hệ thống) khi đóng ca
  closingCashActual?: number; // Tiền mặt đếm thực tế khi đóng ca
  status: 'open' | 'closed';
  note?: string;
  openedAt: string;
  closedAt?: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  createdAt: string;
}

export enum InventoryTransactionType {
  IMPORT = 'import', // Nhập kho từ NCC
  EXPORT = 'export', // Xuất kho
  ADJUSTMENT = 'adjustment' // Điều chỉnh hao hụt / hư hỏng
}

export interface InventoryTransactionItem {
  productId: string;
  batchCode: string;
  quantity: number;
  price?: number; // Cost price for imports
}

export interface InventoryTransaction {
  id: string;
  transactionNumber: string; // PNK0001, PXK0001
  type: InventoryTransactionType;
  supplierId?: string; // Only applicable for import type
  items: InventoryTransactionItem[];
  totalAmount?: number;
  staffId: string;
  note?: string;
  createdAt: string;
}

export interface Customer {
  id: string; // Default walk-in could be 'khach-vang-lai'
  name: string;
  phone: string;
  email: string;
  points: number; // Tích điểm lũy kế
  createdAt: string;
}

// Frontend-only state helpers
export interface CartItem {
  product: Product;
  selectedBatch: InventoryBatch | null;
  quantity: number;
}

export interface Attendance {
  id: string;
  storeId: string;
  userId: string;
  userName: string;
  date: string; // YYYY-MM-DD
  checkIn: string; // ISO 8601 String
  checkOut: string | null; // ISO 8601 String or null
  hoursWorked: number; // calculated hours
  hourlyRate: number; // rate at time of checkout
  dailyWage: number; // hoursWorked * hourlyRate
  status: 'working' | 'completed';
}

export interface ActivityLog {
  id: string;
  storeId: string;
  screenName: string; // Tên màn hình thao tác
  action: string; // Thao tác
  data: Record<string, any>; // Dữ liệu thao tác dưới dạng object/JSON
  userId: string;
  userName: string;
  createdAt: string; // ISO 8601 String
}

