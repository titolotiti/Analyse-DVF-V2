'use client';

import type { AnalysisResult } from '@/lib/types';

interface Props {
  result: AnalysisResult;
  onExport: () => void;
  exportLoading: boolean;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-blue-800">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);
}

export default function AnalysisResults({ result, onExport, exportLoading }: Props) {
  const s = result.stats;

  return (
    <div className="space-y-6 mt-8">

      {/* Avertissements */}
      {result.avertissements.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-1">
          <p className="text-sm font-semibold text-amber-800">Avertissements</p>
          {result.avertissements.map((w, i) => (
            <p key={i} className="text-sm text-amber-700">⚠ {w}</p>
          ))}
        </div>
      )}

      {/* Contexte */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-2">
        <h3 className="font-semibold text-gray-800">Périmètre analysé</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm text-gray-600">
          <div><span className="font-medium">Adresse :</span><br />{result.adresse_analysee}</div>
          <div><span className="font-medium">Commune :</span><br />{result.commune}</div>
          <div><span className="font-medium">Département :</span><br />{result.departement}</div>
          <div><span className="font-medium">Rayon :</span><br />{result.perimetre_m} m</div>
        </div>
        {result.cadastre && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm text-gray-500 pt-2 border-t border-gray-100">
            <div><span className="font-medium">Parcelle :</span> {result.cadastre.id}</div>
            <div><span className="font-medium">Section :</span> {result.cadastre.section}</div>
            <div><span className="font-medium">N° parcelle :</span> {result.cadastre.numero}</div>
          </div>
        )}
        <p className="text-xs text-gray-400 pt-1">
          Méthode : rayon géographique autour de l&apos;adresse géocodée (Haversine) — pas une analyse cadastrale exacte.
        </p>
      </div>

      {/* Stats globales */}
      <div>
        <h3 className="font-semibold text-gray-800 mb-3">Statistiques globales — appartements retenus</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Transactions retenues" value={String(s.count_retenues)} sub={`sur ${s.count_brutes} brutes`} />
          <StatCard label="Prix moyen/m²" value={`${fmt(s.prix_moyen_m2)} €`} />
          <StatCard label="Prix médian/m²" value={`${fmt(s.prix_median_m2)} €`} />
          <StatCard label="Fourchette" value={`${fmt(s.quartile_bas)} – ${fmt(s.quartile_haut)} €`} sub="Q1–Q3" />
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Prix min/m²" value={`${fmt(s.prix_min_m2)} €`} />
          <StatCard label="Prix max/m²" value={`${fmt(s.prix_max_m2)} €`} />
          <StatCard label="Exclues" value={String(s.count_exclues)} sub="non appartement / données manquantes" />
          <StatCard label="À vérifier" value={String(s.count_a_verifier)} sub="ventes complexes / prix atypiques" />
        </div>
      </div>

      {/* Stats par typologie */}
      {result.stats_par_typologie.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-800 mb-3">Prix par typologie</h3>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-blue-800 text-white">
                <tr>
                  {['Typo', 'Nb transactions', 'Surface moy.', 'Prix moyen/m²', 'Prix médian/m²', 'Min', 'Max'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.stats_par_typologie.map((t, i) => (
                  <tr key={t.typologie} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-2 font-semibold text-blue-800">{t.typologie}</td>
                    <td className="px-4 py-2">{t.count}</td>
                    <td className="px-4 py-2">{fmt(t.surface_moyenne)} m²</td>
                    <td className="px-4 py-2 font-medium">{fmt(t.prix_moyen_m2)} €</td>
                    <td className="px-4 py-2">{fmt(t.prix_median_m2)} €</td>
                    <td className="px-4 py-2 text-gray-500">{fmt(t.min_m2)} €</td>
                    <td className="px-4 py-2 text-gray-500">{fmt(t.max_m2)} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transactions retenues (extrait) */}
      {result.transactions_retenues.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-800 mb-3">
            Transactions retenues
            <span className="text-gray-400 font-normal text-sm ml-2">(affichage limité aux 20 premières)</span>
          </h3>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-100 text-gray-600">
                <tr>
                  {['Date', 'Adresse', 'Commune', 'Surface', 'Pièces', 'Valeur foncière', 'Prix/m²', 'Typo', 'Dist.'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.transactions_retenues.slice(0, 20).map((t, i) => (
                  <tr key={`${t.id_mutation}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-1.5 whitespace-nowrap">{t.date_mutation}</td>
                    <td className="px-3 py-1.5">{t.adresse_complete || '—'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{t.nom_commune}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{t.surface_reelle_bati ?? '—'} m²</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{t.nombre_pieces_principales ?? '—'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{t.valeur_fonciere ? `${fmt(t.valeur_fonciere)} €` : '—'}</td>
                    <td className="px-3 py-1.5 font-medium whitespace-nowrap">{t.prix_m2 ? `${fmt(t.prix_m2)} €` : '—'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{t.typologie}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{t.distance_m ? `${Math.round(t.distance_m)} m` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Export Excel */}
      <div className="flex justify-end">
        <button
          onClick={onExport}
          disabled={exportLoading}
          className="flex items-center gap-2 bg-green-700 hover:bg-green-800 disabled:bg-green-300 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
        >
          {exportLoading ? 'Génération…' : 'Télécharger l\'Excel complet'}
        </button>
      </div>
    </div>
  );
}
