import type { GeocodeResult } from './types';

const IGN_GEOCODE_URL = 'https://data.geopf.fr/geocodage/search';
const BAN_GEOCODE_URL = 'https://api-adresse.data.gouv.fr/search/';

interface GeoJsonFeature {
  type: string;
  geometry: { type: string; coordinates: [number, number] };
  properties: {
    label?: string;
    score?: number;
    city?: string;
    citycode?: string;
    postcode?: string;
    name?: string;
    context?: string;
    municipality?: string;
    city_code?: string;
    postcode_code?: string;
  };
}

function parseDepartement(citycode: string, context: string): string {
  if (citycode && citycode.length >= 2) {
    const dept = citycode.startsWith('97') ? citycode.slice(0, 3) : citycode.slice(0, 2);
    return dept;
  }
  // fallback: extract from context "75, Paris, Île-de-France"
  const parts = context?.split(',');
  if (parts && parts.length > 0) return parts[0].trim();
  return '';
}

async function tryIGNGeoplateforme(adresse: string): Promise<GeocodeResult | null> {
  const url = `${IGN_GEOCODE_URL}?q=${encodeURIComponent(adresse)}&limit=1&index=address`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json() as { features?: GeoJsonFeature[] };
  if (!data.features || data.features.length === 0) return null;
  const f = data.features[0];
  const [lon, lat] = f.geometry.coordinates;
  const p = f.properties;
  const citycode = p.citycode || p.city_code || '';
  const city = p.city || p.municipality || '';
  const postcode = p.postcode || p.postcode_code || '';
  const context = p.context || '';
  return {
    lat,
    lon,
    label: p.label || adresse,
    city,
    citycode,
    postcode,
    departement: parseDepartement(citycode, context),
    score: p.score ?? 0,
  };
}

async function tryBAN(adresse: string): Promise<GeocodeResult | null> {
  const url = `${BAN_GEOCODE_URL}?q=${encodeURIComponent(adresse)}&limit=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json() as { features?: GeoJsonFeature[] };
  if (!data.features || data.features.length === 0) return null;
  const f = data.features[0];
  const [lon, lat] = f.geometry.coordinates;
  const p = f.properties;
  const citycode = p.citycode || '';
  const context = p.context || '';
  return {
    lat,
    lon,
    label: p.label || adresse,
    city: p.city || '',
    citycode,
    postcode: p.postcode || '',
    departement: parseDepartement(citycode, context),
    score: p.score ?? 0,
  };
}

export async function geocodeAdresse(adresse: string): Promise<GeocodeResult> {
  let result: GeocodeResult | null = null;

  try {
    result = await tryIGNGeoplateforme(adresse);
  } catch {
    // IGN indisponible, on essaie BAN
  }

  if (!result) {
    try {
      result = await tryBAN(adresse);
    } catch {
      throw new Error(`Impossible de géocoder l'adresse : "${adresse}". Vérifiez l'adresse et réessayez.`);
    }
  }

  if (!result) {
    throw new Error(`Adresse introuvable : "${adresse}". Essayez une adresse plus précise.`);
  }

  if (result.score < 0.4) {
    throw new Error(`L'adresse "${adresse}" est ambiguë (score ${result.score.toFixed(2)}). Résultat le plus proche : ${result.label}. Précisez l'adresse.`);
  }

  return result;
}
