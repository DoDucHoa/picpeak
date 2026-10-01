import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { feedbackService } from '../../../services/feedback.service';
import { useGuestIdentityOptional } from '../../../contexts/GuestIdentityContext';
import { useFeedbackLimitModal } from '../../../hooks/useFeedbackLimitModal';
import { FeedbackIdentityModal } from '../../../components/gallery/FeedbackIdentityModal';
import type { GalleryData, Photo } from '../../../types';

type Kind = 'like' | 'favorite';
const FLAG = { like: 'is_liked', favorite: 'is_favorited' } as const;
const COUNT = { like: 'like_count', favorite: 'favorite_count' } as const;

/**
 * Like and pick for the client gallery. Writes the photos cache in place:
 * invalidating it would refetch every page of a large album on each tap.
 * A second POST of the same type removes it on the server, so the call is
 * the same for on and off.
 */
export function useFeedbackToggle(slug: string, photosKey: unknown[], requireNameEmail: boolean) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const guestIdentity = useGuestIdentityOptional();
  const { modal: limitModal, handleError } = useFeedbackLimitModal();
  const [identity, setIdentity] = useState<{ name: string; email: string } | null>(null);
  const [pending, setPending] = useState<{ photo: Photo; kind: Kind } | null>(null);
  const inFlight = useRef<Set<string>>(new Set());

  const flip = useCallback((photoId: number, kind: Kind, on: boolean) => {
    queryClient.setQueryData(photosKey, (old: GalleryData | undefined) => {
      if (!old) return old;
      return {
        ...old,
        photos: old.photos.map((p) => p.id !== photoId ? p : {
          ...p,
          [FLAG[kind]]: on,
          [COUNT[kind]]: Math.max(0, (p[COUNT[kind]] ?? 0) + (on ? 1 : -1)),
        }),
      };
    });
  }, [queryClient, photosKey]);

  const send = useCallback(async (photo: Photo, kind: Kind, who: { name: string; email: string } | null) => {
    const lockKey = `${photo.id}:${kind}`;
    if (inFlight.current.has(lockKey)) return;
    inFlight.current.add(lockKey);
    // The cache is the truth: a tile or modal may hold a stale photo object.
    const cachedPhoto = queryClient.getQueryData<GalleryData>(photosKey)?.photos.find((p) => p.id === photo.id);
    const wasOn = Boolean((cachedPhoto ?? photo)[FLAG[kind]]);
    flip(photo.id, kind, !wasOn);
    try {
      // The server answers { created: true } or { removed: true }.
      const result = await feedbackService.submitFeedback(slug, String(photo.id), {
        feedback_type: kind,
        guest_name: who?.name || undefined,
        guest_email: who?.email || undefined,
      });
      const serverOn = result?.created ? true : result?.removed ? false : null;
      if (serverOn !== null && serverOn !== !wasOn) flip(photo.id, kind, serverOn);
      if (guestIdentity?.identityMode === 'guest') {
        queryClient.invalidateQueries({ queryKey: ['my-feedback', slug] });
      }
    } catch (error) {
      flip(photo.id, kind, wasOn);
      if (handleError(error)) return;
      toast.error(kind === 'like'
        ? t('feedback.likeError', 'Failed to update like')
        : t('feedback.favoriteError', 'Failed to update favorite'));
    } finally {
      inFlight.current.delete(lockKey);
    }
  }, [flip, slug, photosKey, guestIdentity, queryClient, handleError, t]);

  const toggle = useCallback((photo: Photo, kind: Kind) => {
    if (guestIdentity?.identityMode === 'guest') {
      guestIdentity.ensureIdentity().then(() => send(photo, kind, null), () => {});
      return;
    }
    if (requireNameEmail && !identity) {
      setPending({ photo, kind });
      return;
    }
    void send(photo, kind, identity);
  }, [guestIdentity, requireNameEmail, identity, send]);

  const modals = (
    <>
      <FeedbackIdentityModal
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        onSubmit={(name: string, email: string) => {
          const who = { name, email };
          setIdentity(who);
          if (pending) void send(pending.photo, pending.kind, who);
          setPending(null);
        }}
        feedbackType={pending?.kind === 'like' ? t('feedback.like', 'like') : t('feedback.favorite', 'favorite')}
      />
      {limitModal}
    </>
  );

  return { toggle, modals };
}
