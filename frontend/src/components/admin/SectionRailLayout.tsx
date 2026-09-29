import React from 'react';
import { useTranslation } from 'react-i18next';

export interface RailSection { id: string; label: string; dirty?: boolean }

interface SectionRailLayoutProps {
  label: string;
  sections: RailSection[];
  active: string;
  onSelect: (id: string) => void;
  children: React.ReactNode;
}

/**
 * One section at a time with a grouped left rail (spec 5.1): sticky from md
 * up, a native select below. The Settings page's own rail moved into the
 * admin sidebar upstream (2cb6152c), so this is the shared layout now.
 */
export const SectionRailLayout: React.FC<SectionRailLayoutProps> = ({ label, sections, active, onSelect, children }) => {
  const { t } = useTranslation();
  const dot = <span aria-label={t('events.settings.unsaved', 'unsaved changes')} className="ml-2 inline-block h-2 w-2 rounded-full bg-accent" />;
  return (
    <div className="md:flex md:gap-6">
      <select
        className="md:hidden mb-4 w-full px-3 py-2 border border-line-strong rounded-lg bg-panel text-heading"
        value={active}
        onChange={(e) => onSelect(e.target.value)}
        aria-label={label}
      >
        {sections.map((s) => <option key={s.id} value={s.id}>{s.dirty ? `${s.label} *` : s.label}</option>)}
      </select>
      <nav aria-label={label} className="hidden md:block w-56 shrink-0 self-start sticky top-4">
        <ul className="space-y-1">
          {sections.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                aria-current={s.id === active ? 'true' : undefined}
                className={`w-full flex items-center justify-between rounded-md px-3 py-2 text-sm text-left ${
                  s.id === active ? 'bg-inset text-heading font-medium' : 'text-body hover:bg-inset'
                }`}
              >
                <span>{s.label}</span>
                {s.dirty && dot}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
};
