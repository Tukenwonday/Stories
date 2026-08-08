export const tokens = {
  colors: {
    bg: "var(--color-bg)",
    bgDeep: "var(--color-bg-deep)",
    surface: "var(--color-surface)",
    surface2: "var(--color-surface-2)",
    surface3: "var(--color-surface-3)",
    border: "var(--color-border)",
    gold: "var(--color-gold)",
    goldSoft: "var(--color-gold-soft)",
    goldWarm: "var(--color-gold-warm)",
    goldMuted: "var(--color-gold-muted)",
    goldGlow: "var(--color-gold-glow)",
    goldGlowLg: "var(--color-gold-glow-lg)",
    foreground: "var(--color-foreground)",
    muted: "var(--color-muted)",
    muted2: "var(--color-muted-2)",
    success: "var(--color-success)",
    warning: "var(--color-warning)",
    danger: "var(--color-danger)",
  },
  radius: {
    sm: "var(--radius-sm)",
    md: "var(--radius-md)",
    lg: "var(--radius-lg)",
    xl: "var(--radius-xl)",
    "2xl": "var(--radius-2xl)",
    full: "9999px",
  },
  shadows: {
    sm: "var(--shadow-sm)",
    md: "var(--shadow-md)",
    lg: "var(--shadow-lg)",
    xl: "var(--shadow-xl)",
    gold: "var(--shadow-gold)",
    goldLg: "var(--shadow-gold-lg)",
  },
  transitions: {
    fast: "var(--transition-fast)",
    base: "var(--transition-base)",
    slow: "var(--transition-slow)",
    spring: "var(--transition-spring)",
  },
  spacing: {
    0: "0",
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    8: "2rem",
    10: "2.5rem",
    12: "3rem",
    16: "4rem",
  },
  typography: {
    fontSans: "var(--font-sans)",
    fontSerif: "var(--font-serif)",
    fontArabic: "var(--font-arabic)",
  },
  breakpoints: {
    sm: "640px",
    md: "768px",
    lg: "1024px",
    xl: "1280px",
    "2xl": "1536px",
  },
  zIndex: {
    base: "0",
    dropdown: "10",
    sticky: "20",
    fixed: "30",
    modalBackdrop: "40",
    modal: "50",
    popover: "60",
    tooltip: "70",
  },
} as const;

export type Tokens = typeof tokens;

export const categoryIcons: Record<string, string> = {
  burgers: "🍔",
  sandwiches: "🥪",
  salads: "🥗",
  appetizers: "🍤",
  mains: "🍖",
  pasta: "🍝",
  pizza: "🍕",
  drinks: "🥤",
  coffee: "☕",
  tea: "🍵",
  juices: "🧃",
  cocktails: "🍸",
  desserts: "🍰",
  cakes: "🎂",
  icecream: "🍦",
  breakfast: "🍳",
  sides: "🍟",
  soups: "🍲",
  seafood: "🦞",
  vegetarian: "🌱",
  vegan: "🌿",
  kids: "🧒",
  specials: "⭐",
  default: "🍽️",
};

export function getCategoryIcon(categoryId: string, categoryLabel?: { en: string; ar: string }): string {
  const id = categoryId.toLowerCase();
  if (categoryIcons[id]) return categoryIcons[id];

  const label = (categoryLabel?.en || "").toLowerCase();
  for (const [key, icon] of Object.entries(categoryIcons)) {
    if (label.includes(key)) return icon;
  }
  return categoryIcons.default;
}

export const motion = {
  stagger: (index: number, baseDelay = 50) => `${index * baseDelay}ms`,
  spring: "cubic-bezier(0.22, 1, 0.36, 1)",
  easeOut: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
  easeInOut: "cubic-bezier(0.42, 0, 0.58, 1)",
};

export const formatCurrency = (amount: number, currency: string, lang: "en" | "ar"): string => {
  const formatted = new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
  return lang === "ar" ? `${formatted} ${currency}` : `${currency} ${formatted}`;
};

export const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(" ");
};