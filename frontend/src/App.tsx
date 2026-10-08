/** Router guards depend on server identity, not client-side role assumptions. */
import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router';

import { ErrorState, LoadingState } from './components/Feedback';
import { useSession } from './features/auth/SessionProvider';
import { AppShell } from './layouts/AppShell';
import { LoginPage } from './pages/LoginPage';
import { WorkspacePage } from './pages/WorkspacePage';

// Load working screens on demand so phone sign-in does not download every editor.
const LibraryPage = lazy(() =>
  import('./pages/LibraryPage').then((module) => ({ default: module.LibraryPage })),
);
const HymnDetailPage = lazy(() =>
  import('./pages/HymnDetailPage').then((module) => ({ default: module.HymnDetailPage })),
);
const HymnFormPage = lazy(() =>
  import('./pages/HymnFormPage').then((module) => ({ default: module.HymnFormPage })),
);
const MassesPage = lazy(() =>
  import('./pages/MassesPage').then((module) => ({ default: module.MassesPage })),
);
const MassPlannerPage = lazy(() =>
  import('./pages/MassPlannerPage').then((module) => ({ default: module.MassPlannerPage })),
);
const MassViewPage = lazy(() =>
  import('./pages/MassViewPage').then((module) => ({ default: module.MassViewPage })),
);

function ProtectedRoute() {
  const session = useSession();
  const location = useLocation();
  if (!session.user)
    return <Navigate to="/login" replace state={{ expired: location.pathname !== '/' }} />;
  return <Outlet />;
}

export function App() {
  const session = useSession();
  if (session.pending) return <LoadingState />;
  if (session.error) return <ErrorState message={session.error.message} retry={session.retry} />;
  return (
    <Suspense fallback={<LoadingState />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<WorkspacePage />} />
            <Route path="/hymns" element={<LibraryPage />} />
            <Route path="/hymns/new" element={<HymnFormPage />} />
            <Route path="/hymns/:id" element={<HymnDetailPage />} />
            <Route path="/hymns/:id/edit" element={<HymnFormPage />} />
            <Route path="/masses" element={<MassesPage />} />
            <Route path="/masses/:id" element={<MassViewPage />} />
            <Route path="/masses/:id/edit" element={<MassPlannerPage />} />
            <Route
              path="*"
              element={
                <section>
                  <h1>Page not found</h1>
                  <p>Return to your workspace using the menu.</p>
                </section>
              }
            />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
