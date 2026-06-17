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

async function fetchParcelleAtPoint(lat: number, lon: number): Promise<CadastreResult | null> {
  try {
    const url = `${APICARTO}/parcelle?lon=${lon}&lat=${lat}&srid=4326`;
    console.log(`[cadastre] fetchParcelleAtPoint → ${url}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    console.log(`[cadastre] fetchParcelleAtPoint ← HTTP ${res.status}`);
    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      console.log(`[cadastre] fetchParcelleAtPoint error body: ${body.slice(0, 200)}`);
      return null;
    }
    const data = await res.json() as { features?: { properties: ParcelleProps }[] };
    if (!data.features || data.features.length === 0) {
      console.log('[cadastre] fetchParcelleAtPoint: no features in response');
      return null;
    }
    const p = data.features[0].properties;
    const result: CadastreResult = {
      id: p.id || p.idu || '',
      section: p.section || '',
      numero: p.numero || '',
      commune: p.commune || '',
      prefixe_section: p.prefixesection || '000',
    };
    console.log(`[cadastre] fetchParcelleAtPoint: ${JSON.stringify(result)}`);
    return result;
  } catch (err) {
    console.log(`[cadastre] fetchParcelleAtPoint exception: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function getCadastrePerimetre(
  lat: number,
  lon: number,
  _rayonM: number
): Promise<CadastrePerimetre | null> {
  console.log(`[cadastre] getCadastrePerimetre START lat=${lat} lon=${lon}`);
  try {
    const parcelle_cible = await fetchParcelleAtPoint(lat, lon);
    if (!parcelle_cible || !parcelle_cible.commune || !parcelle_cible.section) {
      console.log('[cadastre] getCadastrePerimetre → null (parcelle not found or incomplete) — FALLBACK TRIGGER');
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
