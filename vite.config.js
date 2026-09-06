import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base מותאם ל-GitHub Pages ומוזרק מתוך ה-workflow
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || "/",
});
