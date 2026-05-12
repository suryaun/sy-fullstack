import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        wine: "#6A1F2B",
        gold: "#C7A56A",
        ivory: "#F8F5F1",
        ink: "#1F1A17",
        accent: "#6A1F2B",
      },
      fontFamily: {
        serif: ["'Cormorant Garamond'", "Georgia", "serif"],
        sans: ["'Jost'", "system-ui", "sans-serif"]
      },
      fontSize: {
        xs:   ["0.8125rem",  { lineHeight: "1.4" }],   // 13px
        sm:   ["0.9375rem",  { lineHeight: "1.55" }],  // 15px
        base: ["1.0625rem",  { lineHeight: "1.6" }],   // 17px
        lg:   ["1.1875rem",  { lineHeight: "1.5" }],   // 19px
        xl:   ["1.3125rem",  { lineHeight: "1.4" }],   // 21px
        "2xl": ["1.5rem",   { lineHeight: "1.3" }],   // 24px
        "3xl": ["1.875rem", { lineHeight: "1.2" }],   // 30px
        "4xl": ["2.25rem",  { lineHeight: "1.1" }],   // 36px
        "5xl": ["3rem",     { lineHeight: "1.05" }],  // 48px
        "6xl": ["3.75rem",  { lineHeight: "1" }],     // 60px
        "7xl": ["4.5rem",   { lineHeight: "1" }],     // 72px
      },
      boxShadow: {
        luxe: "0 10px 35px -20px rgba(106, 31, 43, 0.45)"
      }
    }
  },
  plugins: []
};

export default config;
