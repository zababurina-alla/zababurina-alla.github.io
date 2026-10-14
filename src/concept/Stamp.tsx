// Оттиск штампа «Сдано и оплачено» — главный «запоминающийся» момент направления «Штемпель».
// Двойной круг, надпись по дуге, дата в центре. Цвет — var(--stamp).

export function Stamp({ date }: { date: string }) {
  return (
    <svg className="stamp" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <path id="stamp-arc-top" d="M 20 60 A 40 40 0 0 1 100 60" />
        <path id="stamp-arc-bottom" d="M 16 60 A 44 44 0 0 0 104 60" />
      </defs>
      <circle cx="60" cy="60" r="55" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="60" cy="60" r="47" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text className="stamp__arc">
        <textPath href="#stamp-arc-top" startOffset="50%" textAnchor="middle">СДАНО</textPath>
      </text>
      <text className="stamp__arc">
        <textPath href="#stamp-arc-bottom" startOffset="50%" textAnchor="middle">ОПЛАЧЕНО</textPath>
      </text>
      <text x="60" y="66" textAnchor="middle" className="stamp__date">{date}</text>
    </svg>
  );
}
