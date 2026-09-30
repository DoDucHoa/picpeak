import { useQuery } from '@tanstack/react-query';
import { eventTypesService } from '../services/eventTypes.service';

/** The active event type catalog. Same key as the create page, so both share one cache entry. */
export function useActiveEventTypes() {
  return useQuery({
    queryKey: ['event-types', 'active'],
    queryFn: () => eventTypesService.getActiveEventTypes(),
    staleTime: 5 * 60 * 1000,
  });
}
