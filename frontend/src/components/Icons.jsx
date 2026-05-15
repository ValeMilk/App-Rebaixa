// Ícones SVG inline (sem dependência externa). Stroke 2, herda currentColor.
function Base({ children, className = "w-6 h-6" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {children}
    </svg>
  );
}

export const IcoStore = (p) => (
  <Base {...p}>
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
    <path d="M9 21V12h6v9" />
  </Base>
);

export const IcoClipboard = (p) => (
  <Base {...p}>
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
    <rect x="9" y="3" width="6" height="4" rx="1" />
    <path d="M9 12h6M9 16h4" />
  </Base>
);

export const IcoGrid = (p) => (
  <Base {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </Base>
);

export const IcoSync = (p) => (
  <Base {...p}>
    <path d="M4 4v5h5M20 20v-5h-5" />
    <path d="M20 9A8 8 0 006.93 5.07M4 15a8 8 0 0013.07 3.93" />
  </Base>
);

export const IcoUser = (p) => (
  <Base {...p}>
    <circle cx="12" cy="7" r="4" />
    <path d="M4 21c0-4 3.58-7 8-7s8 3 8 7" />
  </Base>
);

export const IcoUsers = (p) => (
  <Base {...p}>
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
  </Base>
);

export const IcoSearch = (p) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </Base>
);

export const IcoFilter = (p) => (
  <Base {...p}>
    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
  </Base>
);

export const IcoChevronDown = (p) => (
  <Base {...p}>
    <path d="M6 9l6 6 6-6" />
  </Base>
);

export const IcoChevronRight = (p) => (
  <Base {...p}>
    <path d="M9 18l6-6-6-6" />
  </Base>
);

export const IcoX = (p) => (
  <Base {...p}>
    <path d="M18 6L6 18M6 6l12 12" />
  </Base>
);

export const IcoCheck = (p) => (
  <Base {...p}>
    <path d="M20 6L9 17l-5-5" />
  </Base>
);

export const IcoAlert = (p) => (
  <Base {...p}>
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </Base>
);

export const IcoClock = (p) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Base>
);

export const IcoCalendar = (p) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </Base>
);

export const IcoTag = (p) => (
  <Base {...p}>
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </Base>
);

export const IcoTrendDown = (p) => (
  <Base {...p}>
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
    <polyline points="17 18 23 18 23 12" />
  </Base>
);

export const IcoLogout = (p) => (
  <Base {...p}>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </Base>
);

export const IcoLock = (p) => (
  <Base {...p}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </Base>
);

export const IcoPackage = (p) => (
  <Base {...p}>
    <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </Base>
);

export const IcoChart = (p) => (
  <Base {...p}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </Base>
);
