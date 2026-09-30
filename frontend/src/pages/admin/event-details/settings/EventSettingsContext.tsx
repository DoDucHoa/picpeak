import { createContext, useContext, type SetStateAction } from 'react';
import type { Event } from '../../../../types';
import type { FeedbackSettings } from '../../../../services/feedback.service';
import type { AdminPhoto } from '../../../../services/photos.service';
import type { EnabledTemplate } from '../../../../services/cssTemplates.service';
import type { EditFormState, ThemeDraft } from '../types';
import type { EventDraft } from '../draft/useEventDraft';

export interface EventSettingsValue {
  event: Event;
  editForm: EditFormState;
  setEditForm: (action: SetStateAction<EditFormState>) => void;
  feedbackSettings: FeedbackSettings;
  setFeedbackSettings: (action: SetStateAction<FeedbackSettings>) => void;
  /** The saved feedback settings, for the mode's Custom (spec 5.7). */
  savedFeedbackSettings: FeedbackSettings;
  theme: ThemeDraft;
  setTheme: (fn: (current: ThemeDraft) => ThemeDraft) => void;
  draft: EventDraft;
  readOnly: boolean;
  lockReason: string | null;
  expert: boolean;
  setExpert: (on: boolean) => void;
  refetchEvent: () => void;
  categories: Array<{ id: number; name: string; slug: string; is_folder?: boolean }>;
  /** The global phone field toggle (public settings), shown in Details. */
  phoneFieldEnabled: boolean;
  /** Every photo of the event, unfiltered, for the hero picker. */
  heroPhotos: AdminPhoto[];
  cssTemplates: EnabledTemplate[];
}

export const EventSettingsContext = createContext<EventSettingsValue | null>(null);

export function useEventSettings(): EventSettingsValue {
  const value = useContext(EventSettingsContext);
  if (!value) throw new Error('useEventSettings must be used inside the event Settings tab');
  return value;
}
