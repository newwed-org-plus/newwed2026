import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores:["dist/**",".next/**","node_modules/**",".wrangler/**",".local-runtime/**","src/types/cloudflare-env.d.ts","tests/visual/baselines/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files:["scripts/**/*.{js,mjs,cjs}"],
    languageOptions:{ globals:{...globals.node} },
  },
  {
    files:["**/*.{ts,tsx}"],
    languageOptions:{ globals:{...globals.browser,...globals.node,...globals.worker} },
    plugins:{ "react-hooks":reactHooks },
    rules:{
      "@typescript-eslint/no-explicit-any":"off",
      "@typescript-eslint/no-unused-vars":["warn",{argsIgnorePattern:"^_",varsIgnorePattern:"^_"}],
      "react-hooks/rules-of-hooks":"error",
      "react-hooks/exhaustive-deps":"warn",
    },
  },
);
