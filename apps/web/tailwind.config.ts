import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        wine: "#6A1F2B",
        gold: "#C7A56A",
        ivory: "#F8F5F1",
        ink: "#1F1A17"
      },
      fontFamily: {
        serif: ["'Cormorant Garamond'", "serif"],
        sans: ["'Manrope'", "sans-serif"]
      },
      boxShadow: {
        luxe: "0 10px 35px -20px rgba(106, 31, 43, 0.45)"
      }
    }
  },
  plugins: []
};

export default config;
