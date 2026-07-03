"use client";

import { useRef, type ReactNode, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface GlowCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  glowColor?: string;
}

/**
 * Card com spotlight effect: ponto de luz segue o mouse,
 * glow border ciano no hover, lift suave.
 */
export function GlowCard({
  children,
  className,
  style,
  glowColor = "rgba(6,182,212,0.15)",
}: GlowCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const card = ref.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    card.style.setProperty("--glow-x", `${x}px`);
    card.style.setProperty("--glow-y", `${y}px`);
    card.style.setProperty("--glow-opacity", "1");
  }

  function handleMouseLeave() {
    const card = ref.current;
    if (!card) return;
    card.style.setProperty("--glow-opacity", "0");
  }

  return (
    <div
      ref={ref}
      className={cn("glow-card", className)}
      style={{
        "--glow-color": glowColor,
        "--glow-opacity": "0",
        "--glow-x": "50%",
        "--glow-y": "50%",
        position: "relative",
        ...style,
      } as CSSProperties}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Spotlight layer */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          background: `radial-gradient(300px circle at var(--glow-x) var(--glow-y), var(--glow-color), transparent 70%)`,
          opacity: "var(--glow-opacity)" as unknown as number,
          transition: "opacity 0.3s ease",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}
