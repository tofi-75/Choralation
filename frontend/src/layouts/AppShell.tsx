/** Responsive protected shell exposes only implemented routes; mobile menu traps focus. */
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';

import { signOut } from '../api/auth';
import { useConfirmation } from '../components/ConfirmationProvider';
import { confirmWorkspaceExit } from '../components/workspaceExit';
import { FloatingNotice } from '../components/FloatingNotice';
import { PublicLinks } from '../components/PublicLinks';
import { MaintenanceBanner } from '../components/Maintenance';
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
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const role =
    session.user?.role !== 'Admin' && session.user?.can_create_choirs
      ? 'Choirmaster'
      : session.user?.role;

  function closeAccountMenu(restoreFocus = false) {
    const menu = accountMenu.current;
    if (!menu) return;
    menu.open = false;
    if (restoreFocus) menu.querySelector('summary')?.focus();
  }

  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !accountMenu.current?.contains(event.target))
        closeAccountMenu();
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);

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
              <Dialog.Trigger className="button secondary icon-button" aria-label="Menu">
                <svg
                  aria-hidden="true"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </Dialog.Trigger>
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
          <details
            className="account-controls"
            ref={accountMenu}
            onBlur={(event) => {
              if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget))
                event.currentTarget.open = false;
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && event.currentTarget.open) {
                event.stopPropagation();
                closeAccountMenu(true);
              }
            }}
          >
            <summary className="account-trigger">
              <span className="account-avatar" aria-hidden="true">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                >
                  <circle cx="12" cy="8" r="3" />
                  <path d="M5.5 20v-1a6.5 6.5 0 0 1 13 0v1" />
                </svg>
              </span>
              <span className="account-name" dir="auto">
                {session.user?.username}
              </span>
              <span className="role-badge">{role}</span>
              <span className="sr-only">Account menu</span>
            </summary>
            <div className="account-dropdown">
              <Link to="/settings?tab=account" onClick={() => closeAccountMenu()}>
                Account settings
              </Link>
              <button
                type="button"
                onClick={() => {
                  closeAccountMenu(true);
                  void logout();
                }}
                disabled={signingOut}
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </details>
        </header>
        {failure && (
          <FloatingNotice error dismiss={() => setFailure(null)}>
            {failure}
          </FloatingNotice>
        )}
        <main id="main-content" className="page-content" tabIndex={-1}>
          <MaintenanceBanner />
          <Outlet />
        </main>
        <PublicLinks />
      </div>
    </div>
  );
}
