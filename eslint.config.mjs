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

// A3 (v4.26, ADR-0129) — operacionaliza o ADR-0103 ("sempre token, nunca hex") com
// ENFORCEMENT. Irmãs da no-tailwind-var-shorthand:
//  (1) classe de cor CRUA do Tailwind (emerald/amber/red/green/blue/yellow) → use o
//      token semântico do DS (text-success / bg-danger-bg / text-warning / bg-action-* …);
//  (2) hex arbitrário em classe (ex.: text-[#BD965C]) → use [var(--token)] ou a utilitária.
// ZINC é PERMITIDO (cinza de UI neutro, tolerado — fora do escopo da v4.26). E o caminho
// src/lib/email/** é ISENTO (hex inline é obrigatório nos clientes de e-mail; ver
// docs/email-layout-guide.md). Pega o padrão em strings E template literals (classNames).
// Limite de início de classe (`(?:^|[\s'"\`:])`) evita falsos-positivos no meio de palavra
// (e permite variantes como hover:/focus:).
const INICIO_CLASSE = "(?:^|[\\s'\"`:])";
const COR_CRUA_TAILWIND = new RegExp(
  INICIO_CLASSE + "(bg|text|border|ring|fill|stroke|from|to|via)-(emerald|amber|red|green|blue|yellow)-\\d{2,3}\\b",
);
const HEX_EM_CLASSE = new RegExp(
  INICIO_CLASSE + "(bg|text|border|ring|fill|stroke|from|to|via)-\\[#[0-9a-fA-F]{3,8}\\]",
);
const corHardcodedRule = {
  meta: {
    type: "problem",
    docs: { description: "Proíbe cor crua do Tailwind e hex em classe; use tokens do DS (ADR-0103/0129)." },
    messages: {
      rawColor: "Cor crua do Tailwind. Use o token do DS (text-success / bg-danger-bg / text-warning / bg-action-* …). ZINC é permitido; src/lib/email é isento.",
      hex: "Hex em classe Tailwind. Use [var(--token)] ou a utilitária do token (ADR-0103/0129).",
    },
  },
  create(ctx) {
    const checar = (node, raw) => {
      if (typeof raw !== "string") return;
      if (COR_CRUA_TAILWIND.test(raw)) ctx.report({ node, messageId: "rawColor" });
      else if (HEX_EM_CLASSE.test(raw)) ctx.report({ node, messageId: "hex" });
    };
    return {
      Literal(node) { checar(node, node.value); },
      TemplateElement(node) { checar(node, node.value && node.value.raw); },
    };
  },
};

const wtPlugin = {
  rules: {
    "no-tailwind-var-shorthand": tokenVarShorthandRule,
    "no-cor-hardcoded": corHardcodedRule,
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { wt: wtPlugin },
    rules: {
      "wt/no-tailwind-var-shorthand": "error",
      "wt/no-cor-hardcoded": "error",
    },
  },
  {
    // E-mail: hex inline é obrigatório (Outlook não resolve CSS var) → isenta a regra de cor.
    files: ["src/lib/email/**/*.{ts,tsx}"],
    plugins: { wt: wtPlugin },
    rules: { "wt/no-cor-hardcoded": "off" },
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
