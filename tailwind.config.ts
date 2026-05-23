import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#4F46E5",
        income: "#22C55E",
        expense: "#EF4444",
        canvas: "#F9FAFB"
      }
    }
  },
  plugins: []
};

export default config;

