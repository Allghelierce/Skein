// frontend/components/Hud.tsx
// Reusable angular HUD frame: a straight-edged panel with neon corner brackets
// and an optional tracked header. Keeps every panel visually consistent.
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
      <span className="hud-corner tl" />
      <span className="hud-corner tr" />
      <span className="hud-corner bl" />
      <span className="hud-corner br" />
      {(title || right) && (
        <div className="flex items-center justify-between px-3.5 pt-3">
          {title ? <span className="panel-title">{title}</span> : <span />}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}
