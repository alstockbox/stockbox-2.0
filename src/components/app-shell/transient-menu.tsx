"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function TransientMenu({
  trigger,
  children,
  className = "",
  panelClassName = "",
  ariaLabel,
}: {
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  ariaLabel: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  function canHover() {
    return typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }

  function closeMenu() {
    setOpen(false);
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={`relative ${className}`}
      onMouseEnter={() => {
        if (canHover()) setOpen(true);
      }}
      onMouseLeave={() => {
        if (canHover()) closeMenu();
      }}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeMenu();
      }}
      onClickCapture={(event) => {
        if ((event.target as Element).closest("a")) closeMenu();
      }}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (!canHover()) setOpen((current) => !current);
        }}
        className="contents"
      >
        {trigger}
      </button>
      {open ? (
        <div role="menu" className={panelClassName}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
