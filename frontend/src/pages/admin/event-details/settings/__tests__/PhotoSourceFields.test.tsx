import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PhotoSourceFields, type PhotoSourceValues } from '../PhotoSourceFields';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k) }),
}));
const canUpload = vi.fn(() => true);
vi.mock('../../../../../hooks/usePermission', () => ({ usePermission: () => canUpload() }));
vi.mock('../../ExternalFolderPicker', () => ({
  ExternalFolderPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="External folder" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const managed: PhotoSourceValues = { source_mode: 'managed', external_path: '', external_watch: false, photo_cap: 0, default_photo_sort: 'upload_date_desc' };

describe('PhotoSourceFields', () => {
  beforeEach(() => canUpload.mockReturnValue(true));

  it('switching to reference brings back the saved folder', () => {
    const onChange = vi.fn();
    render(<PhotoSourceFields values={managed} onChange={onChange} savedExternalPath="old/folder" />);
    fireEvent.change(screen.getByLabelText('Source Mode'), { target: { value: 'reference' } });
    expect(onChange).toHaveBeenCalledWith({ source_mode: 'reference', external_path: 'old/folder' });
  });

  it('switching back to managed clears the folder', () => {
    const onChange = vi.fn();
    render(<PhotoSourceFields values={{ ...managed, source_mode: 'reference', external_path: 'a' }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Source Mode'), { target: { value: 'managed' } });
    expect(onChange).toHaveBeenCalledWith({ source_mode: 'managed', external_path: '' });
  });

  it('locks the watcher without photos.upload and says why', () => {
    canUpload.mockReturnValue(false);
    render(<PhotoSourceFields values={{ ...managed, source_mode: 'reference', external_path: 'a' }} onChange={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: /Watch folder for new files/ })).toBeDisabled();
    expect(screen.getByText('Requires the permission to upload photos.')).toBeInTheDocument();
  });

  it('reports the folder, the limit and the sort, and shows a folder error', () => {
    const onChange = vi.fn();
    render(<PhotoSourceFields values={{ ...managed, source_mode: 'reference' }} onChange={onChange} folderError="pick one" />);
    fireEvent.change(screen.getByLabelText('External folder'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledWith({ external_path: 'b' });
    fireEvent.change(screen.getByLabelText('Photo Limit'), { target: { value: '25' } });
    expect(onChange).toHaveBeenCalledWith({ photo_cap: 25 });
    fireEvent.change(screen.getByLabelText('Default Photo Sort'), { target: { value: 'filename_asc' } });
    expect(onChange).toHaveBeenCalledWith({ default_photo_sort: 'filename_asc' });
    expect(screen.getByText('pick one')).toBeInTheDocument();
  });
});
