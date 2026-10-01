import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/common';

interface EventSaveBarProps {
  count: number;
  isSaving: boolean;
  error: string | null;
  changedElsewhere: string[];
  onSave: () => void;
  onDiscard: () => void;
}

/**
 * The one save bar of the event page (spec 5.2). Sticky, so it pads the page
 * by its own height; toasts move above it through data-save-bar on <body>
 * (index.css). Not the shared SettingsSaveBar: that one registers with the
 * sidebar guard, and this page guards at the router instead.
 */
export const EventSaveBar: React.FC<EventSaveBarProps> = ({ count, isSaving, error, changedElsewhere, onSave, onDiscard }) => {
  const { t } = useTranslation();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const visible = count > 0;

  useEffect(() => {
    if (!visible) return undefined;
    document.body.dataset.saveBar = 'on';
    return () => { delete document.body.dataset.saveBar; };
  }, [visible]);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  if (!visible) return null;
  return (
    <section
      role="region"
      aria-label={t('events.saveBar.label', 'Unsaved changes')}
      className="sticky bottom-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 mt-6 px-4 sm:px-6 lg:px-8 py-3 bg-shell border-t border-line"
    >
      {error && (
        <p ref={errorRef} role="alert" tabIndex={-1} className="mb-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {changedElsewhere.length > 0 && (
        <p className="mb-2 text-sm text-amber-700 dark:text-amber-300">
          {t('events.saveBar.changedElsewhere', 'Changed elsewhere since you started: {{sections}}', { sections: changedElsewhere.join(', ') })}
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        <span role="status" aria-live="polite" className="mr-auto text-sm text-body">
          {t('events.saveBar.count', { count })}
        </span>
        <Button variant="outline" onClick={onDiscard} disabled={isSaving}>
          {t('events.saveBar.discard', 'Discard')}
        </Button>
        <Button variant="primary" onClick={onSave} disabled={isSaving} isLoading={isSaving}>
          {t('events.saveBar.save', 'Save')}
        </Button>
      </div>
    </section>
  );
};
