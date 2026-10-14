// Счётчик-барабан: каждая цифра — колонка 0…9, сдвигается transform'ом к нужной цифре.
// Меняется только при изменении числа (не на каждой загрузке). Длительность — var(--dur-count), при reduced-motion 0.

export function Odometer({ value, className = '' }: { value: number; className?: string }) {
  const digits = String(Math.max(0, Math.floor(value))).split('');
  return (
    <span className={`odo ${className}`} aria-label={String(value)} role="img">
      {digits.map((d, i) => (
        <span key={digits.length - i} className="odo__col" aria-hidden="true">
          <span className="odo__strip" style={{ transform: `translateY(${-Number(d) * 10}%)` }}>
            {'0123456789'.split('').map((n) => <span key={n}>{n}</span>)}
          </span>
        </span>
      ))}
    </span>
  );
}
