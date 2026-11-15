import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Dashboard | BalduTraining — BalduCore',
  description:
    'Ambiente demonstrativo da plataforma esportiva BalduCore. Sem conexão Garmin ativa.',
  robots: { index: false, follow: false },
};
// Preferência visual não contém dados de sessão. Executar antes da pintura evita flash de tema.
const themeScript = `(function(){try{var t=localStorage.getItem('balducore-theme');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch{}})()`;
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
