import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PdfAttachmentPreview } from './PdfAttachmentPreview';
vi.mock('./PdfSheet', () => ({
  default: ({ url, onFailure }: { url: string; onFailure: () => void }) => (
    <button onClick={onFailure}>{url}</button>
  ),
}));
afterEach(() => vi.restoreAllMocks());
it('previews replacements, revokes discarded local URLs and restores the original on cancellation', async () => {
  const create = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValueOnce('blob:first')
    .mockReturnValueOnce('blob:second');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const first = new File(['fictional pdf'], 'first.pdf');
  const second = new File(['fictional replacement'], 'second.pdf');
  const view = render(
    <PdfAttachmentPreview file={first} existingUrl="/private-original.pdf" title="Score" />,
  );
  expect(await screen.findByRole('button', { name: 'blob:first' })).toBeVisible();
  view.rerender(
    <PdfAttachmentPreview file={second} existingUrl="/private-original.pdf" title="Score" />,
  );
  expect(await screen.findByRole('button', { name: 'blob:second' })).toBeVisible();
  expect(revoke).toHaveBeenCalledWith('blob:first');
  view.rerender(
    <PdfAttachmentPreview file={null} existingUrl="/private-original.pdf" title="Score" />,
  );
  expect(await screen.findByRole('button', { name: '/private-original.pdf' })).toBeVisible();
  expect(revoke).toHaveBeenCalledWith('blob:second');
  expect(create).toHaveBeenCalledTimes(2);
});
it('explains missing attachments without removing them and allows a replacement preview', async () => {
  const view = render(
    <PdfAttachmentPreview file={null} existingUrl="/missing.pdf" title="Score" />,
  );
  (await screen.findByRole('button', { name: '/missing.pdf' })).click();
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('stays unchanged until you save'),
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:replacement');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  view.rerender(<PdfAttachmentPreview file={new File(['pdf'], 'replacement.pdf')} title="Score" />);
  expect(await screen.findByRole('button', { name: 'blob:replacement' })).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
