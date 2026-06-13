import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// A3 (v4.17.0): guarda da convenção do CLAUDE.md — token CSS em classe Tailwind é
// `[var(--token)]`, NUNCA `[--token]` (forma v3 que o Tailwind 4 compila para CSS
// inválido e descarta a cor em silêncio — raiz da incoerência da v4.16.1). Pega o
// padrão `-[--x]` em strings E template literals (classNames). `[var(--x)]` passa.
const BROKEN_VAR_SHORTHAND = /-\[--[a-z][\w-]*\]/;
const tokenVarShorthandRule = {
  meta: {
    type: "problem",
    docs: { description: "Proíbe o shorthand de var do Tailwind v3 ([--token]); use [var(--token)]." },
    messages: { bad: "Tailwind 4: use `[var(--token)]`, nunca `[--token]` (a cor é descartada silenciosamente)." },
  },
  create(ctx) {
    return {
      Literal(node) {
        if (typeof node.value === "string" && BROKEN_VAR_SHORTHAND.test(node.value)) {
          ctx.report({ node, messageId: "bad" });
        }
      },
      TemplateElement(node) {
        if (node.value && BROKEN_VAR_SHORTHAND.test(node.value.raw)) {
          ctx.report({ node, messageId: "bad" });
        }
      },
    };
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { wt: { rules: { "no-tailwind-var-shorthand": tokenVarShorthandRule } } },
    rules: { "wt/no-tailwind-var-shorthand": "error" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ":USERPROFILE.codexsuperpowers/**",
    ":USERPROFILE.agentsskills/**",
  ]),
]);

export default eslintConfig;
