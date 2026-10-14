// Простые линейные значки 24×24, свои (без библиотеки). Цвет — currentColor.
import type { ReactNode } from 'react';

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconToday = () => (
  <Svg><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>
);
export const IconClients = () => (
  <Svg><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.6.8 2.6 2.6 3 5.2" /></Svg>
);
export const IconCalendar = () => (
  <Svg><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Svg>
);
export const IconWallet = () => (
  <Svg><path d="M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" /><circle cx="16.5" cy="13.5" r="1.25" /></Svg>
);
export const IconTasks = () => (
  <Svg><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17" /></Svg>
);
export const IconKey = () => (
  <Svg><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.7-8.7M16 7l2.5 2.5M18.5 4.5 21 7" /></Svg>
);
export const IconBook = () => (
  <Svg><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" /><path d="M4 19a2 2 0 0 0 2 2h13" /><path d="M9 8h6" /></Svg>
);
export const IconPlus = () => (
  <Svg><path d="M12 5v14M5 12h14" /></Svg>
);
export const IconSearch = () => (
  <Svg><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></Svg>
);
export const IconCheck = () => (
  <Svg><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>
);
export const IconMore = () => (
  <Svg><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></Svg>
);
export const IconCloud = () => (
  <Svg><path d="M7 18a4.5 4.5 0 1 1 1-8.9A6 6 0 0 1 19.5 11 3.5 3.5 0 0 1 18 18H7Z" /><path d="m9.5 13.5 2 2 3.5-3.5" /></Svg>
);
export const IconPhone = () => (
  <Svg><path d="M5 3h3l2 5-2.5 1.5a11 11 0 0 0 5 5L14 12l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z" /></Svg>
);
export const IconBack = () => (
  <Svg><path d="M15 5l-7 7 7 7" /></Svg>
);
export const IconQuestion = () => (
  <Svg><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M10 9.2a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.4" /><path d="M12 14.2v.1" /></Svg>
);
