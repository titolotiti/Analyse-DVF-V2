import type { DVFTransaction, Typologie, TransactionStatut } from './types';
import type { RawDVFRow } from './dvf';

const PRIX_M2_MIN = 500;
const PRIX_M2_MAX = 35000;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseFloat2(v: string | undefined): number | null {
  if (!v || v.trim() === '') return null;
  const n = parseFloat(v.replace(',', '.'));
  return isNaN(n) ? null : n;
}

function parseInt2(v: string | undefined): number | null {
  if (!v || v.trim() === '') return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function getTypologie(pieces: number | null): Typologie {
  if (pieces === null) return 'Inconnu';
  if (pieces === 1) return 'T1';
  if (pieces === 2) return 'T2';
  if (pieces === 3) return 'T3';
  if (pieces === 4) return 'T4';
  return 'T5+';
}

function buildAdresseComplete(row: RawDVFRow): string {
  const parts = [
    row.adresse_numero,
    row.adresse_suffixe,
    row.adresse_nom_voie,
    row.code_postal,
    row.nom_commune,
  ].filter(Boolean);
  return parts.join(' ').trim();
}

export interface FilterOptions {
  lat: number;
  lon: number;
  rayonM: number;
  dateDebut: string;
  dateFin: string;
}

export function processRows(rows: RawDVFRow[], opts: FilterOptions): DVFTransaction[] {
  const { lat, lon, rayonM, dateDebut, dateFin } = opts;
  const dateDebutMs = new Date(dateDebut).getTime();
  const dateFinMs = new Date(dateFin).getTime();

  // Pre-filter: date + coords présentes + appartement dans le périmètre
  const inScope = rows.filter((row) => {
    const d = new Date(row.date_mutation).getTime();
    if (isNaN(d) || d < dateDebutMs || d > dateFinMs) return false;
    const rowLat = parseFloat2(row.latitude);
    const rowLon = parseFloat2(row.longitude);
    if (rowLat === null || rowLon === null) return false;
    const dist = haversineMeters(lat, lon, rowLat, rowLon);
    if (dist > rayonM) return false;
    return true;
  });

  // Grouper par id_mutation pour gérer les ventes multi-locaux
  const byMutation = new Map<string, RawDVFRow[]>();
  for (const row of inScope) {
    const key = row.id_mutation;
    if (!byMutation.has(key)) byMutation.set(key, []);
    byMutation.get(key)!.push(row);
  }

  const transactions: DVFTransaction[] = [];

  for (const [, mutRows] of byMutation) {
    const first = mutRows[0];
    const valeurFonciere = parseFloat2(first.valeur_fonciere);
    const nombreLots = parseInt2(first.nombre_lots) ?? 0;
    const lat2 = parseFloat2(first.latitude);
    const lon2 = parseFloat2(first.longitude);
    const distance = lat2 !== null && lon2 !== null
      ? haversineMeters(lat, lon, lat2, lon2)
      : null;

    const typeLocaux = [...new Set(mutRows.map((r) => r.type_local))];
    const appartementsRows = mutRows.filter((r) => r.type_local === 'Appartement');
    const autresRows = mutRows.filter((r) => r.type_local !== 'Appartement');

    const raisons_flag: string[] = [];
    let statut: TransactionStatut = 'retenue';

    if (first.nature_mutation !== 'Vente') {
      raisons_flag.push(`Nature mutation non standard : ${first.nature_mutation}`);
      statut = 'exclue';
    }

    if (appartementsRows.length === 0) {
      // Pas d'appartement dans cette mutation dans ce périmètre
      // On l'inclut quand même dans les brutes mais on l'exclut
      const typeLabel = typeLocaux.join(', ') || 'inconnu';
      raisons_flag.push(`Type de local : ${typeLabel} (non appartement)`);
      statut = 'exclue';
    }

    if (autresRows.length > 0 && appartementsRows.length > 0) {
      const autresTypes = [...new Set(autresRows.map((r) => r.type_local))].join(', ');
      raisons_flag.push(`Vente mixte : appartement + ${autresTypes}`);
      if (statut === 'retenue') statut = 'a_verifier';
    }

    if (appartementsRows.length > 1) {
      raisons_flag.push(`Plusieurs appartements dans la même mutation (${appartementsRows.length})`);
      if (statut === 'retenue') statut = 'a_verifier';
    }

    if (nombreLots > 1) {
      raisons_flag.push(`Mutation multi-lots (${nombreLots} lots)`);
      if (statut === 'retenue') statut = 'a_verifier';
    }

    // Surface et prix/m²
    const surfaceTotale = appartementsRows.reduce((sum, r) => {
      const s = parseFloat2(r.surface_reelle_bati);
      return sum + (s ?? 0);
    }, 0) || null;

    const representatifRow = appartementsRows.length > 0 ? appartementsRows[0] : first;
    const piecesValue = parseInt2(representatifRow.nombre_pieces_principales);

    if (!surfaceTotale || surfaceTotale <= 0) {
      raisons_flag.push('Surface réelle bâtie manquante ou nulle');
      if (statut === 'retenue') statut = 'exclue';
    }

    if (valeurFonciere === null || valeurFonciere <= 0) {
      raisons_flag.push('Valeur foncière manquante ou nulle');
      if (statut === 'retenue') statut = 'exclue';
    }

    let prixM2: number | null = null;
    if (surfaceTotale && surfaceTotale > 0 && valeurFonciere && valeurFonciere > 0) {
      prixM2 = valeurFonciere / surfaceTotale;
      if (prixM2 < PRIX_M2_MIN) {
        raisons_flag.push(`Prix/m² aberrant bas : ${Math.round(prixM2)} €/m²`);
        if (statut === 'retenue') statut = 'a_verifier';
      } else if (prixM2 > PRIX_M2_MAX) {
        raisons_flag.push(`Prix/m² aberrant haut : ${Math.round(prixM2)} €/m²`);
        if (statut === 'retenue') statut = 'a_verifier';
      }
    }

    const sectionCadastrale = first.id_parcelle
      ? first.id_parcelle.slice(5, 10) 
      : '';

    transactions.push({
      id_mutation: first.id_mutation,
      date_mutation: first.date_mutation,
      nature_mutation: first.nature_mutation,
      valeur_fonciere: valeurFonciere,
      adresse_numero: first.adresse_numero,
      adresse_nom_voie: first.adresse_nom_voie,
      code_postal: first.code_postal,
      code_commune: first.code_commune,
      nom_commune: first.nom_commune,
      code_departement: first.code_departement,
      id_parcelle: first.id_parcelle,
      code_section_cadastrale: sectionCadastrale,
      type_local: typeLocaux.join(' + '),
      surface_reelle_bati: surfaceTotale,
      nombre_pieces_principales: piecesValue,
      nombre_lots: nombreLots,
      longitude: lon2,
      latitude: lat2,
      adresse_complete: buildAdresseComplete(first),
      distance_m: distance,
      prix_m2: prixM2,
      typologie: getTypologie(piecesValue),
      statut,
      raisons_flag,
    });
  }

  transactions.sort((a, b) => {
    if (a.distance_m === null) return 1;
    if (b.distance_m === null) return -1;
    return a.distance_m - b.distance_m;
  });

  return transactions;
}
