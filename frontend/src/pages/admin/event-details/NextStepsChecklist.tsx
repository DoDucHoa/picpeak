import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Circle } from 'lucide-react';
import type { Event } from '../../../types';
import { Card } from '../../../components/common';
import { usePermission } from '../../../hooks/usePermission';

/**
 * "Next steps" on the Overview while the event is a draft (spec 5.6), each
 * ticked from saved data: photos uploaded, a hero photo for the gallery cover,
 * then publish through the page's existing dialog. A step the user may
 * not do stays visible, locked, with the reason (spec 5.3).
 */
export const NextStepsChecklist: React.FC<{
  event: Event;
  onUploadPhotos: () => void;
  onChooseHero: () => void;
  onPublish: () => void;
}> = ({ event, onUploadPhotos, onChooseHero, onPublish }) => {
  const { t } = useTranslation();
  const titleId = useId();
  const canUpload = usePermission('photos.upload');
  const canEdit = usePermission('events.edit');
  if (!event.is_draft || event.is_archived) return null;
  const steps = [
    {
      key: 'photos', done: (event.photo_count ?? 0) > 0, onClick: onUploadPhotos, allowed: canUpload, permission: 'photos.upload',
      label: t('events.nextSteps.uploadPhotos', 'Upload photos'), action: t('events.nextSteps.uploadAction', 'Upload'),
    },
    {
      key: 'hero', done: !!event.hero_photo_id, onClick: onChooseHero, allowed: canEdit, permission: 'events.edit',
      label: t('events.nextSteps.chooseHero', 'Choose a hero photo'), action: t('events.nextSteps.chooseHeroAction', 'Choose'),
    },
    {
      key: 'publish', done: false, onClick: onPublish, allowed: canEdit, permission: 'events.edit',
      label: t('events.nextSteps.publish', 'Publish and send to the client'), action: t('events.nextSteps.publishAction', 'Publish'),
    },
  ];
  return (
    <section aria-labelledby={titleId}>
      <Card padding="md">
        <h2 id={titleId} className="text-lg font-semibold text-heading mb-3">{t('events.nextSteps.title', 'Next steps')}</h2>
        <ol className="space-y-3">
          {steps.map((step) => (
            <li key={step.key} className="flex items-center gap-3">
              {step.done
                ? <CheckCircle aria-hidden className="w-5 h-5 text-green-600 dark:text-green-400" />
                : <Circle aria-hidden className="w-5 h-5 text-muted" />}
              <span className={`flex-1 text-sm ${step.done ? 'text-muted line-through' : 'text-heading'}`}>
                {step.label}
                {step.done && <span className="sr-only"> ({t('events.nextSteps.done', 'done')})</span>}
              </span>
              {!step.done && (
                <span className="flex flex-col items-end">
                  <button
                    type="button"
                    className="text-sm font-medium text-accent disabled:opacity-50"
                    disabled={!step.allowed}
                    aria-disabled={!step.allowed}
                    onClick={step.onClick}
                  >
                    {step.action}
                  </button>
                  {!step.allowed && (
                    <span className="text-xs text-muted">
                      {t('events.nextSteps.needsPermission', { permission: step.permission, defaultValue: `Needs ${step.permission}` })}
                    </span>
                  )}
                </span>
              )}
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
};
