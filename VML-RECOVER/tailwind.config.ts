import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: {
    colors: {
      midnight: "#070D1E", surface: "#101B33", panel: "#162544",
      line: "#22355A", gold: "#D4AF37", goldlight: "#F3E5AB",
      golddim: "#AA8014", success: "#16A34A", danger: "#DC2626",
      warning: "#F59E0B"
    },
    boxShadow: { gold: "0 0 0 1px rgba(212,175,55,.25), 0 12px 40px rgba(0,0,0,.22)" }
  }},
  plugins: []
};
export default config;
