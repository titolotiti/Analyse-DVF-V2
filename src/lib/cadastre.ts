import type { CadastreResult } from './types';

const APICARTO_URL = 'https://apicarto.ign.fr/api/cadastre/parcelle';

interface ParcelleFeature {
  properties: {
    id?: string;
    idu?: string;
    commune?: string;
    prefixesection?: string;
    section?: string;
    numero?: string;
  };
}

export async function getCadastreFromCoords(
  lat: number,
  lon: number
): Promise<CadastreResult | null> {
  try {
    const url = `${APICARTO_URL}?lon=${lon}&lat=${lat}&srid=4326`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json() as { features?: ParcelleFeature[] };
    if (!data.features || data.features.length === 0) return null;
    const p = data.features[0].properties;
    return {
      id: p.id || p.idu || '',
      section: p.section || '',
      numero: p.numero || '',
      commune: p.commune || '',
      prefixe_section: p.prefixesection || '000',
    };
  } catch {
    return null;
  }
}
