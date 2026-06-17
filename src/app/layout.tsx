import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Analyse DVF — Prix immobiliers',
  description: 'Analyse des transactions immobilières DVF par adresse',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <span className="text-2xl font-bold text-blue-800">DVF Analyse</span>
            <span className="text-sm text-gray-500">— Prix de l&apos;ancien par adresse</span>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
        <footer className="text-center text-xs text-gray-400 py-6">
          Sources : Géoplateforme IGN · API Carto IGN · data.gouv.fr (DVF)
        </footer>
      </body>
    </html>
  );
}
