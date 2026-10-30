/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface PageCardProps {
  /** Optional heading shown at the top of the card. */
  title?: string;
  /** Optional element aligned to the right of the heading (buttons, tabs). */
  headerRight?: React.ReactNode;
  /** Extra classes for the card container. */
  className?: string;
  children: React.ReactNode;
}

/**
 * White rounded card that holds the content of a management screen (list, form, report).
 * Every screen outside the sales view uses it so the layout stays consistent.
 */
export default function PageCard({ title, headerRight, className = '', children }: PageCardProps) {
  return (
    <section className={`bg-surface-container-lowest rounded-3xl border border-outline-variant shadow-sm p-4 lg:p-5 space-y-4 ${className}`}>
      {(title || headerRight) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-xl font-bold text-on-surface">{title}</h2>}
          {headerRight}
        </div>
      )}
      {children}
    </section>
  );
}
