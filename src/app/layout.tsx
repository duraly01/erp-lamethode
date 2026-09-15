import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/Providers";

// Inter est servie depuis le dépôt, pas depuis Google Fonts : le build se fait
// sur un poste dont l'accès au réseau n'est pas garanti, et l'hébergeur ne
// compile rien. Une police récupérée au build est un point de rupture de plus.
const inter = localFont({
  src: [
    { path: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "../../node_modules/@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-geist-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LaMethode — ERP Fiscal & Social",
  description:
    "ERP de suivi fiscal, social et documentaire du Cabinet LaMethode SARL : contribuables, déclarations, CNPS, ACF, coffre documentaire.",
};

// Applique le thème (clair/sombre) avant le premier rendu pour éviter le flash.
const themeScript = `(function(){try{var t=localStorage.getItem('lm-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
