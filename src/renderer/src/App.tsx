import { useEffect, useState } from 'react';
import type {
  ApplicationStatus,
  DatabaseHealth,
  SettingsStatus,
  SynchronizationStatus,
} from '../../shared/ipc/contracts';
import { AppLayout } from './components/AppLayout';
import { BrowseScreen } from './screens/BrowseScreen';
import { FavoritesScreen } from './screens/FavoritesScreen';
import { GameDetailsScreen } from './screens/GameDetailsScreen';
import { SetupScreen } from './screens/SetupScreen';
import { getRouteFromHash, getStartupRoute, type AppRoute } from './routing';

interface DesktopStatuses {
  application: ApplicationStatus;
  settings: SettingsStatus;
  database: DatabaseHealth;
  synchronization: SynchronizationStatus;
}

export function App() {
  const [statuses, setStatuses] = useState<DesktopStatuses | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [route, setRoute] = useState<AppRoute>(() => getRouteFromHash(window.location.hash));
  const [detailsBackRoute, setDetailsBackRoute] = useState<'browse' | 'favorites'>('browse');

  useEffect(() => {
    const desktopApi = window.gameScoutDesktop;
    if (!desktopApi) {
      setStatusError('Desktop bridge unavailable.');
      return;
    }

    let active = true;
    void Promise.all([
      desktopApi.getApplicationStatus(),
      desktopApi.getSettingsStatus(),
      desktopApi.getDatabaseHealth(),
      desktopApi.getSynchronizationStatus(),
    ])
      .then(([application, settings, database, synchronization]) => {
        if (!active) return;
        const nextStatuses = { application, settings, database, synchronization };
        setStatuses(nextStatuses);
        if (!settings.primaryProviderConfigured || !window.location.hash) {
          navigate(getStartupRoute(nextStatuses));
        }
      })
      .catch(() => {
        if (active) setStatusError('Desktop status unavailable.');
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleHashChange = () => setRoute(getRouteFromHash(window.location.hash));
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (statusError) {
    return <StartupState title="GameScout could not start" detail={statusError} />;
  }
  if (!statuses) {
    return <StartupState title="GameScout" detail="Loading local catalog..." />;
  }

  return (
    <AppLayout
      route={route}
      version={statuses.application.version}
      synchronization={statuses.synchronization}
      onNavigate={navigate}
    >
      {renderRoute(
        route,
        statuses.settings,
        statuses.synchronization,
        (settings) => setStatuses((current) => (current ? { ...current, settings } : current)),
        detailsBackRoute,
        setDetailsBackRoute,
        (synchronization) =>
          setStatuses((current) => (current ? { ...current, synchronization } : current)),
      )}
    </AppLayout>
  );
}

function renderRoute(
  route: AppRoute,
  settings: SettingsStatus,
  synchronization: SynchronizationStatus,
  onConfigured: (settings: SettingsStatus) => void,
  detailsBackRoute: 'browse' | 'favorites',
  setDetailsBackRoute: (route: 'browse' | 'favorites') => void,
  onSynchronizationChanged: (synchronization: SynchronizationStatus) => void,
) {
  switch (route.name) {
    case 'setup':
      return (
        <SetupScreen
          settings={settings}
          onConfigured={onConfigured}
          onContinue={() => navigate({ name: 'browse' })}
        />
      );
    case 'favorites':
      return (
        <FavoritesScreen
          onOpenGame={(gameId) => {
            setDetailsBackRoute('favorites');
            navigate({ name: 'details', gameId });
          }}
        />
      );
    case 'details':
      return (
        <GameDetailsScreen
          gameId={route.gameId}
          onBack={() => navigate({ name: detailsBackRoute })}
          backLabel={detailsBackRoute === 'favorites' ? 'Favorites' : 'Browse'}
        />
      );
    case 'browse':
      return (
        <BrowseScreen
          synchronization={synchronization}
          onSynchronizationChanged={onSynchronizationChanged}
          onOpenGame={(gameId) => {
            setDetailsBackRoute('browse');
            navigate({ name: 'details', gameId });
          }}
        />
      );
  }
}

function navigate(route: AppRoute): void {
  window.location.hash = route.name === 'details' ? `#/games/${route.gameId}` : `#/${route.name}`;
}

function StartupState({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="startup-state">
      <div className="startup-brand" aria-hidden="true">
        GS
      </div>
      <h1>{title}</h1>
      <p role="status">{detail}</p>
    </main>
  );
}
