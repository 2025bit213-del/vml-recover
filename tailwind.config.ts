import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        midnight: "#070D1E",
        surface: "#101B33",
        container: "#162544",
        divider: "#22355A",
        gold: {
          DEFAULT: "#D4AF37",
          light: "#F3E5AB",
          dim: "#AA8014"
        },
        success: "#16A34A",
        risk: "#DC2626",
        warning: "#F59E0B"
      },
      boxShadow: {
        gold: "0 0 0 1.5px #D4AF37, 0 18px 40px rgba(0,0,0,0.35)"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Segoe UI", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "Consolas", "monospace"]
      }
    }
  },
  plugins: []
};

export default config;
