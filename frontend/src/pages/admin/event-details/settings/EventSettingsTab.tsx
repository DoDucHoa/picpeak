import React from 'react';
import { useTranslation } from 'react-i18next';
import { SectionRailLayout } from '../../../../components/admin/SectionRailLayout';
import { useEventSettings } from './EventSettingsContext';
import { SECTION_FIELDS, SECTION_ORDER, type SectionId } from './sectionFields';
import { DetailsSection } from './DetailsSection';
import { AccessSection } from './AccessSection';
import { AdvancedSection } from './AdvancedSection';
import { AppearanceSection } from './AppearanceSection';
import { GuestInteractionSection } from './GuestInteractionSection';

const LABELS: Record<SectionId, [string, string]> = {
  details: ['events.settings.sectionDetails', 'Details'],
  access: ['events.settings.sectionAccess', 'Access'],
  appearance: ['events.settings.sectionAppearance', 'Appearance'],
  guests: ['events.settings.sectionGuests', 'Guest interaction'],
  downloads: ['events.settings.sectionDownloads', 'Downloads'],
  advanced: ['events.settings.sectionAdvanced', 'Advanced'],
  extra: ['events.settings.sectionExtra', 'Extra features'],
};

// Tasks 10 to 14 add their section here as they build it.
const SECTIONS: Partial<Record<SectionId, React.FC>> = {
  details: DetailsSection,
  access: AccessSection,
  appearance: AppearanceSection,
  guests: GuestInteractionSection,
  advanced: AdvancedSection,
};

export const useSectionLabel = () => {
  const { t } = useTranslation();
  return (id: SectionId) => t(LABELS[id][0], LABELS[id][1]);
};

export const EventSettingsTab: React.FC<{ section: SectionId; onSection: (id: SectionId) => void }> = ({ section, onSection }) => {
  const { t } = useTranslation();
  const label = useSectionLabel();
  const { draft, readOnly, lockReason, expert, setExpert } = useEventSettings();
  const available = SECTION_ORDER.filter((id) => SECTIONS[id]);
  const active = available.includes(section) ? section : available[0];
  const Active = SECTIONS[active] as React.FC;
  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <label className="flex items-center gap-2 text-sm text-body">
          <input type="checkbox" checked={expert} onChange={(e) => setExpert(e.target.checked)} />
          <span>{t('events.settings.expertMode', 'Expert mode')}</span>
        </label>
      </div>
      {lockReason && <p className="mb-4 rounded-md bg-inset px-3 py-2 text-sm text-body">{lockReason}</p>}
      <SectionRailLayout
        label={t('events.settings.railLabel', 'Event settings')}
        sections={available.map((id) => ({ id, label: label(id), dirty: SECTION_FIELDS[id].some((k) => k in draft.state) }))}
        active={active}
        onSelect={(id) => onSection(id as SectionId)}
      >
        <fieldset disabled={readOnly} className="min-w-0">
          <Active />
        </fieldset>
      </SectionRailLayout>
    </div>
  );
};
