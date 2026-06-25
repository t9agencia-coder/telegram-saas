import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "'Helvetica Neue'", "Arial", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        'card': '0 1px 2px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.15), 0 0 30px -12px rgba(229,9,20,0.04)',
        'card-hover': '0 1px 2px rgba(0,0,0,0.2), 0 6px 20px rgba(0,0,0,0.2), 0 0 40px -10px rgba(229,9,20,0.06)',
        'glow': '0 0 0 1px rgba(255,255,255,0.04), 0 1px 2px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.15), 0 0 40px -12px rgba(229,9,20,0.04)',
        'glow-lg': '0 0 0 1px rgba(255,255,255,0.05), 0 1px 3px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.2), 0 0 50px -10px rgba(229,9,20,0.06)',
        'input-focus': '0 0 0 2px rgba(229,9,20,0.15), 0 0 20px -8px rgba(229,9,20,0.08)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 1px rgba(255,255,255,0.04), 0 1px 2px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.15), 0 0 30px -12px rgba(229,9,20,0.03)" },
          "50%": { boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.15), 0 0 40px -8px rgba(229,9,20,0.08), 0 0 60px -16px rgba(229,9,20,0.04)" },
        },
        "border-rotate": {
          to: { transform: "rotate(360deg)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "glow-pulse": "glow-pulse 6s ease-in-out infinite",
        "border-rotate": "border-rotate 8s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
