/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';

/**
 * Hàng nút cuộn ngang (thanh cuộn luôn hiển thị), có thể "nắm kéo" bằng chuột (máy tính) — cảm ứng vẫn vuốt như bình thường.
 * Tự chặn cú click ngay sau khi kéo để không bấm nhầm vào nút.
 */
export default function DragScrollRow({ className = '', children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let down = false;
    let moved = false;
    let startX = 0;
    let startScroll = 0;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true;
      moved = false;
      startX = e.clientX;
      startScroll = el.scrollLeft;
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 5) moved = true;
      if (moved) el.scrollLeft = startScroll - dx;
    };
    const onUp = () => { down = false; };
    const onClickCapture = (e: MouseEvent) => {
      if (moved) {
        e.stopPropagation();
        e.preventDefault();
        moved = false;
      }
    };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('click', onClickCapture, true);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  return (
    <div ref={ref} className={`flex min-w-0 overflow-x-auto cursor-grab active:cursor-grabbing select-none ${className}`}>
      {children}
    </div>
  );
}
