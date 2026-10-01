import React from 'react';
import { useTranslation } from 'react-i18next';
import { User, Users, Tag } from 'lucide-react';

export type IdentityMode = 'simple' | 'guest' | 'shared';

/**
 * Who a guest is to the gallery's feedback (#1197), the same on the create
 * screen (P5) and in the event's feedback settings.
 */
export const IdentityModeField: React.FC<{ value: IdentityMode | undefined; onChange: (mode: IdentityMode) => void }> = ({ value, onChange }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-body">
        {t('feedback.settings.identityMode', 'Identity Mode')}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label
          className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition ${
            (value || 'simple') === 'simple'
              ? 'border-accent-dark bg-accent-dark/15'
              : 'border-line hover:bg-hover-soft'
          }`}
        >
          <input
            type="radio"
            name="identity_mode"
            value="simple"
            checked={(value || 'simple') === 'simple'}
            onChange={() => onChange('simple')}
            className="mt-0.5 w-4 h-4 text-accent focus:ring-primary-500"
          />
          <User className="w-5 h-5 mt-0.5 text-soft" />
          <div className="flex-1">
            <div className="text-sm font-medium text-heading">
              {t('feedback.settings.identityModeSimple', 'Simple feedback')}
            </div>
            <div className="text-xs text-muted">
              {t(
                'feedback.settings.identityModeSimpleDesc',
                'Anonymous, device-based. All visitors on the same device share state.'
              )}
            </div>
          </div>
        </label>

        <label
          className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition ${
            value === 'guest'
              ? 'border-accent-dark bg-accent-dark/15'
              : 'border-line hover:bg-hover-soft'
          }`}
        >
          <input
            type="radio"
            name="identity_mode"
            value="guest"
            checked={value === 'guest'}
            onChange={() => onChange('guest')}
            className="mt-0.5 w-4 h-4 text-accent focus:ring-primary-500"
          />
          <Users className="w-5 h-5 mt-0.5 text-soft" />
          <div className="flex-1">
            <div className="text-sm font-medium text-heading">
              {t('feedback.settings.identityModeGuest', 'Per-guest selections')}
            </div>
            <div className="text-xs text-muted">
              {t(
                'feedback.settings.identityModeGuestDesc',
                'Each visitor enters their name. Enables per-guest tracking and admin insights.'
              )}
            </div>
          </div>
        </label>

        {/* Shared colour tag (#1197). Deliberately worded around what
            it changes and what it does not: it drops the identity from
            the COLOUR TAG only, and it is the one mode where a guest
            can overwrite someone else's mark, both of which an
            operator has to know before picking it. */}
        <label
          className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition ${
            value === 'shared'
              ? 'border-accent-dark bg-accent-dark/15'
              : 'border-line hover:bg-hover-soft'
          }`}
        >
          <input
            type="radio"
            name="identity_mode"
            value="shared"
            checked={value === 'shared'}
            onChange={() => onChange('shared')}
            className="mt-0.5 w-4 h-4 text-accent focus:ring-primary-500"
          />
          <Tag className="w-5 h-5 mt-0.5 text-soft" />
          <div className="flex-1">
            <div className="text-sm font-medium text-heading">
              {t('feedback.settings.identityModeShared', 'One shared colour tag')}
            </div>
            <div className="text-xs text-muted">
              {t(
                'feedback.settings.identityModeSharedDesc',
                'One colour per photo that everyone sees and anyone can change — for agreeing a single verdict. Likes, ratings and comments stay per-visitor.'
              )}
            </div>
          </div>
        </label>
      </div>

      {value === 'shared' && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {t(
            'feedback.settings.identityModeSharedNote',
            'Colour tags in this mode have no author, so the admin view cannot show who set one. Existing per-visitor colour labels are kept but not shown while this mode is on, and come back if you switch away.'
          )}
        </p>
      )}
    </div>
  );
};
