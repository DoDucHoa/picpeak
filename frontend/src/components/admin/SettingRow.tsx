import React from 'react';
import clsx from 'clsx';

interface SettingRowProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  /** The control on the right: a switch, a select, a button. */
  control?: React.ReactNode;
  /** Ties a visible label to a native control (a select or an input). */
  htmlFor?: string;
  /**
   * The row is governed by a switch above it that is off. It stays visible
   * with its value, greyed, so turning the switch back on loses nothing.
   */
  muted?: boolean;
  /** Settings that only mean something under this row, indented below it. */
  children?: React.ReactNode;
}

/**
 * One line of a settings list: what it is and what it does on the left, the
 * control on the right. Stacks on a narrow screen.
 */
export const SettingRow: React.FC<SettingRowProps> = ({ label, description, control, htmlFor, muted = false, children }) => {
  const Label = htmlFor ? 'label' : 'p';
  return (
    <div className={clsx('py-4', muted && 'opacity-60')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <Label {...(htmlFor ? { htmlFor } : {})} className="block text-sm font-medium text-heading">{label}</Label>
          {description && <p className="mt-1 text-xs text-muted">{description}</p>}
        </div>
        {control && <div className="shrink-0 sm:pt-0.5">{control}</div>}
      </div>
      {children && <div className="mt-4 space-y-3 border-l-2 border-line pl-4">{children}</div>}
    </div>
  );
};
