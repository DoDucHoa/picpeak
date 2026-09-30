import React from 'react';
import { useTranslation } from 'react-i18next';
import { MarkdownContent } from '../../../../components/common';

type Mode = 'inherit' | 'custom' | 'off';

const PROSE = 'prose prose-sm dark:prose-invert max-w-none text-sm text-body prose-a:text-primary-600 dark:prose-a:text-primary-400';

/**
 * A gallery banner that follows Branding until the event overrides it
 * (spec 6, P4). Inherit shows the global text read-only; opening switches to
 * a custom banner; "use Branding again" returns to inherit.
 */
export const BannerOverride: React.FC<{
  title: string;
  help: string;
  placeholder: string;
  globalMarkdown: string;
  mode: Mode;
  markdown: string;
  onModeChange: (mode: Mode) => void;
  onMarkdownChange: (markdown: string) => void;
  /** Where the custom/off labels live: the promo and info banners each have their own. */
  modeKeyPrefix?: 'events.promoBanner' | 'events.infoBanner';
}> = ({ title, help, placeholder, globalMarkdown, mode, markdown, onModeChange, onMarkdownChange, modeKeyPrefix = 'events.promoBanner' }) => {
  const { t } = useTranslation();
  const hasGlobal = globalMarkdown.trim().length > 0;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-heading">{title}</h3>
      {mode === 'inherit' ? (
        <div className="rounded-lg border border-line p-3 space-y-2">
          <p className="text-xs text-muted">
            {hasGlobal
              ? t('events.bannerOverride.usesGlobal', 'Uses the banner from Branding.')
              : t('events.bannerOverride.noGlobal', 'No banner is set in Branding, so none shows.')}
          </p>
          {hasGlobal && <MarkdownContent source={globalMarkdown} className={PROSE} />}
          <button type="button" className="text-sm font-medium text-accent" onClick={() => onModeChange('custom')}>
            {t('events.bannerOverride.override', 'Override for this event')}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted">{help}</p>
          {(['custom', 'off'] as const).map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm text-body">
              <input type="radio" checked={mode === m} onChange={() => onModeChange(m)} />
              {m === 'custom'
                ? t(`${modeKeyPrefix}.mode_custom`, 'Custom override for this event')
                : t(`${modeKeyPrefix}.mode_off`, 'Off (hide for this event)')}
            </label>
          ))}
          {mode === 'custom' && (
            <>
              <textarea
                value={markdown}
                onChange={(e) => onMarkdownChange(e.target.value)}
                rows={3}
                placeholder={placeholder}
                className="w-full px-3 py-2 border border-line-strong bg-panel text-heading rounded-lg text-sm"
              />
              {markdown.trim() && <MarkdownContent source={markdown} className={PROSE} />}
            </>
          )}
          <button type="button" className="text-sm font-medium text-accent" onClick={() => onModeChange('inherit')}>
            {t('events.bannerOverride.backToGlobal', 'Use the Branding banner again')}
          </button>
        </div>
      )}
    </div>
  );
};
