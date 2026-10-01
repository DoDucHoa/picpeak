import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { CheckIcon } from '../icons';

export interface MenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  /** Marks the option currently in force, such as the active sort field. */
  current?: boolean;
  /** Shown but not selectable, such as an action already under way. */
  disabled?: boolean;
}

interface MenuProps {
  /** The trigger's accessible name; also what a compact, icon-only trigger reads as. */
  label: string;
  /** The trigger's visible content: an icon, a text label or both. */
  trigger: React.ReactNode;
  items: MenuItem[];
  triggerClassName?: string;
}

/**
 * A small headless popover menu, no library. Opens below its trigger, closes
 * on a pointerdown outside it, on Escape (focus goes back to the trigger), on
 * a pick, and when Tab moves focus out of it. Up and Down step through the
 * items; plain Tab walks them in DOM order too.
 */
export function Menu({ label, trigger, items, triggerClassName = 'cg-tb-btn' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    // Focus the first item so the keyboard lands inside the menu it opened.
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    if (buttons.length === 0) return;
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    buttons[(at + step + buttons.length) % buttons.length].focus();
  };

  const onBlur = (event: React.FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && !rootRef.current?.contains(next)) setOpen(false);
  };

  return (
    <div className="cg-menu" ref={rootRef} onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {open && (
        <div id={menuId} ref={menuRef} role="menu" aria-label={label} className="cg-menu-list" onKeyDown={onKeyDown}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className="cg-menu-item"
              aria-current={item.current ? 'true' : undefined}
              disabled={item.disabled}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
            >
              <span>{item.label}</span>
              {item.current && <CheckIcon />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
