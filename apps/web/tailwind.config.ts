import type { Config } from "tailwindcss";
export default { content: ["./src/**/*.{ts,tsx}", "../../template/**/*.{ts,tsx}"], theme: { extend: { colors: { brand: { 50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 600: "#2563eb", 700: "#1d4ed8" } } } }, plugins: [] } satisfies Config;
