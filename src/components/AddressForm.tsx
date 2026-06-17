'use client';

import { useState } from 'react';

interface Props {
  onSubmit: (params: {
    adresse: string;
    rayon_m: number;
    date_debut: string;
    date_fin: string;
  }) => void;
  loading: boolean;
}

export default function AddressForm({ onSubmit, loading }: Props) {
  const [adresse, setAdresse] = useState('');
  const [rayonM, setRayonM] = useState(500);
  const [dateDebut, setDateDebut] = useState('2024-01-01');
  const [dateFin, setDateFin] = useState('2025-12-31');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!adresse.trim()) return;
    onSubmit({ adresse: adresse.trim(), rayon_m: rayonM, date_debut: dateDebut, date_fin: dateFin });
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
