/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** Vẽ mã QR từ chuỗi nội dung (offline, không gọi dịch vụ ngoài). */
export default function QrCodeImage({ value, size = 240, className = '' }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' })
      .then(url => { if (!cancelled) setSrc(url); })
      .catch(() => { if (!cancelled) setSrc(''); });
    return () => { cancelled = true; };
  }, [value, size]);

  return src
    ? <img src={src} alt="Mã QR chuyển khoản" width={size} height={size} className={className} style={{ imageRendering: 'pixelated' }} />
    : <div style={{ width: size, height: size }} className={`bg-surface-container rounded-lg ${className}`} />;
}
