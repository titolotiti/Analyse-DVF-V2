'use client';

import React, { useState } from 'react';

interface AnalyzeParams {
  adresse: string;
  rayon_m: number;
  date_debut: string;
  date_fin: string;
  distance_max_section_m: number;
  nombre_sections_voisines: number;
  sections_force_include: string[];
  sections_force_exclude: string[];
}

interface Props {
  onSubmit: (params: AnalyzeParams) => void;
  loading: boolean;
}

function parseSectionList(raw: string): { valid: string[]; ambiguous: string[] } {
  const tokens = raw.split(/[,;\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  return {
    valid:     tokens.filter((s) => s.length === 10),
    ambiguous: tokens.filter((s) => s.length === 5),
  };
}

export default function AddressForm({ onSubmit, loading }: Props) {
  const [adresse,           setAdresse]           = useState('');
  const [rayonM,            setRayonM]            = useState(500);
  const [dateDebut,         setDateDebut]          = useState('2024-01-01');
  const [dateFin,           setDateFin]            = useState('2025-12-31');
  const [showAdvanced,      setShowAdvanced]       = useState(false);
  const [distMaxSection,    setDistMaxSection]     = useState(300);
  const [nbSectionsMax,     setNbSectionsMax]      = useState(4);
  const [forceIncludeRaw,   setForceIncludeRaw]   = useState('');
  const [forceExcludeRaw,   setForceExcludeRaw]   = useState('');

  const includeResult = parseSectionList(forceIncludeRaw);
  const excludeResult = parseSectionList(forceExcludeRaw);
  const ambiguousAll  = [...includeResult.ambiguous, ...excludeResult.ambiguous];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!adresse.trim()) return;
    onSubmit({
      adresse:                  adresse.trim(),
      rayon_m:                  rayonM,
      date_debut:               dateDebut,
      date_fin:                 dateFin,
      distance_max_section_m:   distMaxSection,
      nombre_sections_voisines: nbSectionsMax,
      sections_force_include:   includeResult.valid,
      sections_force_exclude:   excludeResult.valid,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
      <h2 className="text-lg font-semibold text-gray-800">Saisir une adresse</h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Adresse complète
        </label>
        <input
          type="text"
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
          placeholder="Ex : 15 rue de la Paix, 75002 Paris"
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Rayon d&apos;analyse</label>
          <select
            value={rayonM}
            onChange={(e) => setRayonM(Number(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={300}>300 m</option>
            <option value={500}>500 m (défaut)</option>
            <option value={750}>750 m</option>
            <option value={1000}>1 000 m</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date début</label>
          <input
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date fin</label>
          <input
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Options avancées */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <span>Options avancées — périmètre cadastral</span>
          <span className="text-gray-400">{showAdvanced ? '▲' : '▼'}</span>
        </button>

        {showAdvanced && (
          <div className="px-4 py-4 space-y-4 bg-white">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Distance max section (m)
                </label>
                <input
                  type="number"
                  min={50}
                  max={1000}
                  step={50}
                  value={distMaxSection}
                  onChange={(e) => setDistMaxSection(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Une section voisine n&apos;est incluse que si au moins une transaction s&apos;y trouve à moins de cette distance de l&apos;adresse.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nb max de sections voisines
                </label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={nbSectionsMax}
                  onChange={(e) => setNbSectionsMax(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Les sections forcées ne comptent pas dans cette limite.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sections à forcer (inclure)
                </label>
                <input
                  type="text"
                  value={forceIncludeRaw}
                  onChange={(e) => setForceIncludeRaw(e.target.value)}
                  placeholder="Ex : 920440000A, 920510000I"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Clé complète 10 caractères (commune + section). Incluses quelle que soit la distance.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sections à forcer (exclure)
                </label>
                <input
                  type="text"
                  value={forceExcludeRaw}
                  onChange={(e) => setForceExcludeRaw(e.target.value)}
                  placeholder="Ex : 920440000B"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Exclues même si elles seraient éligibles automatiquement.
                </p>
              </div>

              {ambiguousAll.length > 0 && (
                <div className="col-span-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                  <strong>Section ambiguë</strong> — utilisez la clé complète (commune + section, 10 caractères) :{' '}
                  {ambiguousAll.map((s) => <code key={s} className="font-mono bg-amber-100 px-1 rounded">{s}</code>).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, ', ', el], [])}
                  <br />
                  Exemple : <code className="font-mono">920440000A</code> au lieu de <code className="font-mono">0000A</code>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Type de bien : <strong>Appartements anciens uniquement</strong> · Source : DVF (data.gouv.fr)
      </p>

      <button
        type="submit"
        disabled={loading || !adresse.trim()}
        className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
      >
        {loading ? 'Analyse en cours…' : 'Lancer l\'analyse'}
      </button>
    </form>
  );
}
