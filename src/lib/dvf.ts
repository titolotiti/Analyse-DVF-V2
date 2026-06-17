import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as https from 'https';
import * as http from 'http';
import Papa from 'papaparse';

const DVF_BASE_URL = 'https://files.data.gouv.fr/geo-dvf/latest/csv';
const CACHE_DIR =
  process.env.DVF_CACHE_DIR ||
  (process.env.VERCEL ? '/tmp/cache' : path.join(process.cwd(), 'cache'));

export interface RawDVFRow {
  id_mutation: string;
  date_mutation: string;
  numero_disposition: string;
  nature_mutation: string;
  valeur_fonciere: string;
  adresse_numero: string;
  adresse_suffixe: string;
  adresse_nom_voie: string;
  adresse_code_voie: string;
  code_postal: string;
  code_commune: string;
  nom_commune: string;
  code_departement: string;
  id_parcelle: string;
  numero_volume: string;
  lot1_numero: string;
  lot1_surface_carrez: string;
  lot2_numero: string;
  lot2_surface_carrez: string;
  lot3_numero: string;
  lot3_surface_carrez: string;
  lot4_numero: string;
  lot4_surface_carrez: string;
  lot5_numero: string;
  lot5_surface_carrez: string;
  nombre_lots: string;
  code_type_local: string;
  type_local: string;
  identifiant_local: string;
  surface_reelle_bati: string;
  nombre_pieces_principales: string;
  code_nature_culture: string;
  nature_culture: string;
  code_nature_culture_speciale: string;
  nature_culture_speciale: string;
  surface_terrain: string;
  longitude: string;
  latitude: string;
}

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCachePath(dept: string, year: number): string {
  return path.join(CACHE_DIR, `dvf_${dept}_${year}.csv`);
}

function downloadAndDecompress(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const location = res.headers.location;
        if (!location) return reject(new Error('Redirect sans location'));
        return downloadAndDecompress(location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode === 404) {
        return reject(new Error(`FILE_NOT_FOUND:${url}`));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} pour ${url}`));
      }
      const out = fs.createWriteStream(destPath);
      const gunzip = zlib.createGunzip();
      res.pipe(gunzip).pipe(out);
      out.on('finish', () => out.close(() => resolve()));
      out.on('error', reject);
      gunzip.on('error', reject);
    }).on('error', reject);
  });
}

export async function fetchDVFRows(dept: string, year: number): Promise<{ rows: RawDVFRow[]; missing: boolean }> {
  ensureCacheDir();
  const cachePath = getCachePath(dept, year);

  if (!fs.existsSync(cachePath)) {
    const url = `${DVF_BASE_URL}/${year}/departements/${dept}.csv.gz`;
    try {
      await downloadAndDecompress(url, cachePath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith('FILE_NOT_FOUND') || msg.includes('404')) {
        return { rows: [], missing: true };
      }
      throw err;
    }
  }

  const csvContent = fs.readFileSync(cachePath, 'utf-8');
  const result = Papa.parse<RawDVFRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
    delimiter: ',',
  });

  return { rows: result.data, missing: false };
}
