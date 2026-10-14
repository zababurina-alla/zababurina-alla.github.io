import { useMemo, useState } from 'react';
import { StoreProvider, useStore } from './data/store';
import { useRoute, withTransition } from './router';
import { Shell } from './app/Shell';
import { UiCtx } from './app/ui-context';
import type { UiApi } from './app/ui-context';
import { ToastProvider } from './ui/toast';
import { Today } from './screens/Today';
import { Clients } from './screens/Clients';
import { ClientPanel } from './screens/ClientPanel';
import { Deadlines } from './screens/Deadlines';
import { Payments } from './screens/Payments';
import { PaymentDialog } from './screens/PaymentDialog';
import { AddClientDialog } from './screens/AddClientDialog';
import { Keys, More, Reference, Tasks } from './screens/Other';
import { IconGallery } from './screens/IconGallery';
import { Skeleton } from './app/Skeleton';
import { DebugDock } from './app/DebugDock';
import { CommandPalette } from './app/CommandPalette';
import { ConflictDialog, FailureWatcher, OfflineBanner } from './app/SyncUi';
import { Login } from './app/Login';
import { auth, useAuth } from './data/session';
import { ServerDown, ReadOnlyBanner } from './app/SyncUi';
import { canWrite } from './config';
import { roMessage } from './ui/readonly';
import { useToast } from './ui/toast';

function Screens() {
  const route = useRoute();
  const store = useStore();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [payFor, setPayFor] = useState<{ open: boolean; clientId: string | null }>({ open: false, clientId: null });
  const [addOpen, setAddOpen] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);

  const toast = useToast();
  const ui = useMemo<UiApi>(() => ({
    openPayment: (id) => {
      if (!canWrite('payments')) { toast({ text: roMessage('payments') }); return; }
      setPayFor({ open: true, clientId: id ?? null });
    },
    openAddClient: () => {
      if (!canWrite('clients')) { toast({ text: roMessage('clients') }); return; }
      setAddOpen(true);
    },
    openPalette: () => setPaletteOpen(true),
    // Строка → карточка: инициалы из строки перелетают в заголовок карточки, панель выезжает (View Transitions).
    openClient: (id) => {
      const src = [...document.querySelectorAll<HTMLElement>(`[data-client-avatar="${id}"]`)].find((el) => el.getBoundingClientRect().height > 0);
      if (src) src.style.viewTransitionName = 'client-avatar';
      withTransition(() => {
        if (src) src.style.viewTransitionName = '';
        setClientId(id);
      }, src ? 'card' : 'panel');
    },
  }), [toast]);

  return (
    <UiCtx.Provider value={ui}>
      <Shell route={route.name}>
        <OfflineBanner />
        <ReadOnlyBanner />
        {store.loadError && <ServerDown message={store.loadError} onRetry={store.reload} />}
        {!store.loaded && !store.loadError && <Skeleton />}
        {store.loaded && !store.loadError && <>
        {route.name === 'today' && <Today />}
        {route.name === 'clients' && <Clients focusSearch={route.params[0] === 'search'} />}
        {route.name === 'deadlines' && <Deadlines />}
        {route.name === 'payments' && <Payments />}
        {route.name === 'tasks' && <Tasks />}
        {route.name === 'keys' && <Keys />}
        {route.name === 'reference' && <Reference />}
        {route.name === 'more' && <More />}
        {route.name === 'icons' && <IconGallery />}
        </>}
      </Shell>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <DebugDock />
      <ConflictDialog />
      <FailureWatcher />
      <ClientPanel id={clientId} onClose={() => setClientId(null)} />
      <PaymentDialog open={payFor.open} clientId={payFor.clientId} onClose={() => setPayFor((p) => ({ ...p, open: false }))} />
      <AddClientDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </UiCtx.Provider>
  );
}

export function App() {
  const state = useAuth();
  // Живые данные — только после входа: снимок таблицы без сеанса сервер не отдаст.
  if (auth && state.status !== 'signedIn') return <Login />;
  return (
    <StoreProvider>
      <ToastProvider>
        <Screens />
      </ToastProvider>
    </StoreProvider>
  );
}
