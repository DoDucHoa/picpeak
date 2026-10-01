import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

/**
 * A password shown in clear, with Regenerate and Copy (spec 3, 5.4): the
 * gallery and client passwords on the create screen and in Settings > Access.
 * There is no confirm field, because the value is visible.
 */
export const PasswordField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  onRegenerate: () => void;
  regenerateLabel: string;
  placeholder?: string;
  helperText?: string;
  error?: string;
}> = ({ label, value, onChange, onRegenerate, regenerateLabel, placeholder, helperText, error }) => {
  const { t } = useTranslation();
  const id = useId();
  // The clipboard API is missing over plain HTTP and can be refused, so the
  // old copy command is the fallback, and "Copied" is said only when one of
  // them actually copied: this is a password someone is about to send on.
  const copy = async () => {
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) {
      const area = document.createElement('textarea');
      area.value = value;
      document.body.appendChild(area);
      area.select();
      try { copied = document.execCommand('copy'); } catch { copied = false; }
      document.body.removeChild(area);
    }
    if (copied) toast.success(t('events.access.copied', 'Copied'));
    else toast.error(t('common.copyFailed', 'Could not copy to clipboard'));
  };
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-body mb-1">{label}</label>
      <input
        id={id}
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="w-full px-3 py-2 bg-inset border border-line-strong text-heading rounded-lg text-sm font-mono"
      />
      {helperText && <p className="text-xs text-muted mt-1">{helperText}</p>}
      {error && <p id={`${id}-error`} className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}
      <div className="flex gap-4 mt-2">
        <button type="button" className="text-sm font-medium text-accent" onClick={onRegenerate}>{regenerateLabel}</button>
        <button type="button" className="text-sm font-medium text-accent disabled:opacity-50" disabled={!value} onClick={() => { void copy(); }}>
          {t('events.access.copy', 'Copy')}
        </button>
      </div>
    </div>
  );
};
