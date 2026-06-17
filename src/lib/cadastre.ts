import * as turf from '@turf/turf';
import type { CadastreResult, CadastrePerimetre, SectionAdjacenteInfo } from './types';

const APICARTO = 'https://apicarto.ign.fr/api/cadastre';

interface SectionProps {
  id?: string;
  idu?: string;
  commune?: string;
  prefixesection?: string;
  section?: string;
}

interface SectionFeature {
  type: 'Feature';
  geometry: GeoJSON.Geometry;
  properties: SectionProps;
}

interface FeatureCollection {
  type: 'FeatureCollection';
  features: SectionFeature[];
}

// ── Parcelle cible (inchangé) ─────────────────────────────────────────────

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
    return {
      id: p.id || p.idu || '',
      section: p.section || '',
      numero: p.numero || '',
      commune: p.commune || '',
      prefixe_section: p.prefixesection || '000',
    };
  } catch (err) {
    console.log(`[cadastre] fetchParcelleAtPoint exception: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Section cible avec géométrie ─────────────────────────────────────────

async function fetchSectionAtPoint(lat: number, lon: number): Promise<SectionFeature | null> {
  try {
    const url = `${APICARTO}/section?lon=${lon}&lat=${lat}&srid=4326`;
    console.log(`[cadastre] fetchSectionAtPoint → ${url}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    console.log(`[cadastre] fetchSectionAtPoint ← HTTP ${res.status}`);
    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      console.log(`[cadastre] fetchSectionAtPoint error body: ${body.slice(0, 200)}`);
      return null;
    }
    const data = await res.json() as FeatureCollection;
    if (!data.features || data.features.length === 0) {
      console.log('[cadastre] fetchSectionAtPoint: no features in response');
      return null;
    }
    console.log(`[cadastre] fetchSectionAtPoint: got section idu=${data.features[0].properties.idu}`);
    return data.features[0];
  } catch (err) {
    console.log(`[cadastre] fetchSectionAtPoint exception: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Sections candidates via paramètre geom ────────────────────────────────

async function fetchSectionsByGeom(geom: GeoJSON.Geometry): Promise<SectionFeature[]> {
  try {
    const geomStr = JSON.stringify(geom);
    const url = `${APICARTO}/section?geom=${encodeURIComponent(geomStr)}`;
    console.log(`[cadastre] fetchSectionsByGeom → ${url.slice(0, 120)}…`);
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    console.log(`[cadastre] fetchSectionsByGeom ← HTTP ${res.status}`);
    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      console.log(`[cadastre] fetchSectionsByGeom error body: ${body.slice(0, 200)}`);
      return [];
    }
    const data = await res.json() as FeatureCollection;
    const count = data.features?.length ?? 0;
    console.log(`[cadastre] fetchSectionsByGeom: ${count} section(s) returned`);
    return data.features || [];
  } catch (err) {
    console.log(`[cadastre] fetchSectionsByGeom exception: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// ── Fallback : échantillonnage de points autour de la section cible ───────

async function fetchSectionsByPointSampling(
  target: SectionFeature,
  bufferDeg: number = 0.003
): Promise<SectionFeature[]> {
  const bb = turf.bbox(target);
  const [minX, minY, maxX, maxY] = bb;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // 12 points à l'extérieur du bbox cible
  const pts: [number, number][] = [
    [cx, minY - bufferDeg],
    [cx, maxY + bufferDeg],
    [minX - bufferDeg, cy],
    [maxX + bufferDeg, cy],
    [minX - bufferDeg, minY - bufferDeg],
    [maxX + bufferDeg, minY - bufferDeg],
    [minX - bufferDeg, maxY + bufferDeg],
    [maxX + bufferDeg, maxY + bufferDeg],
    [(minX + cx) / 2, minY - bufferDeg],
    [(maxX + cx) / 2, minY - bufferDeg],
    [(minX + cx) / 2, maxY + bufferDeg],
    [(maxX + cx) / 2, maxY + bufferDeg],
  ];

  const results = await Promise.all(
    pts.map(([lon, lat]) => fetchSectionAtPoint(lat, lon))
  );

  const seen = new Set<string>();
  const sections: SectionFeature[] = [];
  for (const s of results) {
    if (!s) continue;
    const idu = s.properties.idu || '';
    if (idu && !seen.has(idu)) {
      seen.add(idu);
      sections.push(s);
    }
  }
  return sections;
}

// ── Fonction principale ───────────────────────────────────────────────────

function sectionIdu(p: SectionProps): string {
  const commune = p.commune || '';
  const prefixe = p.prefixesection || '000';
  const section = p.section || '';
  return p.idu || (commune + prefixe + section);
}

export async function getCadastrePerimetre(
  lat: number,
  lon: number,
  _rayonM: number
): Promise<CadastrePerimetre | null> {
  console.log(`[cadastre] getCadastrePerimetre START lat=${lat} lon=${lon}`);
  try {
    // 1. Parcelle cible
    const parcelle_cible = await fetchParcelleAtPoint(lat, lon);
    console.log(`[cadastre] parcelle_cible: ${parcelle_cible ? JSON.stringify(parcelle_cible) : 'null'}`);

    // 2. Section cible avec géométrie
    const targetSection = await fetchSectionAtPoint(lat, lon);
    if (!targetSection?.geometry) {
      console.log('[cadastre] getCadastrePerimetre → null (no targetSection geometry) — FALLBACK TRIGGER');
      return null;
    }

    const tp = targetSection.properties;
    const code_commune_cible = tp.commune || '';
    const section_cible_code = tp.section || '';
    const prefixe_cible = tp.prefixesection || '000';
    const section_cible_complete = prefixe_cible + section_cible_code;
    const cle_cible = sectionIdu(tp);

    // 3. Bbox élargi pour trouver les candidats
    const bb = turf.bbox(targetSection);
    const [minX, minY, maxX, maxY] = bb;
    const buf = 0.003; // ≈ 300 m
    const expandedBboxGeom = turf.bboxPolygon([
      minX - buf, minY - buf, maxX + buf, maxY + buf,
    ]).geometry;

    // 4. Tentative via paramètre geom, fallback point-sampling
    let candidates = await fetchSectionsByGeom(expandedBboxGeom);
    console.log(`[cadastre] candidates after geom query: ${candidates.length}`);
    if (candidates.length <= 1) {
      console.log('[cadastre] geom query returned ≤1 result, switching to point-sampling');
      candidates = await fetchSectionsByPointSampling(targetSection, buf);
      console.log(`[cadastre] candidates after point-sampling: ${candidates.length}`);
    }

    // S'assurer que la section cible est dans la liste
    const targetIdu = sectionIdu(tp);
    if (!candidates.find((c) => sectionIdu(c.properties) === targetIdu)) {
      candidates.push(targetSection);
    }

    // 5. Test d'adjacence géométrique
    const seen = new Set<string>();
    const sections_autorisees: SectionAdjacenteInfo[] = [];

    for (const candidate of candidates) {
      const cp = candidate.properties;
      const idu = sectionIdu(cp);
      if (!idu || seen.has(idu)) continue;

      const est_cible = idu === cle_cible;
      let inclure = est_cible;

      if (!est_cible && candidate.geometry) {
        try {
          inclure = turf.booleanIntersects(targetSection.geometry, candidate.geometry);
        } catch {
          inclure = false;
        }
      }

      if (inclure) {
        seen.add(idu);
        const prefixe = cp.prefixesection || '000';
        const section = cp.section || '';
        sections_autorisees.push({
          cle: idu,
          code_commune: cp.commune || '',
          nom_commune: cp.commune || '',
          section,
          prefixe,
          section_complete: prefixe + section,
          est_cible,
          raison: est_cible ? 'Section cible' : 'Adjacente géométriquement',
        });
      }
    }

    // Garantir la présence de la section cible
    if (!seen.has(cle_cible)) {
      sections_autorisees.unshift({
        cle: cle_cible,
        code_commune: code_commune_cible,
        nom_commune: code_commune_cible,
        section: section_cible_code,
        prefixe: prefixe_cible,
        section_complete: section_cible_complete,
        est_cible: true,
        raison: 'Section cible',
      });
    }

    const communes_incluses = [
      ...new Map(
        sections_autorisees.map((s) => [s.code_commune, { code: s.code_commune, nom: s.nom_commune }])
      ).values(),
    ];

    console.log(`[cadastre] getCadastrePerimetre SUCCESS: ${sections_autorisees.length} section(s) autorisée(s): ${sections_autorisees.map((s) => s.cle).join(', ')}`);
    return {
      parcelle_cible,
      code_commune_cible,
      section_cible_code,
      section_cible_complete,
      sections_autorisees,
      communes_incluses,
      communes_exclues_du_rayon: [],
      fallback_haversine: false,
    };
  } catch (err) {
    console.log(`[cadastre] getCadastrePerimetre exception → null — FALLBACK TRIGGER: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// Exporté pour compatibilité (utilisé si perimetre est null)
export async function getCadastreFromCoords(lat: number, lon: number): Promise<CadastreResult | null> {
  return fetchParcelleAtPoint(lat, lon);
}
