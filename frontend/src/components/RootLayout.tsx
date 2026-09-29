import { Outlet } from 'react-router-dom';
import { AnalyticsRouteTracker } from '../services/analytics.service';
import { MaintenanceWrapper } from './MaintenanceWrapper';
import { SkipLink } from './common';
import { PageErrorBoundary } from './common/ErrorBoundary';

/**
 * The layout every route renders in. These three read the location, so under
 * a data router they must sit inside it, as a layout route, rather than
 * between <Router> and <Routes> as before.
 *
 * The boundary around the outlet keeps the app's own error page: without it a
 * route that fails to render (a stale lazy chunk after a deploy) reaches the
 * data router's default boundary, which shows a developer screen.
 */
export function RootLayout() {
  return (
    <>
      <AnalyticsRouteTracker />
      <MaintenanceWrapper>
        <SkipLink />
        <PageErrorBoundary>
          <Outlet />
        </PageErrorBoundary>
      </MaintenanceWrapper>
    </>
  );
}
