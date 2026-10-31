/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ChevronDown, ChevronUp, LogOut, UserCircle } from 'lucide-react';
import DragScrollRow from './DragScrollRow';

export interface TopNavItem {
  id: string;
  name: string;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
}

interface TopNavBarProps {
  items: TopNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  storeName: string;
  roleLabel: string;
  userName: string;
  clock: string;
  onOpenAccount: () => void;
  onLogout: () => void;
}

/**
 * Thanh menu trên cùng cho màn hình lớn (thay thanh bên): mỗi chức năng là một ô màu có icon + tên,
 * cuộn ngang được (nắm kéo bằng chuột), có nút Thu gọn / Mở rộng.
 */
export default function TopNavBar({
  items, activeId, onSelect, collapsed, onToggleCollapsed, storeName, roleLabel, userName, clock, onOpenAccount, onLogout
}: TopNavBarProps) {
  const brand = (
    <div className="shrink-0 w-44 min-w-0 pr-2">
      <p className="text-base font-black leading-tight truncate" title={storeName}>{storeName}</p>
      <p className="text-sm text-on-surface-variant font-semibold truncate">{roleLabel}</p>
      <p className="text-sm font-mono font-bold text-on-surface-variant">{clock}</p>
      <p className="text-sm text-on-surface-variant/70">Powered by HPB</p>
    </div>
  );

  if (collapsed) {
    return (
      <div className="hidden lg:flex items-center gap-3 px-4 h-14 bg-surface-container-lowest border-b border-outline-variant shrink-0">
        <p className="text-base font-black truncate max-w-[10rem]" title={storeName}>{storeName}</p>
        <DragScrollRow className="flex-1 gap-1.5 items-center">
          {items.map(item => (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`shrink-0 min-h-10 px-3.5 rounded-xl text-sm font-bold whitespace-nowrap cursor-pointer transition-colors ${
                activeId === item.id ? 'text-white' : 'text-on-surface-variant hover:bg-surface-container'
              }`}
              style={activeId === item.id ? { backgroundColor: item.color } : undefined}
            >
              {item.name}
            </button>
          ))}
        </DragScrollRow>
        <span className="font-mono text-sm font-bold text-on-surface-variant">{clock}</span>
        <button onClick={onOpenAccount} className="m3-btn-outlined !min-h-10 !px-3.5 text-sm" title="Chấm công / Đổi mật khẩu">{userName}</button>
        <button onClick={onLogout} className="m3-btn-outlined !min-h-10 !px-3.5 text-sm">Đăng xuất</button>
        <button onClick={onToggleCollapsed} className="m3-icon-btn !w-10 !h-10" title="Mở rộng menu" aria-label="Mở rộng menu">
          <ChevronDown className="w-5 h-5" />
        </button>
      </div>
    );
  }

  const tile = 'shrink-0 w-[92px] h-[88px] rounded-xl text-white flex flex-col items-center justify-center gap-1.5 px-1.5 text-center cursor-pointer transition-transform active:scale-95';

  return (
    <div className="hidden lg:block bg-surface-container-lowest border-b border-outline-variant shrink-0">
      <div className="flex items-center gap-3 px-4 pt-2.5">
        {brand}
        <DragScrollRow className="flex-1 gap-2 py-1 px-1 items-center">
          {items.map(item => {
            const active = activeId === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={`${tile} ${active ? 'ring-[3px] ring-offset-2 ring-on-surface' : 'hover:brightness-110'}`}
                style={{ backgroundColor: item.color }}
                title={item.name}
              >
                <item.Icon className="w-6 h-6" />
                <span className="text-[13px] font-bold leading-tight line-clamp-2">{item.name}</span>
              </button>
            );
          })}
        </DragScrollRow>
        <button onClick={onOpenAccount} className={`${tile} bg-[#6b7280] hover:brightness-110`} title="Chấm công / Đổi mật khẩu">
          <UserCircle className="w-6 h-6" />
          <span className="text-[13px] font-bold leading-tight line-clamp-2">{userName}</span>
        </button>
        <button onClick={onLogout} className={`${tile} bg-[#d9534f] hover:brightness-110`}>
          <LogOut className="w-6 h-6" />
          <span className="text-[13px] font-bold leading-tight">Đăng xuất</span>
        </button>
      </div>
      <div className="flex justify-end px-4 pb-1.5">
        <button onClick={onToggleCollapsed} className="flex items-center gap-1 text-sm font-bold text-on-surface-variant hover:text-on-surface cursor-pointer px-3 py-1 rounded-full border border-outline-variant bg-surface-container-lowest">
          <ChevronUp className="w-4 h-4" /> Thu gọn
        </button>
      </div>
    </div>
  );
}
