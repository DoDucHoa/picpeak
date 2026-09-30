import React, { useState } from 'react';
import { X, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input } from '../common';

interface SendGalleryEmailDialogProps {
  eventName: string;
  recipient: string;
  requirePassword: boolean;
  /** A copy of the gallery password is stored: the server fills it into the mail (P4). */
  storedPassword?: boolean;
  isSending: boolean;
  onConfirm: (password?: string) => void;
  onClose: () => void;
}

/**
 * Send the gallery email for an already-published gallery (#1235).
 *
 * It asks for the password for the same reason the publish dialog does (#627):
 * `password_hash` is a hash, so the plaintext only exists in the request the
 * admin types it into. Without it the email carries the "(set at creation)"
 * sentinel — and this action is most useful right after a quiet publish, which
 * is exactly the path that never collected a password. An email whose password
 * line reads "(set at creation)" cannot get the customer into the gallery, so
 * asking here is what makes the button do what its label promises.
 *
 * Galleries with no password skip the field entirely — there is nothing to
 * carry, and the email says so.
 *
 * When a copy of the password is stored, the server fills it into the mail
 * (event form redesign P4), so the field shows only on "Use a different
 * password".
 */
export const SendGalleryEmailDialog: React.FC<SendGalleryEmailDialogProps> = ({
  eventName,
  recipient,
  requirePassword,
  storedPassword = false,
  isSending,
  onConfirm,
  onClose,
}) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  // With a stored copy the server fills the password in (P4); the admin types
  // one only to change it.
  const [useDifferent, setUseDifferent] = useState(false);
  const askPassword = requirePassword && (!storedPassword || useDifferent);

  const handleSubmit = () => {
    if (askPassword) {
      if (!password || password.trim().length < 6) {
        setError(t('events.publishDialog.errorMinLength', 'Password must be at least 6 characters long.'));
        return;
      }
    }
    setError(undefined);
    onConfirm(askPassword ? password : undefined);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-heading">
            {t('events.sendGalleryEmail.title', 'Send gallery email')}
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-body"
            aria-label={t('common.close', 'Close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-soft mb-4">
          {t('events.sendGalleryEmail.description', {
            eventName,
            recipient,
            defaultValue: 'Sends the gallery link for "{{eventName}}" to {{recipient}}.',
          })}
        </p>

        {!askPassword && storedPassword && requirePassword && (
          <div className="mb-4 text-sm text-body">
            <p>{t('events.mailPassword.storedNote', 'The email includes the stored gallery password.')}</p>
            <button type="button" className="mt-1 text-accent font-medium" onClick={() => setUseDifferent(true)}>
              {t('events.mailPassword.useDifferent', 'Use a different password')}
            </button>
          </div>
        )}

        {askPassword && (
          <div className="space-y-3 mb-4">
            <Input
              type={showPassword ? 'text' : 'password'}
              label={t('events.publishDialog.passwordLabel', 'Gallery password')}
              placeholder={t('events.publishDialog.passwordPlaceholder', 'Enter the gallery password')}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(undefined);
              }}
              error={error}
              helperText={t(
                'events.sendGalleryEmail.passwordHelp',
                'The email includes this exact text. Re-type the gallery password (or pick a new one) — the backend re-hashes it so the login still works.',
              )}
              leftIcon={<Lock className="w-5 h-5" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1"
                  aria-label={showPassword ? t('events.passwordReset.hide', 'Hide') : t('events.passwordReset.show', 'Show')}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              }
            />
            {storedPassword && (
              <button type="button" className="text-sm text-accent font-medium" onClick={() => setUseDifferent(false)}>
                {t('events.mailPassword.useStored', 'Use the stored password')}
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col-reverse gap-3">
          <Button variant="outline" onClick={onClose} disabled={isSending}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isSending}
            isLoading={isSending}
            leftIcon={<Mail className="w-4 h-4" />}
          >
            {t('events.sendGalleryEmail.button', 'Send gallery email')}
          </Button>
        </div>
      </Card>
    </div>
  );
};
