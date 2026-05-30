// frontend/components/Hud.tsx
// Clean card frame: hairline border, subtle rounding, optional header row.
"use client";

import type { ReactNode } from "react";

export function HudFrame({
  children,
  className = "",
  title,
  right,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  right?: ReactNode;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between border-b border-line-soft px-4 py-2">
          {title ? <span className="panel-title">{title}</span> : <span />}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}
