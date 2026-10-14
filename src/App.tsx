import { useRoute } from './router';

export function App() {
  const route = useRoute();
  return (
    <main>
      <h1>Кабинет</h1>
      <p>Каркас. Экран: {route.name}</p>
    </main>
  );
}
