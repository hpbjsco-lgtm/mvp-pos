/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { RefreshCw, Shield, ShoppingBag, TrendingUp, Wallet } from 'lucide-react';
import { Order, Product } from '../types';
import { listStores, listAllUsers } from '../db/auth';
import { loadCollection } from '../db/collections';
import PageCard from './ui/PageCard';
import FilterPills from './ui/FilterPills';
import DataTable from './ui/DataTable';
import { buildRevenueSeries, filterOrdersInPeriod, ReportPeriod } from '../utils/revenueReport';

interface ReportsSectionProps {
  simOrders: Order[];
  simProducts: Product[];
  triggerBeep: (success: boolean) => void;
  isOffline: boolean;
  isSysAdmin?: boolean;
}

export default function ReportsSection({
  simOrders,
  simProducts,
  triggerBeep,
  isOffline,
  isSysAdmin = false
}: ReportsSectionProps) {

  const [timeframe, setTimeframe] = useState<ReportPeriod>('daily');

  // System admin global data
  const [loadingAllData, setLoadingAllData] = useState(false);
  const [allStores, setAllStores] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allSystemOrders, setAllSystemOrders] = useState<Order[]>([]);
  const [allSystemProducts, setAllSystemProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (!isSysAdmin) return;

    const fetchSystemWideData = async () => {
      setLoadingAllData(true);
      try {
        // Dữ liệu toàn hệ thống được đọc trực tiếp từ SQLite cục bộ trên thiết bị này
        // (mọi cửa hàng đã đồng bộ Cloud về máy đều nằm chung 1 file SQLite - xem src/db/schema.ts).
        const storesList = await listStores();
        setAllStores(storesList);

        const usersList = await listAllUsers();
        setAllUsers(usersList);

        const ordersResults = await Promise.all(
          storesList.map((store) => loadCollection('orders', store.id) as Promise<Order[]>),
        );
        const productsResults = await Promise.all(
          storesList.map((store) => loadCollection('products', store.id) as Promise<Product[]>),
        );

        setAllSystemOrders(ordersResults.flat());
        setAllSystemProducts(productsResults.flat());
      } catch (error) {
        console.error("Lỗi tải dữ liệu toàn hệ thống trong ReportsSection:", error);
      } finally {
        setLoadingAllData(false);
      }
    };

    fetchSystemWideData();
  }, [isSysAdmin]);

  // Use either global system wide data or specific store data based on role
  // Đơn đã hủy (void) không được tính vào doanh thu / số đơn / sản phẩm bán
  const validOrders = (isSysAdmin ? (allSystemOrders.length > 0 ? allSystemOrders : simOrders) : simOrders)
    .filter(o => (o.status || 'completed') !== 'void');
  // Ba ô, hai bảng xếp hạng chỉ tính đơn trong khoảng đang chọn (hôm nay / tháng này / năm nay)
  const ordersToUse = filterOrdersInPeriod(validOrders, timeframe);
  const productsToUse = isSysAdmin ? (allSystemProducts.length > 0 ? allSystemProducts : simProducts) : simProducts;

  // Calculate high-level KPIs based on order history
  const totalRevenue = ordersToUse.reduce((sum, o) => sum + o.totalAmount, 0);
  const totalOrdersCount = ordersToUse.length;

  // Lợi nhuận ước tính = tổng (giá bán - giá vốn) x số lượng, dựa trên dữ liệu sản phẩm hiện có
  const estimatedProfit = ordersToUse.reduce((sum, o) => {
    return sum + o.items.reduce((itemSum, it) => {
      const prod = productsToUse.find(p => p.id === it.productId || p.name === it.name);
      return itemSum + (it.price - (prod?.cost || 0)) * it.quantity;
    }, 0);
  }, 0);

  // Calculate product quantities sold
  const productQuantityMap: Record<string, number> = {};
  ordersToUse.forEach(o => {
    o.items.forEach(it => {
      productQuantityMap[it.name] = (productQuantityMap[it.name] || 0) + it.quantity;
    });
  });

  const sortedProductSales = Object.entries(productQuantityMap)
    .map(([name, qty]) => {
      const prod = productsToUse.find(p => p.name === name);
      const revenue = qty * (prod?.price || 0);
      return { name, quantity: qty, revenue, category: prod?.category || 'Sản phẩm', imageUrl: prod?.imageUrl };
    })
    .sort((a, b) => b.quantity - a.quantity);

  const bestSellers = sortedProductSales.slice(0, 5);
  // Sản phẩm bán chậm: lấy các sản phẩm có lượng bán thấp nhất trong danh mục đang kinh doanh
  const worstSellers = [...productsToUse]
    .map(p => {
      const qty = productQuantityMap[p.name] || 0;
      return { name: p.name, quantity: qty, category: p.category };
    })
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 3);

  // Biểu đồ cộng từ đơn thật: 7 ngày, 6 tháng hoặc 4 năm gần nhất
  const chartPoints = buildRevenueSeries(validOrders, timeframe);
  const maxChartValue = Math.max(...chartPoints.map(p => p.value), 0);

  const timeframeLabel = timeframe === 'daily' ? 'Hôm nay' : timeframe === 'monthly' ? 'Tháng này' : 'Năm nay';

  return (
    <div className="space-y-4">

      {/* Tổng quan hệ thống (chỉ SysAdmin); chấm công nằm ở menu tài khoản trên thanh đầu trang */}
      {isSysAdmin && (
        <div className="m3-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="text-base font-bold text-on-surface">Tổng quan hệ thống Multi-Tenant</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="m3-card !bg-surface-container p-3.5 text-center">
              <span className="text-sm text-on-surface-variant font-semibold block">Tổng Store</span>
              <span className="text-xl font-bold text-primary">{allStores.length}</span>
            </div>
            <div className="m3-card !bg-surface-container p-3.5 text-center">
              <span className="text-sm text-on-surface-variant font-semibold block">Tổng User</span>
              <span className="text-xl font-bold text-primary">{allUsers.length}</span>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-bold text-on-surface flex items-center gap-1.5">
               Nhân sự theo từng cửa hàng
            </h4>
            {loadingAllData ? (
              <div className="flex items-center gap-2 py-4 justify-center text-on-surface-variant">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span className="text-sm font-medium">Đang đồng bộ dữ liệu hệ thống...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {allStores.map((store) => {
                  const storeUsersCount = allUsers.filter(u => u.storeId === store.id).length;
                  return (
                    <div key={store.id} className="m3-card !bg-surface-container p-3.5 space-y-1">
                      <div className="flex justify-between items-start">
                        <span className="m3-badge m3-badge-neutral">{store.storeType === 'fnb' ? 'F&B' : 'Bán lẻ'}</span>
                        <span className="text-sm font-bold text-primary">{storeUsersCount} người</span>
                      </div>
                      <h4 className="text-sm font-bold text-on-surface truncate">{store.name}</h4>
                      <p className="text-sm text-on-surface-variant flex items-center gap-1 truncate">
                         {store.address || 'Chưa cấu hình địa chỉ'}
                      </p>
                    </div>
                  );
                })}
                {allStores.length === 0 && (
                  <div className="col-span-full py-6 text-center text-on-surface-variant text-sm">
                    Không tìm thấy thông tin cửa hàng nào trên hệ thống.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <PageCard title="Báo cáo doanh thu">
        <FilterPills
          options={[
            { value: 'daily', label: 'Hôm nay' },
            { value: 'monthly', label: 'Theo tháng' },
            { value: 'yearly', label: 'Theo năm' },
          ]}
          value={timeframe}
          onChange={nextTimeframe => { setTimeframe(nextTimeframe); triggerBeep(true); }}
        />

        {/* Three summary tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl bg-tertiary-container text-on-tertiary-container p-4 flex items-center gap-4">
            <Wallet className="w-9 h-9 shrink-0" />
            <div>
              <p className="text-2xl font-bold">{totalRevenue.toLocaleString('vi-VN')}</p>
              <p className="text-sm">Doanh thu {timeframeLabel.toLowerCase()}</p>
            </div>
          </div>
          <div className="rounded-xl bg-secondary-container text-on-secondary-container p-4 flex items-center gap-4">
            <ShoppingBag className="w-9 h-9 shrink-0" />
            <div>
              <p className="text-2xl font-bold">{totalOrdersCount}</p>
              <p className="text-sm">Số đơn hàng</p>
            </div>
          </div>
          <div className="rounded-xl bg-primary-container text-on-primary-container p-4 flex items-center gap-4">
            <TrendingUp className="w-9 h-9 shrink-0" />
            <div>
              <p className="text-2xl font-bold">{Math.round(estimatedProfit).toLocaleString('vi-VN')}</p>
              <p className="text-sm">Lợi nhuận ước tính</p>
            </div>
          </div>
        </div>

        {/* Revenue chart */}
        <div className="border border-outline-variant rounded-2xl p-4 space-y-3">
          <h3 className="text-lg font-bold text-on-surface">Biến động doanh thu</h3>
          {maxChartValue === 0 && (
            <p className="text-sm text-on-surface-variant">Chưa có doanh thu trong khoảng này.</p>
          )}
          <div className="h-[220px] w-full flex items-end justify-between gap-3 pt-6 border-b border-outline-variant">
            {chartPoints.map((point, idx) => {
              const percentHeight = maxChartValue > 0 ? Math.max(4, (point.value / maxChartValue) * 100) : 0;
              return (
                <div key={idx} className="flex-1 max-w-24 mx-auto flex flex-col items-center h-full justify-end group relative">
                  <div className="absolute bottom-[calc(100%+4px)] opacity-0 group-hover:opacity-100 transition-opacity bg-on-surface text-surface text-sm font-bold px-2 py-1 rounded-lg shadow pointer-events-none z-10 whitespace-nowrap">
                    {Math.round(point.value).toLocaleString('vi-VN')} đ
                  </div>
                  <div style={{ height: `${percentHeight}%` }} className="w-full bg-primary rounded-t-lg transition-all" />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between gap-3">
            {chartPoints.map((point, idx) => (
              <span key={idx} className="flex-1 max-w-24 mx-auto text-center text-sm font-semibold text-on-surface-variant">{point.label}</span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top best sellers */}
          <div className="border border-outline-variant rounded-2xl p-4 space-y-3">
            <h3 className="text-lg font-bold text-on-surface">Top sản phẩm bán chạy</h3>
            <DataTable
              rows={bestSellers.map((item, idx) => ({ ...item, rank: idx + 1 }))}
              rowKey={item => item.name}
              emptyMessage="Chưa có giao dịch nào được thực hiện để xếp hạng."
              columns={[
                { key: 'rank', header: 'Hạng', className: 'w-16', render: item => item.rank },
                { key: 'name', header: 'Tên món', render: item => <span className="font-semibold">{item.name}</span> },
                { key: 'quantity', header: 'Đã bán', className: 'text-center', render: item => item.quantity },
                { key: 'revenue', header: 'Thành tiền', className: 'text-right', render: item => item.revenue.toLocaleString('vi-VN') },
              ]}
            />
          </div>

          {/* Slow sellers */}
          <div className="border border-outline-variant rounded-2xl p-4 space-y-3">
            <h3 className="text-lg font-bold text-on-surface">Sản phẩm bán chậm / tồn nhiều</h3>
            <DataTable
              rows={worstSellers.map((item, idx) => ({ ...item, rank: idx + 1 }))}
              rowKey={item => item.name}
              emptyMessage="Không tìm thấy dữ liệu tồn đọng."
              columns={[
                { key: 'rank', header: 'Hạng', className: 'w-16', render: item => item.rank },
                { key: 'name', header: 'Tên món', render: item => <span className="font-semibold">{item.name}</span> },
                { key: 'quantity', header: 'Đã bán', className: 'text-center', render: item => item.quantity },
                { key: 'category', header: 'Loại menu', className: 'text-right', render: item => item.category },
              ]}
            />
          </div>
        </div>
      </PageCard>

    </div>
  );
}
