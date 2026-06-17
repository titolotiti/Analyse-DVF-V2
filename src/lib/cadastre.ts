import type { CadastreResult, CadastrePerimetre, SectionAdjacenteInfo, SectionCandidateExclue } from './types';
import type { RawDVFRow } from './dvf';

const APICARTO = 'https://apicarto.ign.fr/api/cadastre';

interface ParcelleProps {
  id?: string;
  idu?: string;
  commune?: string;
  prefixesection?: string;
  section?: string;
  numero?: string;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function tryFetchParcelle(url: string): Promise<ParcelleProps | null> {
  try {
    console.log(`[cadastre] tryFetchParcelle → ${url}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    console.log(`[cadastre] tryFetchParcelle ← HTTP ${res.status}`);
    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      console.log(`[cadastre] tryFetchParcelle error body: ${body.slice(0, 200)}`);
      return null;
    }
    const data = await res.json() as { features?: { properties: ParcelleProps }[] };
    if (!data.features || data.features.length === 0) {
      console.log('[cadastre] tryFetchParcelle: no features in response');
      return null;
    }
    return data.features[0].properties;
  } catch (err) {
    console.log(`[cadastre] tryFetchParcelle exception: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function fetchParcelleAtPoint(
  lat: number,
  lon: number,
  expectedCitycode?: string
): Promise<CadastreResult | null> {
  const geomParam = encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: [lon, lat] }));
  const strategies: Array<{ label: string; url: string }> = [
    { label: 'geom',    url: `${APICARTO}/parcelle?geom=${geomParam}&srid=4326` },
    { label: 'lon/lat', url: `${APICARTO}/parcelle?lon=${lon}&lat=${lat}&srid=4326` },
  ];

  for (const { label, url } of strategies) {
    const props = await tryFetchParcelle(url);
    if (!props) continue;

    const id = props.id || props.idu || '';
    const returnedCitycode = id.slice(0, 5);

    console.log(`[cadastre] fetchParcelleAtPoint (${label}): full props=${JSON.stringify(props)}`);
    console.log(`[cadastre] fetchParcelleAtPoint (${label}): id=${id} returnedCitycode=${returnedCitycode} expectedCitycode=${expectedCitycode}`);

    if (expectedCitycode && returnedCitycode !== expectedCitycode) {
      console.log(`[cadastre] commune mismatch (${label}): returnedCitycode=${returnedCitycode}, expected=${expectedCitycode} — skipping`);
      continue;
    }

    const result: CadastreResult = {
      id,
      section:          props.section || '',
      numero:           props.numero  || '',
      commune:          props.commune || returnedCitycode,
      prefixe_section:  props.prefixesection || '000',
    };

    console.log(`[cadastre] fetchParcelleAtPoint OK (${label}): ${JSON.stringify(result)}`);
    return result;
  }

  if (expectedCitycode) {
    console.log(`[cadastre] all strategies returned wrong commune (expected ${expectedCitycode}) — returning null`);
  }
  return null;
}

export interface CadastreOptions {
  expectedCitycode?: string;
  dvfRows?: RawDVFRow[];
  nombreSectionsVoisines?: number;
  /** Distance max pour l'inclusion automatique d'une section voisine. Défaut 300 m. */
  distanceMaxSectionM?: number;
  /** Codes section_complete (5 chars, ex: "0000A") à forcer dans le périmètre, quelle que soit la distance. */
  sectionsForceInclude?: string[];
  /** Codes section_complete à exclure explicitement, même s'ils seraient éligibles automatiquement. */
  sectionsForceExclude?: string[];
}

export async function getCadastrePerimetre(
  lat: number,
  lon: number,
  rayonM: number,
  opts: CadastreOptions = {}
): Promise<CadastrePerimetre | null> {
  const {
    expectedCitycode,
    dvfRows = [],
    nombreSectionsVoisines = 4,
    distanceMaxSectionM   = 300,
    sectionsForceInclude  = [],
    sectionsForceExclude  = [],
  } = opts;

  console.log(
    `[cadastre] getCadastrePerimetre START lat=${lat} lon=${lon} expectedCitycode=${expectedCitycode} ` +
    `dvfRows=${dvfRows.length} nombreSectionsVoisines=${nombreSectionsVoisines} ` +
    `distanceMaxSectionM=${distanceMaxSectionM} ` +
    `forceInclude=[${sectionsForceInclude.join(',')}] forceExclude=[${sectionsForceExclude.join(',')}]`
  );

  try {
    const parcelle_cible = await fetchParcelleAtPoint(lat, lon, expectedCitycode);
    if (!parcelle_cible || !parcelle_cible.commune || !parcelle_cible.section) {
      console.log('[cadastre] getCadastrePerimetre → null (parcelle not found or wrong commune) — FALLBACK TRIGGER');
      return null;
    }

    const code_commune     = parcelle_cible.commune;
    const section          = parcelle_cible.section;
    const prefixe          = parcelle_cible.prefixe_section;
    const section_complete = prefixe + section;
    const targetCle        = code_commune + section_complete;

    const forceIncludeSet = new Set(sectionsForceInclude);
    const forceExcludeSet = new Set(sectionsForceExclude);

    // ── Scan DVF rows → candidate sections within rayonM ─────────────────────
    interface SectionAcc {
      distances: number[];
      code_commune: string;
      nom_commune: string;
    }
    const sectionAcc = new Map<string, SectionAcc>();

    for (const row of dvfRows) {
      const idp = row.id_parcelle || '';
      if (idp.length < 14) continue;
      const lat2 = parseFloat(row.latitude  || '');
      const lon2 = parseFloat(row.longitude || '');
      if (isNaN(lat2) || isNaN(lon2)) continue;
      const dist = haversine(lat, lon, lat2, lon2);
      if (dist > rayonM) continue;

      const cle           = idp.slice(0, 10);
      const rowCommune    = row.code_commune || idp.slice(0, 5);
      const rowNomCommune = row.nom_commune  || rowCommune;

      if (!sectionAcc.has(cle)) {
        sectionAcc.set(cle, { distances: [], code_commune: rowCommune, nom_commune: rowNomCommune });
      }
      sectionAcc.get(cle)!.distances.push(dist);
    }

    console.log(`[cadastre] ${sectionAcc.size} sections candidates dans le rayon ${rayonM} m`);

    // ── Build candidate list with stats ──────────────────────────────────────
    interface SectionStats {
      cle: string;
      code_commune: string;
      nom_commune: string;
      section_complete: string;
      prefixe: string;
      section: string;
      distance_min_m: number;
      distance_moy_m: number;
      nb_transactions: number;
    }

    const candidateStats: SectionStats[] = [];
    for (const [cle, acc] of sectionAcc) {
      const sc    = cle.slice(5, 10);
      const dists = acc.distances;
      candidateStats.push({
        cle,
        code_commune:     acc.code_commune,
        nom_commune:      acc.nom_commune,
        section_complete: sc,
        prefixe:          sc.slice(0, 3),
        section:          sc.slice(3),
        distance_min_m:   Math.round(Math.min(...dists)),
        distance_moy_m:   Math.round(dists.reduce((s, d) => s + d, 0) / dists.length),
        nb_transactions:  dists.length,
      });
    }

    // Sort by distance_min_m ascending
    candidateStats.sort((a, b) => a.distance_min_m - b.distance_min_m);

    // ── Classify each candidate ───────────────────────────────────────────────
    const sections_autorisees: SectionAdjacenteInfo[] = [];
    const sections_candidates_exclues: SectionCandidateExclue[] = [];

    // Target section: always first, always included
    const targetCandidate = candidateStats.find((c) => c.cle === targetCle);
    const sectionCible: SectionAdjacenteInfo = targetCandidate
      ? { ...targetCandidate, est_cible: true, raison: 'Section cible' }
      : {
          cle: targetCle,
          code_commune,
          nom_commune:      code_commune,
          section,
          prefixe,
          section_complete,
          est_cible:        true,
          raison:           'Section cible',
          distance_min_m:   0,
          distance_moy_m:   0,
          nb_transactions:  0,
        };
    sections_autorisees.push(sectionCible);

    let autoVoisinesCount = 0;

    for (const c of candidateStats) {
      if (c.cle === targetCle) continue; // already handled

      if (forceExcludeSet.has(c.section_complete)) {
        sections_candidates_exclues.push({ ...c, raison_exclusion: 'Exclue manuellement' });
        console.log(`[cadastre]   EXCLU manuellement: ${c.cle} (${c.section_complete}) distMin=${c.distance_min_m}m`);
        continue;
      }

      if (forceIncludeSet.has(c.section_complete)) {
        sections_autorisees.push({ ...c, est_cible: false, raison: 'Forcée manuellement' });
        console.log(`[cadastre]   INCLUS forcé: ${c.cle} (${c.section_complete}) distMin=${c.distance_min_m}m`);
        continue;
      }

      if (c.distance_min_m > distanceMaxSectionM) {
        sections_candidates_exclues.push({ ...c, raison_exclusion: 'Trop éloignée' });
        console.log(`[cadastre]   EXCLU trop éloigné: ${c.cle} distMin=${c.distance_min_m}m > ${distanceMaxSectionM}m`);
        continue;
      }

      if (autoVoisinesCount >= nombreSectionsVoisines) {
        sections_candidates_exclues.push({ ...c, raison_exclusion: 'Limite dépassée' });
        console.log(`[cadastre]   EXCLU limite N: ${c.cle} (déjà ${autoVoisinesCount} voisines)`);
        continue;
      }

      sections_autorisees.push({ ...c, est_cible: false, raison: 'Section voisine (DVF)' });
      autoVoisinesCount++;
      console.log(`[cadastre]   INCLUS voisin: ${c.cle} distMin=${c.distance_min_m}m nbTx=${c.nb_transactions}`);
    }

    // Warn about force-include codes not found in DVF data
    for (const sc of sectionsForceInclude) {
      const found = sections_autorisees.some((s) => s.section_complete === sc);
      if (!found) {
        console.log(`[cadastre]   WARN force-include "${sc}" non trouvé dans les données DVF du rayon ${rayonM} m`);
      }
    }

    // ── communes_incluses ─────────────────────────────────────────────────────
    const communeMap = new Map<string, string>();
    for (const s of sections_autorisees) {
      if (!communeMap.has(s.code_commune)) communeMap.set(s.code_commune, s.nom_commune);
    }
    const communes_incluses = [...communeMap.entries()].map(([code, nom]) => ({ code, nom }));

    // ── communes_exclues_du_rayon ─────────────────────────────────────────────
    const retainedCommunes = new Set(sections_autorisees.map((s) => s.code_commune));
    const excludedMap = new Map<string, string>();
    for (const [, acc] of sectionAcc) {
      if (!retainedCommunes.has(acc.code_commune)) {
        excludedMap.set(acc.code_commune, acc.nom_commune || acc.code_commune);
      }
    }
    const communes_exclues_du_rayon = [...excludedMap.values()];

    const nbVoisines = sections_autorisees.length - 1;
    console.log(
      `[cadastre] getCadastrePerimetre SUCCESS: ${sections_autorisees.length} sections ` +
      `(cible + ${nbVoisines} voisines/forcées), ${sections_candidates_exclues.length} candidates exclues`
    );
    for (const s of sections_autorisees) {
      console.log(`  ✓ ${s.cle} [${s.raison}] distMin=${s.distance_min_m}m nbTx=${s.nb_transactions}`);
    }
    for (const s of sections_candidates_exclues) {
      console.log(`  ✗ ${s.cle} [${s.raison_exclusion}] distMin=${s.distance_min_m}m nbTx=${s.nb_transactions}`);
    }

    return {
      parcelle_cible,
      code_commune_cible:     code_commune,
      section_cible_code:     section,
      section_cible_complete: section_complete,
      sections_autorisees,
      sections_candidates_exclues,
      distance_max_section_m: distanceMaxSectionM,
      communes_incluses,
      communes_exclues_du_rayon,
      fallback_haversine: false,
    };
  } catch (err) {
    console.log(
      `[cadastre] getCadastrePerimetre exception → null — FALLBACK TRIGGER: ` +
      `${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

export async function getCadastreFromCoords(lat: number, lon: number): Promise<CadastreResult | null> {
  return fetchParcelleAtPoint(lat, lon);
}
