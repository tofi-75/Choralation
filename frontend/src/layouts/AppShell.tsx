/** Responsive protected shell exposes only implemented routes; mobile menu traps focus. */
import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';

import { signOut } from '../api/auth';
import { useSession } from '../features/auth/SessionProvider';

export function AppShell() {
  const session = useSession();
  const [failure, setFailure] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  async function logout() {
    if (!window.dispatchEvent(new Event('choralation:before-signout', { cancelable: true })))
      return;
    setFailure(null);
    setSigningOut(true);
    try {
      await signOut();
      session.clearSession();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Unable to sign out. Try again.');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Workspace navigation">
        <Link className="wordmark" to="/dashboard">
          <span className="mark" aria-hidden="true">
            ♪
          </span>{' '}
          Mass Hymn Picker
        </Link>
        <nav aria-label="Main">
          <NavLink
            className={({ isActive }) => `nav-item ${isActive ? 'current' : ''}`}
            to="/dashboard"
          >
            Your workspace
          </NavLink>
          <NavLink
            className={({ isActive }) => `nav-item ${isActive ? 'current' : ''}`}
            to="/hymns"
          >
            Hymn library
          </NavLink>
          <NavLink
            className={({ isActive }) => `nav-item ${isActive ? 'current' : ''}`}
            to="/masses"
          >
            Mass plans
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <p>Music for every gathering.</p>
          <span className="tiny">Shared by your team.</span>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="mobile-navigation">
            <Dialog.Root>
              <Dialog.Trigger className="button secondary">Menu</Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" />
                <Dialog.Content className="dialog-content">
                  <Dialog.Title>Your workspace</Dialog.Title>
                  <Dialog.Description>Navigate your team's shared workspace.</Dialog.Description>
                  <nav aria-label="Mobile">
                    <Dialog.Close asChild>
                      <Link className="nav-item" to="/masses">
                        Mass plans
                      </Link>
                    </Dialog.Close>
                    <Dialog.Close asChild>
                      <Link className="nav-item" to="/hymns">
                        Hymn library
                      </Link>
                    </Dialog.Close>
                    <Dialog.Close asChild>
                      <Link className="nav-item" to="/dashboard">
                        Your workspace
                      </Link>
                    </Dialog.Close>
                  </nav>
                  <Dialog.Close className="button secondary">Close menu</Dialog.Close>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
          <span className="workspace-label">Team workspace</span>
          <div className="account-controls">
            <span className="account-name" dir="auto">
              {session.user?.username}
            </span>
            <span className="role-badge">{session.user?.role}</span>
            <button
              className="button secondary"
              onClick={() => void logout()}
              disabled={signingOut}
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </header>
        {failure && (
          <p className="notice error shell-error" role="alert">
            {failure}
          </p>
        )}
        <main id="main-content" className="page-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
