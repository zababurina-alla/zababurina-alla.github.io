// Эмблема «Бухгалтерии» — раскрытый гроссбух: строки слева, галочка «сдано» справа, пшеничная закладка. Тот же рисунок,
// что на иконке приложения (public/icons, favicon.svg); здесь цвета из токенов плашки (--on-btn, --mark-sea, --mark-wheat).
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span className={`brand__mark ${className}`.trim()} aria-hidden="true">
      <svg viewBox="10 10 80 80" focusable="false">
        <path d="M50 33C42 29 32 28 21 29.5V71.5C32 70 42 71 50 75.5Z" className="brand__tone" />
        <path d="M50 33C58 29 68 28 79 29.5V71.5C68 70 58 71 50 75.5Z" className="brand__tone brand__tone--right" />
        <path d="M65 28.6V41L68.2 38.4L71.4 41V28.8" className="brand__ribbon" />
        <g className="brand__line">
          <path d="M50 33C42 29 32 28 21 29.5V71.5C32 70 42 71 50 75.5C58 71 68 70 79 71.5V29.5C68 28 58 29 50 33Z" />
          <path d="M50 33V75.5" />
          <path className="brand__rules" d="M27 40C33 39.3 39 39.7 44.5 41.2M27 48C33 47.3 39 47.7 44.5 49.2M27 56C33 55.3 39 55.7 44.5 57.2M27 64C33 63.3 38 63.6 42 64.6" />
        </g>
        <path className="brand__check" pathLength={1} d="M56.5 54L62.5 60L73 47" />
      </svg>
    </span>
  );
}
