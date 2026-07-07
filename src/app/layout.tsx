import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/layout/app-shell";
import ThemeProvider from "@/components/layout/theme-provider";
import { getSessao } from "@/lib/auth/sessao";
import { getPendencias } from "@/lib/solicitacoes/rpc";
import { SpeedInsights } from "@vercel/speed-insights/next";

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
  // Badge de Solicitações: nº de abertas atribuídas a mim/minha role.
  // v4.39.0 (M3/P2a): NÃO se faz `await` aqui — a PROMISE flui para a Sidebar (Suspense + `use`),
  // FORA do caminho bloqueante do layout. Antes, `await getPendencias()` era um hop serial que
  // atrasava o 1º byte. `.catch(() => null)` torna a falha do badge inofensiva (badge some, app segue).
  const pendenciasPromise: Promise<number | null> = sessao.logado && !sessao.precisaTrocarSenha
    ? getPendencias().catch(() => null) : Promise.resolve(null);

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
              pendenciasPromise,
            }}
          >
            {children}
          </AppShell>
        ) : (
          // Sem chrome: anônimo (login/solicitar) e usuário em troca obrigatória
          // de senha (só vê /trocar-senha em tela cheia).
          children
        )}
        <SpeedInsights />
      </body>
    </html>
  );
}
