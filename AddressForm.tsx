'use client';

import { useState } from 'react';
import AddressForm from '@/components/AddressForm';
import AnalysisResults from '@/components/AnalysisResults';
import type { AnalysisResult } from '@/lib/types';

interface AnalyzeParams {
  adresse: string;
  rayon_m: number;
  date_debut: string;
  date_fin: string;
}

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastParams, setLastParams] = useState<AnalyzeParams | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');

  async function handleAnalyze(params: AnalyzeParams) {
    setLoading(true);
    setError(null);
    setResult(null);
    setLastParams(params);
    setLoadingMessage('Géocodage de l\'adresse…');

    try {
      setTimeout(() => setLoadingMessage('Téléchargement des données DVF (peut prendre ~30s à la première analyse)…'), 1500);

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Erreur lors de l\'analyse.');
        return;
      }

      setResult(data.result as AnalysisResult);
    } catch {
      setError('Impossible de contacter le serveur. Vérifiez votre connexion.');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }

  async function handleExport() {
    if (!lastParams) return;
    setExportLoading(true);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lastParams),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Erreur lors de l\'export Excel.');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : 'dvf_analyse.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Impossible de générer l\'export Excel.');
    } finally {
      setExportLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
        <strong className="text-blue-800">Comment ça marche :</strong> Saisissez une adresse complète.
        L&apos;agent géocode l&apos;adresse, identifie la parcelle cadastrale, puis récupère
        toutes les ventes d&apos;appartements DVF dans le rayon sélectionné.
        La première analyse d&apos;un département télécharge le fichier DVF (~30–60 s) ; les suivantes
        utilisent le cache local.
      </div>

      <AddressForm onSubmit={handleAnalyze} loading={loading} />

      {loading && (
        <div className="flex flex-col items-center gap-3 py-10">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-600">{loadingMessage || 'Analyse en cours…'}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          <strong>Erreur :</strong> {error}
        </div>
      )}

      {result && (
        <AnalysisResults
          result={result}
          onExport={handleExport}
          exportLoading={exportLoading}
        />
      )}
    </div>
  );
}
