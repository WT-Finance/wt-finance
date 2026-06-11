import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/layout/app-shell";
import ThemeProvider from "@/components/layout/theme-provider";
import { getSessao } from "@/lib/auth/sessao";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WT Finance",
  description: "Dashboard analítico — Welcome Group",
  // favicon.ico, icon.svg e apple-icon.png em src/app/ são auto-detectados
  // pelo Next.js 16 — não precisam ser declarados manualmente aqui
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // v4.13 (ADR-0109): sessão + permissões resolvidas no servidor, uma vez por
  // request (React.cache). Sem sessão (ex.: /login), renderiza sem o chrome.
  const sessao = await getSessao();

  return (
    <html
      lang="pt-BR"
      className={`${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full">
        <ThemeProvider />
        {sessao.logado && !sessao.precisaTrocarSenha ? (
          <AppShell
            usuario={{
              nome: sessao.nome,
              email: sessao.email,
              role: sessao.role,
              permissoes: sessao.permissoes,
            }}
          >
            {children}
          </AppShell>
        ) : (
          // Sem chrome: anônimo (login/solicitar) e usuário em troca obrigatória
          // de senha (só vê /trocar-senha em tela cheia).
          children
        )}
      </body>
    </html>
  );
}
