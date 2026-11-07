/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConflictBannerProps {
  /** Number of unresolved conflicts. */
  count: number;
  /** Opens the conflicts screen. */
  onOpen: () => void;
}

/**
 * Strip at the top of the app that tells the owner or a manager that synchronisation conflicts wait for a decision.
 * It shows nothing when there are none.
 */
export default function ConflictBanner({ count, onOpen }: ConflictBannerProps) {
  if (count <= 0) return null;
  return (
    <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 bg-error-container text-on-error-container text-sm font-semibold">
      <span className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="truncate">Có {count} xung đột đồng bộ cần xử lý</span>
      </span>
      <button type="button" onClick={onOpen} className="shrink-0 underline underline-offset-2 font-bold cursor-pointer">Xem</button>
    </div>
  );
}
