import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Mono } from "next/font/google";
import { WAITING_SCRIPT } from "@/lib/signed-in-hint";
import "./globals.css";

// Fontes do Figma: DM Sans no texto e IBM Plex Mono nos rótulos em caixa alta.
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "NISE",
  description:
    "Núcleo de Incentivo e Suporte para Egressas e Estudantes",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the script below may add an attribute to
    // <html> before React starts.
    <html
      lang="pt-BR"
      className={`${dmSans.variable} ${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/*
          On A01, a browser with the session hint shows the loading screen
          from the first paint (lib/signed-in-hint.ts). It lives here and not
          in the page because the layout is not rebuilt on navigations: React
          never has to create the script in the browser, where it would not run.
        */}
        <script dangerouslySetInnerHTML={{ __html: WAITING_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
