import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/layout/app-shell";
import ThemeProvider from "@/components/layout/theme-provider";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WT Finance",
  description: "Dashboard analítico — Welcome Trips",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full">
        <ThemeProvider />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
