/** Responsive protected shell exposes only implemented routes; mobile menu traps focus. */
import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';

import { signOut } from '../api/auth';
import { useConfirmation } from '../components/ConfirmationProvider';
import { confirmWorkspaceExit } from '../components/workspaceExit';
import { FloatingNotice } from '../components/FloatingNotice';
import { PublicLinks } from '../components/PublicLinks';
import { useSession } from '../features/auth/SessionProvider';
import { choirStorageKey, useChoir } from '../features/choirs/ChoirProvider';

const mainLinks = [
  ['/dashboard', 'Home', '⌂'],
  ['/hymns', 'Hymns', '♫'],
  ['/masses', 'Mass plans', '▤'],
  ['/history', 'Mass History', '◷'],
  ['/choirs', 'Choirs', '♧'],
];

export function AppShell() {
  const session = useSession();
  const confirm = useConfirmation();
  const choir = useChoir();
  const [collapsed, setCollapsed] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const settingsLink = ['/settings', 'Settings', '⚙'];

  function desktopLink([path, label, icon]: string[]) {
    return (
      <NavLink
        key={path}
        className={({ isActive }) => `nav-item ${isActive ? 'current' : ''}`}
        to={path}
        aria-label={label}
        title={collapsed ? label : undefined}
      >
        <span className="sidebar-nav-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="sidebar-nav-label">{label}</span>
      </NavLink>
    );
  }

  function mobileLink([path, label]: string[]) {
    return (
      <Dialog.Close asChild key={path}>
        <NavLink className="nav-item" to={path}>
          {label}
        </NavLink>
      </Dialog.Close>
    );
  }

  async function logout() {
    if (!(await confirmWorkspaceExit(confirm))) return;
    setFailure(null);
    setSigningOut(true);
    try {
      await signOut();
      try {
        sessionStorage.removeItem(choirStorageKey(session.user?.id));
      } catch {
        // Storage is optional.
      }
      session.clearSession();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Unable to sign out. Try again.');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className={`app-layout ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="sidebar-brand">
          <button
            className="mark sidebar-toggle"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            aria-controls="desktop-navigation"
            onClick={() => setCollapsed(!collapsed)}
          >
            <span aria-hidden="true">{collapsed ? '›' : '♪'}</span>
          </button>
          <Link className="wordmark sidebar-brand-name" to="/dashboard">
            Choralation
          </Link>
        </div>
        <nav id="desktop-navigation" aria-label="Main">
          <div>{mainLinks.map(desktopLink)}</div>
          <div className="account-nav-group">{desktopLink(settingsLink)}</div>
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
                <Dialog.Content className="dialog-content workspace-menu">
                  <Dialog.Title>Your workspace</Dialog.Title>
                  <Dialog.Description>Navigate your team's shared workspace.</Dialog.Description>
                  <nav aria-label="Mobile">
                    <div>{mainLinks.map(mobileLink)}</div>
                    <div className="account-nav-group">{mobileLink(settingsLink)}</div>
                  </nav>
                  <Dialog.Close className="button secondary">Close menu</Dialog.Close>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
          <label className="choir-selector">
            <span className="sr-only">Active choir</span>
            <select
              aria-label="Active choir"
              value={choir.active?.id ?? ''}
              onChange={(e) => void choir.select(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Choose a choir</option>
              {choir.choirs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="account-controls">
            <span className="account-name" dir="auto">
              {session.user?.username}
            </span>
            <span className="role-badge">
              {session.user?.role !== 'Admin' && session.user?.can_create_choirs
                ? 'Manager'
                : session.user?.role}
            </span>
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
          <FloatingNotice error dismiss={() => setFailure(null)}>
            {failure}
          </FloatingNotice>
        )}
        <main id="main-content" className="page-content" tabIndex={-1}>
          <Outlet />
        </main>
        <PublicLinks />
      </div>
    </div>
  );
}
