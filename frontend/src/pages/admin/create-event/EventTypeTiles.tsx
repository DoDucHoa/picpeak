import React from 'react';
import { useTranslation } from 'react-i18next';
import type { EventType } from '../../../services/eventTypes.service';
import type { CreateType } from './createForm';

/** Used when the type catalog cannot be read. */
export const FALLBACK_EVENT_TYPES: CreateType[] = [
  { slug: 'wedding', name: 'Wedding', emoji: '💒', themePreset: 'elegantWedding' },
  { slug: 'birthday', name: 'Birthday', emoji: '🎂', themePreset: 'birthdayFun' },
  { slug: 'corporate', name: 'Corporate', emoji: '🏢', themePreset: 'corporateTimeline' },
  { slug: 'other', name: 'Other', emoji: '📸', themePreset: 'default' },
];

export const toCreateType = (type: EventType): CreateType => ({
  slug: type.slug_prefix, name: type.name, emoji: type.emoji, themePreset: type.theme_preset,
});

/** The event type as tiles (spec 5.5); the type only decides the theme preset. */
export const EventTypeTiles: React.FC<{ types: CreateType[]; value: string; onChange: (slug: string) => void }> = ({ types, value, onChange }) => {
  const { t } = useTranslation();
  return (
    <div role="radiogroup" aria-label={t('events.eventType')}>
      <span className="block text-sm font-medium text-body mb-2">{t('events.eventType')}</span>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {types.map((type) => (
          <button
            key={type.slug}
            type="button"
            role="radio"
            aria-checked={value === type.slug}
            onClick={() => onChange(type.slug)}
            className={`p-4 rounded-lg border-2 transition-all ${value === type.slug ? 'tile-selected' : 'border-line hover:border-line-strong'}`}
          >
            <div className="text-2xl mb-1" aria-hidden>{type.emoji}</div>
            <div className="text-sm font-medium text-heading">{type.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
};
