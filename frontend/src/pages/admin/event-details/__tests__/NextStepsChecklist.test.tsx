import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Event } from '../../../../types';
import { NextStepsChecklist } from '../NextStepsChecklist';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')),
  useTranslation: () => ({
    t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : (fb as { defaultValue?: string })?.defaultValue ?? k),
  }),
}));
const allowed = vi.fn((_p: string) => true);
vi.mock('../../../../hooks/usePermission', () => ({ usePermission: (p: string) => allowed(p) }));

const draft = { id: 1, event_name: 'Anna', is_draft: true, is_archived: false, photo_count: 0, header_style: 'standard', hero_photo_id: null } as unknown as Event;
const handlers = () => ({ onUploadPhotos: vi.fn(), onChooseHero: vi.fn(), onPublish: vi.fn() });
const list = () => within(screen.getByRole('region', { name: 'Next steps' }));

describe('NextStepsChecklist (spec 5.6)', () => {
  beforeEach(() => allowed.mockImplementation(() => true));

  it('shows nothing once the event is published or archived', () => {
    const { rerender, container } = render(<NextStepsChecklist event={{ ...draft, is_draft: false }} {...handlers()} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<NextStepsChecklist event={{ ...draft, is_archived: true }} {...handlers()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('asks for photos, then ticks the step from the saved count', () => {
    const h = handlers();
    const { rerender } = render(<NextStepsChecklist event={draft} {...h} />);
    fireEvent.click(list().getByRole('button', { name: 'Upload' }));
    expect(h.onUploadPhotos).toHaveBeenCalled();
    rerender(<NextStepsChecklist event={{ ...draft, photo_count: 12 }} {...h} />);
    expect(list().queryByRole('button', { name: 'Upload' })).toBeNull();
    expect(list().getByText(/\(done\)/)).toBeInTheDocument();
  });

  it('asks for a hero photo only when the header uses one', () => {
    const { rerender } = render(<NextStepsChecklist event={draft} {...handlers()} />);
    expect(list().queryByText('Choose a hero photo')).toBeNull();
    rerender(<NextStepsChecklist event={{ ...draft, header_style: 'hero' }} {...handlers()} />);
    expect(list().getByRole('button', { name: 'Choose' })).toBeInTheDocument();
    rerender(<NextStepsChecklist event={{ ...draft, header_style: 'hero', hero_photo_id: 5 }} {...handlers()} />);
    expect(list().queryByRole('button', { name: 'Choose' })).toBeNull();
  });

  it('publishes through the dialog the page already has', () => {
    const h = handlers();
    render(<NextStepsChecklist event={draft} {...h} />);
    fireEvent.click(list().getByRole('button', { name: 'Publish' }));
    expect(h.onPublish).toHaveBeenCalled();
  });

  it('keeps a step it cannot do, locked, with the reason', () => {
    allowed.mockImplementation((p) => p !== 'photos.upload');
    render(<NextStepsChecklist event={draft} {...handlers()} />);
    expect(list().getByRole('button', { name: 'Upload' })).toBeDisabled();
    expect(list().getByText('Needs photos.upload')).toBeInTheDocument();
  });
});
