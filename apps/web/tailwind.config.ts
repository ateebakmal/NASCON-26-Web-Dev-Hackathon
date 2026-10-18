import type { Config } from "tailwindcss";

// Tokens sourced from the "Enterprise" design skill (typeui.sh,
// bergside/awesome-design-skills) -- dark cloud-platform aesthetic for
// productivity dashboards. See src/design-system/tokens.css for the raw
// CSS variable definitions this config reads through.
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "rgb(var(--color-primary) / <alpha-value>)",
        secondary: "rgb(var(--color-secondary) / <alpha-value>)",
        success: "rgb(var(--color-success) / <alpha-value>)",
        warning: "rgb(var(--color-warning) / <alpha-value>)",
        danger: "rgb(var(--color-danger) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        text: "rgb(var(--color-text) / <alpha-value>)",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
      },
      fontSize: {
        xs: "12px",
        sm: "14px",
        base: "16px",
        lg: "20px",
        xl: "24px",
        "2xl": "32px",
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
      },
      // Not overriding the spacing scale: Tailwind's default scale is
      // already 4px-based, so sticking to even-numbered utilities (p-2=8px,
      // p-4=16px, p-6=24px, p-8=32px, ...) satisfies the 8pt baseline grid
      // without remapping p-4/gap-2/etc away from their familiar meaning.
    },
  },
  plugins: [],
} satisfies Config;
