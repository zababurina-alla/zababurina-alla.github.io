import { useMemo, useState } from 'react';
import { StoreProvider } from './data/store';
import { useRoute } from './router';
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

function Screens() {
  const route = useRoute();
  const [payFor, setPayFor] = useState<{ open: boolean; clientId: string | null }>({ open: false, clientId: null });
  const [addOpen, setAddOpen] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);

  const ui = useMemo<UiApi>(() => ({
    openPayment: (id) => setPayFor({ open: true, clientId: id ?? null }),
    openAddClient: () => setAddOpen(true),
    openClient: (id) => setClientId(id),
  }), []);

  return (
    <UiCtx.Provider value={ui}>
      <Shell route={route.name}>
        {route.name === 'today' && <Today />}
        {route.name === 'clients' && <Clients focusSearch={route.params[0] === 'search'} />}
        {route.name === 'deadlines' && <Deadlines />}
        {route.name === 'payments' && <Payments />}
        {route.name === 'tasks' && <Tasks />}
        {route.name === 'keys' && <Keys />}
        {route.name === 'reference' && <Reference />}
        {route.name === 'more' && <More />}
      </Shell>
      <ClientPanel id={clientId} onClose={() => setClientId(null)} />
      <PaymentDialog open={payFor.open} clientId={payFor.clientId} onClose={() => setPayFor((p) => ({ ...p, open: false }))} />
      <AddClientDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </UiCtx.Provider>
  );
}

export function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <Screens />
      </ToastProvider>
    </StoreProvider>
  );
}
