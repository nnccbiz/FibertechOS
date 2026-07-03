import type { Config } from 'tailwindcss';

/**
 * Fibertech Design System — Tailwind token layer.
 *
 * Every value here binds a Tailwind utility name to a CSS variable defined in
 * app/globals.css (:root). This layer is ADDITIVE: it introduces new brand
 * utilities (bg-primary, text-navy, rounded-md→6px, shadow-navy, font-mono→Roboto Mono,
 * text-2xl→32px, …) without removing Tailwind's defaults, so existing pages keep
 * their look until each is migrated off hardcoded values.
 *
 * NOTE: `gray-*` (Tailwind default) is intentionally NOT overridden — 1200+ legacy
 * usages span the full 50–900 ramp. The brand neutral ramp is exposed under `neutral-*`
 * as the migration target; migrate `gray-*` → `neutral-*` page by page.
 */
const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ---- Primary brand action = Navy ----
        primary: {
          DEFAULT: 'var(--ft-navy)',
          50: 'var(--ft-navy-50)',
          100: 'var(--ft-navy-100)',
          300: 'var(--ft-navy-300)',
          500: 'var(--ft-navy-500)',
          700: 'var(--ft-navy-700)',
          800: 'var(--ft-navy-800)',
        },
        navy: {
          DEFAULT: 'var(--ft-navy)',
          50: 'var(--ft-navy-50)',
          100: 'var(--ft-navy-100)',
          300: 'var(--ft-navy-300)',
          500: 'var(--ft-navy-500)',
          700: 'var(--ft-navy-700)',
          800: 'var(--ft-navy-800)',
        },
        steel: {
          DEFAULT: 'var(--ft-steel)',
          100: 'var(--ft-steel-100)',
          300: 'var(--ft-steel-300)',
          700: 'var(--ft-steel-700)',
        },
        azure: {
          DEFAULT: 'var(--ft-azure)',
          100: 'var(--ft-azure-100)',
          600: 'var(--ft-azure-600)',
        },
        aqua: 'var(--ft-aqua)',
        ink: 'var(--ft-ink)',

        // ---- Brand neutral ramp (migration target for legacy gray-*) ----
        neutral: {
          50: 'var(--ft-gray-50)',
          100: 'var(--ft-gray-100)',
          200: 'var(--ft-gray-200)',
          300: 'var(--ft-gray-300)',
          400: 'var(--ft-gray-400)',
          500: 'var(--ft-gray-500)',
          700: 'var(--ft-gray-700)',
          900: 'var(--ft-gray-900)',
        },

        // ---- Semantic status (DEFAULT text/icon + soft surface) ----
        success: { DEFAULT: 'var(--ft-success)', soft: 'var(--ft-success-100)' },
        warning: { DEFAULT: 'var(--ft-warning)', soft: 'var(--ft-warning-100)' },
        danger: {
          DEFAULT: 'var(--ft-danger)',
          hover: 'var(--ft-danger-hover)',
          soft: 'var(--ft-danger-100)',
        },
        info: { DEFAULT: 'var(--ft-info)', soft: 'var(--ft-info-100)' },

        // ---- Semantic surface / border / text roles ----
        surface: {
          page: 'var(--surface-page)',
          card: 'var(--surface-card)',
          sunken: 'var(--surface-sunken)',
          navy: 'var(--surface-navy)',
          'navy-deep': 'var(--surface-navy-deep)',
          zebra: 'var(--surface-zebra)',
          selected: 'var(--surface-selected)',
        },
        line: {
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
          navy: 'var(--border-navy)',
          focus: 'var(--border-focus)',
        },
        content: {
          strong: 'var(--text-strong)',
          body: 'var(--text-body)',
          muted: 'var(--text-muted)',
          'on-navy': 'var(--text-on-navy)',
          brand: 'var(--text-brand)',
          link: 'var(--text-link)',
        },
      },

      fontFamily: {
        sans: 'var(--ft-font-sans)',
        display: 'var(--ft-font-display)',
        mono: 'var(--ft-font-mono)',
      },

      fontSize: {
        '3xs': ['var(--fs-3xs)', { lineHeight: 'var(--lh-normal)' }],
        '2xs': ['var(--fs-2xs)', { lineHeight: 'var(--lh-normal)' }],
        xs: ['var(--fs-xs)', { lineHeight: 'var(--lh-normal)' }],
        sm: ['var(--fs-sm)', { lineHeight: 'var(--lh-normal)' }],
        base: ['var(--fs-base)', { lineHeight: 'var(--lh-relaxed)' }],
        md: ['var(--fs-md)', { lineHeight: 'var(--lh-relaxed)' }],
        lg: ['var(--fs-lg)', { lineHeight: 'var(--lh-snug)' }],
        xl: ['var(--fs-xl)', { lineHeight: 'var(--lh-snug)' }],
        '2xl': ['var(--fs-2xl)', { lineHeight: 'var(--lh-snug)' }],
        '3xl': ['var(--fs-3xl)', { lineHeight: 'var(--lh-snug)' }],
        '4xl': ['var(--fs-4xl)', { lineHeight: 'var(--lh-tight)' }],
        '5xl': ['var(--fs-5xl)', { lineHeight: 'var(--lh-tight)' }],
      },

      fontWeight: {
        light: '300',
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
        extrabold: '800',
      },

      letterSpacing: {
        tight: 'var(--ls-tight)',
        normal: 'var(--ls-normal)',
        wide: 'var(--ls-wide)',
        wider: 'var(--ls-wider)',
      },

      lineHeight: {
        tight: 'var(--lh-tight)',
        snug: 'var(--lh-snug)',
        normal: 'var(--lh-normal)',
        relaxed: 'var(--lh-relaxed)',
      },

      borderRadius: {
        none: 'var(--radius-none)',
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        pill: 'var(--radius-pill)',
      },

      borderWidth: {
        bar: 'var(--bw-bar)',
      },

      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        navy: 'var(--shadow-navy)',
        focus: 'var(--focus-ring)',
      },

      maxWidth: {
        container: 'var(--container-max)',
        'container-wide': 'var(--container-wide)',
      },

      transitionTimingFunction: {
        brand: 'var(--ease-out)',
        'brand-inout': 'var(--ease-in-out)',
      },

      transitionDuration: {
        fast: '120ms',
        base: '200ms',
        slow: '360ms',
      },
    },
  },
  plugins: [],
};

export default config;
