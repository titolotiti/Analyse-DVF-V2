import type { CadastreResult, CadastrePerimetre, SectionAdjacenteInfo } from './types';

const APICARTO = 'https://apicarto.ign.fr/api/cadastre';

interface ParcelleProps {
  id?: string;
  idu?: string;
  commune?: string;
  prefixesection?: string;
  section?: string;
  numero?: string;
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
  // Try geom GeoJSON Point first (official API Carto format), then lon/lat fallback
  const geomParam = encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: [lon, lat] }));
  const strategies: Array<{ label: string; url: string }> = [
    {
      label: 'geom',
      url: `${APICARTO}/parcelle?geom=${geomParam}&srid=4326`,
    },
    {
      label: 'lon/lat',
      url: `${APICARTO}/parcelle?lon=${lon}&lat=${lat}&srid=4326`,
    },
  ];

  for (const { label, url } of strategies) {
    const props = await tryFetchParcelle(url);
    if (!props) continue;

    const id = props.id || props.idu || '';
    const returnedCitycode = id.slice(0, 5);

    console.log(`[cadastre] fetchParcelleAtPoint (${label}): full props=${JSON.stringify(props)}`);
    console.log(`[cadastre] fetchParcelleAtPoint (${label}): id=${id} returnedCitycode=${returnedCitycode} expectedCitycode=${expectedCitycode}`);

    if (expectedCitycode && returnedCitycode !== expectedCitycode) {
      console.log(
        `[cadastre] commune mismatch (${label}): returnedCitycode=${returnedCitycode}, expected=${expectedCitycode} — skipping`
      );
      continue;
    }

    const result: CadastreResult = {
      id,
      section: props.section || '',
      numero: props.numero || '',
      commune: props.commune || returnedCitycode,
      prefixe_section: props.prefixesection || '000',
    };

    console.log(`[cadastre] fetchParcelleAtPoint OK (${label}): ${JSON.stringify(result)}`);
    return result;
  }

  if (expectedCitycode) {
    console.log(`[cadastre] all strategies returned wrong commune (expected ${expectedCitycode}) — returning null`);
  }
  return null;
}

export async function getCadastrePerimetre(
  lat: number,
  lon: number,
  _rayonM: number,
  expectedCitycode?: string
): Promise<CadastrePerimetre | null> {
  console.log(`[cadastre] getCadastrePerimetre START lat=${lat} lon=${lon} expectedCitycode=${expectedCitycode}`);
  try {
    const parcelle_cible = await fetchParcelleAtPoint(lat, lon, expectedCitycode);
    if (!parcelle_cible || !parcelle_cible.commune || !parcelle_cible.section) {
      console.log('[cadastre] getCadastrePerimetre → null (parcelle not found or wrong commune) — FALLBACK TRIGGER');
      return null;
    }

    const code_commune = parcelle_cible.commune;         // "92044" (5 chars INSEE)
    const section      = parcelle_cible.section;         // "0C"    (raw code)
    const prefixe      = parcelle_cible.prefixe_section; // "000"   (3 chars)
    const section_complete = prefixe + section;          // "0000C" (5 chars = id_parcelle[5..10])
    const cle = code_commune + section_complete;         // "920440000C" (10 chars = id_parcelle[0..10])

    const sectionCible: SectionAdjacenteInfo = {
      cle,
      code_commune,
      nom_commune: code_commune, // enriched later from DVF rows
      section,
      prefixe,
      section_complete,
      est_cible: true,
      raison: 'Section cible',
    };

    console.log(`[cadastre] getCadastrePerimetre SUCCESS: commune=${code_commune} section=${section_complete} cle=${cle}`);

    return {
      parcelle_cible,
      code_commune_cible: code_commune,
      section_cible_code: section,
      section_cible_complete: section_complete,
      sections_autorisees: [sectionCible],
      communes_incluses: [{ code: code_commune, nom: code_commune }],
      communes_exclues_du_rayon: [],
      fallback_haversine: false,
    };
  } catch (err) {
    console.log(`[cadastre] getCadastrePerimetre exception → null — FALLBACK TRIGGER: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function getCadastreFromCoords(lat: number, lon: number): Promise<CadastreResult | null> {
  return fetchParcelleAtPoint(lat, lon);
}
