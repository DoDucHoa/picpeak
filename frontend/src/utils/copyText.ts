/**
 * Copies text to the clipboard and says whether it worked.
 *
 * The async clipboard API is often missing or refused inside in-app webviews
 * and on plain http, so a failure there falls back to the legacy hidden
 * textarea plus execCommand('copy') path. execCommand signals failure through
 * its return value rather than by throwing, and both are treated the same.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}
