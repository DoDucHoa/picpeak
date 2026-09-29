import { Outlet } from 'react-router-dom';
import { AnalyticsRouteTracker } from '../services/analytics.service';
import { MaintenanceWrapper } from './MaintenanceWrapper';
import { SkipLink } from './common';

/**
 * The layout every route renders in. These three read the location, so under
 * a data router they must sit inside it, as a layout route, rather than
 * between <Router> and <Routes> as before.
 */
export function RootLayout() {
  return (
    <>
      <AnalyticsRouteTracker />
      <MaintenanceWrapper>
        <SkipLink />
        <Outlet />
      </MaintenanceWrapper>
    </>
  );
}
