/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X } from 'lucide-react';

/** Hộp thoại dùng chung cho các màn hình quản trị hệ thống (bottom-sheet trên điện thoại). */
export function AdminModal({ title, onClose, children, footer }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={onClose}>
      <div
        className="bg-surface w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-outline-variant max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-outline-variant flex items-center justify-between shrink-0">
          <h3 className="text-lg font-bold text-on-surface">{title}</h3>
          <button onClick={onClose} className="m3-icon-btn" aria-label="Đóng"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-4">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-outline-variant shrink-0 flex gap-2 pb-[calc(0.875rem+env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-bold text-on-surface-variant">{label}</label>
      {children}
      {hint && <p className="text-sm text-on-surface-variant">{hint}</p>}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return message ? <div className="p-3 bg-error-container text-on-error-container text-sm font-semibold rounded-xl">{message}</div> : null;
}
