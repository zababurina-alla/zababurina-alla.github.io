// Экран входа (только на живых данных): кнопка Google и понятное объяснение, если аккаунт не пускают.
import { useEffect, useRef } from 'react';
import { auth, useAuth } from '../data/session';

export function Login() {
  const state = useAuth();
  const slot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (slot.current && auth) void auth.mountButton(slot.current);
  }, []);
  return (
    <main className="login">
      <section className="login__card panel" aria-labelledby="login-title">
        <span className="brand__mark login__mark" aria-hidden="true">Б</span>
        <h1 id="login-title" className="login__title">Бухгалтерия</h1>
        <p className="login__text">Войдите через Google — тем аккаунтом, которому Дмитрий открыл доступ. Пароль от Google сайт не видит.</p>
        <div ref={slot} className="login__button" />
        {state.error && <p className="login__error" role="alert">{state.error}</p>}
      </section>
    </main>
  );
}
