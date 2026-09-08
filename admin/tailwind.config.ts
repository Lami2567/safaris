import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#000000",
        surface: "#000000",
        surfaceElevated: "#050505",
        borderSubtle: "rgba(255, 255, 255, 0.08)",
        borderDefault: "rgba(255, 255, 255, 0.15)",
        borderStrong: "rgba(255, 255, 255, 0.3)",
      },
    },
  },
  plugins: [],
};
export default config;
