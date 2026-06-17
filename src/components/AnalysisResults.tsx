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
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-gray-800">Périmètre analysé</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm text-gray-600">
          <div><span className="font-medium">Adresse :</span><br />{result.adresse_analysee}</div>
          <div><span className="font-medium">Commune :</span><br />{result.commune}</div>
          <div><span className="font-medium">Département :</span><br />{result.departement}</div>
          <div><span className="font-medium">Rayon initial :</span><br />{result.perimetre_m} m</div>
        </div>

        {result.perimetre_cadastral ? (
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm text-gray-600">
              {result.perimetre_cadastral.parcelle_cible && (
                <>
                  <div><span className="font-medium">Parcelle cible :</span><br />{result.perimetre_cadastral.parcelle_cible.id}</div>
                  <div><span className="font-medium">N° parcelle :</span><br />{result.perimetre_cadastral.parcelle_cible.numero}</div>
                </>
              )}
              <div><span className="font-medium">Section cible :</span><br /><span className="font-mono">{result.perimetre_cadastral.section_cible_complete}</span></div>
              <div><span className="font-medium">Commune cible :</span><br />{result.perimetre_cadastral.code_commune_cible}</div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-700">
                Sections retenues ({result.perimetre_cadastral.sections_autorisees.length})
                <span className="ml-2 font-normal text-gray-400">
                  — filtre distance ≤ {result.perimetre_cadastral.distance_max_section_m} m
                </span>
              </p>
              <div className="overflow-x-auto rounded border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium">Section</th>
                      <th className="px-2 py-1 text-left font-medium">Commune</th>
                      <th className="px-2 py-1 text-right font-medium">Dist. min</th>
                      <th className="px-2 py-1 text-right font-medium">Nb tx DVF</th>
                      <th className="px-2 py-1 text-left font-medium">Raison inclusion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.perimetre_cadastral.sections_autorisees.map((s) => (
                      <tr key={s.cle} className="border-t border-gray-50">
                        <td className="px-2 py-1 font-mono font-semibold">{s.section_complete}</td>
                        <td className="px-2 py-1">{s.nom_commune !== s.code_commune ? s.nom_commune : s.code_commune}</td>
                        <td className="px-2 py-1 text-right">{s.distance_min_m} m</td>
                        <td className="px-2 py-1 text-right">{s.nb_transactions}</td>
                        <td className="px-2 py-1">
                          {s.raison === 'Section cible' && (
                            <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-800 font-medium">Cible</span>
                          )}
                          {s.raison === 'Section voisine (DVF)' && (
                            <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-800">Proche DVF</span>
                          )}
                          {s.raison === 'Forcée manuellement' && (
                            <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-800">Forcée</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {result.perimetre_cadastral.sections_candidates_exclues.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-gray-500 hover:text-gray-700 py-1">
                    {result.perimetre_cadastral.sections_candidates_exclues.length} section(s) candidate(s) non retenues ▾
                  </summary>
                  <div className="overflow-x-auto rounded border border-gray-100 mt-1">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-400">
                        <tr>
                          <th className="px-2 py-1 text-left font-medium">Section</th>
                          <th className="px-2 py-1 text-left font-medium">Commune</th>
                          <th className="px-2 py-1 text-right font-medium">Dist. min</th>
                          <th className="px-2 py-1 text-right font-medium">Nb tx DVF</th>
                          <th className="px-2 py-1 text-left font-medium">Raison exclusion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.perimetre_cadastral.sections_candidates_exclues.map((s) => (
                          <tr key={s.cle} className="border-t border-gray-50 text-gray-500">
                            <td className="px-2 py-1 font-mono">{s.section_complete}</td>
                            <td className="px-2 py-1">{s.nom_commune !== s.code_commune ? s.nom_commune : s.code_commune}</td>
                            <td className="px-2 py-1 text-right">{s.distance_min_m} m</td>
                            <td className="px-2 py-1 text-right">{s.nb_transactions}</td>
                            <td className="px-2 py-1">
                              {s.raison_exclusion === 'Trop éloignée' && (
                                <span className="text-orange-600">Trop éloignée (&gt; {result.perimetre_cadastral!.distance_max_section_m} m)</span>
                              )}
                              {s.raison_exclusion === 'Exclue manuellement' && (
                                <span className="text-red-600">Exclue manuellement</span>
                              )}
                              {s.raison_exclusion === 'Limite dépassée' && (
                                <span className="text-gray-400">Limite sections voisines atteinte</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <span className="font-medium text-green-700">Communes incluses : </span>
                {result.perimetre_cadastral.communes_incluses.map((c) =>
                  c.nom !== c.code ? `${c.nom} (${c.code})` : c.code
                ).join(', ')}
              </div>
              {result.perimetre_cadastral.communes_exclues_du_rayon.length > 0 && (
                <div>
                  <span className="font-medium text-amber-700">Dans le rayon mais non retenues : </span>
                  {result.perimetre_cadastral.communes_exclues_du_rayon.join(', ')}
                </div>
              )}
            </div>

            <p className="text-xs text-gray-400">
              Filtre final : cadastral — <span className="font-mono">id_parcelle.slice(0,10)</span> dans la liste des sections retenues. Le rayon ({result.perimetre_m} m) sert uniquement à détecter les sections candidates via les données DVF.
            </p>
          </div>
        ) : (
          <>
            {result.cadastre && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm text-gray-500 pt-2 border-t border-gray-100">
                <div><span className="font-medium">Parcelle :</span> {result.cadastre.id}</div>
                <div><span className="font-medium">Section :</span> {result.cadastre.section}</div>
                <div><span className="font-medium">N° parcelle :</span> {result.cadastre.numero}</div>
              </div>
            )}
            <p className="text-xs text-gray-400 pt-1">
              Méthode de secours : rayon géographique (Haversine) — API cadastre indisponible.
            </p>
          </>
        )}
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
