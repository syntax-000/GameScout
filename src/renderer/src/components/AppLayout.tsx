import type { ReactNode } from 'react';
import type { SynchronizationStatus } from '../../../shared/ipc/contracts';
import type { AppRoute } from '../routing';
import { CatalogFreshness } from './CatalogFreshness';

interface AppLayoutProps {
  route: AppRoute;
  version: string;
  synchronization: SynchronizationStatus;
  onNavigate: (route: AppRoute) => void;
  children: ReactNode;
}

const navigation = [
  { label: 'Browse', route: { name: 'browse' } as const },
  { label: 'Favorites', route: { name: 'favorites' } as const },
];

export function AppLayout({
  route,
  version,
  synchronization,
  onNavigate,
  children,
}: AppLayoutProps) {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <button className="app-brand" type="button" onClick={() => onNavigate({ name: 'browse' })}>
          <span className="brand-symbol" aria-hidden="true">
            GS
          </span>
          <span>GameScout</span>
        </button>
        <nav className="primary-nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <button
              key={item.label}
              type="button"
              className={isActive(route, item.route.name) ? 'nav-item active' : 'nav-item'}
              aria-current={isActive(route, item.route.name) ? 'page' : undefined}
              onClick={() => onNavigate(item.route)}
            >
              <span className="nav-icon" aria-hidden="true">
                {item.route.name === 'browse' ? 'B' : 'F'}
              </span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            type="button"
            className="steam-attribution"
            onClick={() => void window.gameScoutDesktop?.openSetupResource('steamTerms')}
          >
            Powered by Steam
          </button>
          <button type="button" className="nav-item" onClick={() => onNavigate({ name: 'setup' })}>
            <span className="nav-icon" aria-hidden="true">
              S
            </span>
            Setup
          </button>
          <span className="version-label">v{version}</span>
        </div>
      </aside>
      <div className="app-workspace">
        <header className="mobile-header">
          <span className="brand-symbol" aria-hidden="true">
            GS
          </span>
          <strong>GameScout</strong>
        </header>
        <main className="page-content">
          {route.name === 'setup' ? null : <CatalogFreshness synchronization={synchronization} />}
          {children}
        </main>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {navigation.map((item) => (
            <button
              key={item.label}
              type="button"
              className={
                isActive(route, item.route.name) ? 'mobile-nav-item active' : 'mobile-nav-item'
              }
              onClick={() => onNavigate(item.route)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

function isActive(route: AppRoute, name: 'browse' | 'favorites'): boolean {
  return route.name === name || (name === 'browse' && route.name === 'details');
}
