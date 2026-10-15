// Экран входа (только на живых данных): кнопка Google и понятное объяснение, если аккаунт не пускают.
import { useEffect, useRef } from 'react';
import { auth, useAuth } from '../data/session';

export function Login() {
  const state = useAuth();
  const slot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = slot.current;
    if (!el || !auth) return;
    const a = auth;
    void a.mountButton(el);
    // Одноразовый код входа живёт на сервере 5 мин: обновляем, пока экран открыт и когда мама вернулась во вкладку.
    const tick = () => { if (!document.hidden) a.keepFresh(); };
    const t = window.setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', tick); a.unmountButton(el); };
  }, []);
  return (
    <main className="login">
      <section className="login__card hero" aria-labelledby="login-title">
        <span className="brand__mark login__mark" aria-hidden="true">Б</span>
        <h1 id="login-title" className="login__title">Бухгалтерия <em>рабочий кабинет</em></h1>
        <p className="login__text">Войдите через Google — тем аккаунтом, которому Дмитрий открыл доступ. Пароль от Google сайт не видит.</p>
        <div ref={slot} className="login__button" />
        {state.error && <p className="login__error" role="alert">{state.error}</p>}
      </section>
    </main>
  );
}
