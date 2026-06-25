import type { DVFTransaction, TypelogieStats, GlobalStats, Typologie, ComparatifAnnuelRow } from './types';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeGlobalStats(
  brutes: DVFTransaction[],
  retenues: DVFTransaction[],
  exclues: DVFTransaction[]
): GlobalStats {
  const prix = retenues.map((t) => t.prix_m2!).filter((p) => p > 0);
  return {
    count_brutes: brutes.length,
    count_retenues: retenues.length,
    count_exclues: exclues.filter((t) => t.statut === 'exclue').length,
    count_a_verifier: exclues.filter((t) => t.statut === 'a_verifier').length,
    prix_moyen_m2: round2(mean(prix)),
    prix_median_m2: round2(median(prix)),
    prix_min_m2: prix.length > 0 ? round2(Math.min(...prix)) : 0,
    prix_max_m2: prix.length > 0 ? round2(Math.max(...prix)) : 0,
    quartile_bas: round2(quantile(prix, 0.25)),
    quartile_haut: round2(quantile(prix, 0.75)),
  };
}

const TYPOLOGIES: Typologie[] = ['T1', 'T2', 'T3', 'T4', 'T5+', 'Inconnu'];
const TYPOS_COMPARATIF: Typologie[] = ['T1', 'T2', 'T3', 'T4', 'T5+'];

export function computeTypologieStats(retenues: DVFTransaction[]): TypelogieStats[] {
  return TYPOLOGIES.map((typo) => {
    const subset = retenues.filter((t) => t.typologie === typo);
    const prix = subset.map((t) => t.prix_m2!).filter((p) => p > 0);
    const surfaces = subset.map((t) => t.surface_reelle_bati ?? 0).filter((s) => s > 0);
    return {
      typologie: typo,
      count: subset.length,
      surface_moyenne: round2(mean(surfaces)),
      prix_moyen_m2: round2(mean(prix)),
      p10_m2: round2(quantile(prix, 0.10)),
      q1_m2: round2(quantile(prix, 0.25)),
      prix_median_m2: round2(median(prix)),
      q3_m2: round2(quantile(prix, 0.75)),
      p90_m2: round2(quantile(prix, 0.90)),
      min_m2: prix.length > 0 ? round2(Math.min(...prix)) : 0,
      max_m2: prix.length > 0 ? round2(Math.max(...prix)) : 0,
    };
  }).filter((t) => t.count > 0);
}

export function computeComparatif2024vs2025(retenues: DVFTransaction[]): ComparatifAnnuelRow[] {
  function getYear(t: DVFTransaction): number {
    return parseInt(t.date_mutation.slice(0, 4), 10);
  }

  const t2024 = retenues.filter((t) => getYear(t) === 2024);
  const t2025 = retenues.filter((t) => getYear(t) === 2025);

  function statsFor(txs: DVFTransaction[]): { count: number; avg: number | null } {
    const prices = txs.map((t) => t.prix_m2!).filter((p) => p != null && p > 0);
    return {
      count: txs.length,
      avg: prices.length > 0 ? round2(mean(prices)) : null,
    };
  }

  const rows: ComparatifAnnuelRow[] = TYPOS_COMPARATIF.map((typo) => {
    const s24 = statsFor(t2024.filter((t) => t.typologie === typo));
    const s25 = statsFor(t2025.filter((t) => t.typologie === typo));
    const ecart = s24.avg != null && s25.avg != null ? round2(s25.avg - s24.avg) : null;
    const ecartPct =
      s24.avg != null && s25.avg != null && s24.avg !== 0
        ? round2(s25.avg / s24.avg - 1)
        : null;
    return { typologie: typo, nb_2024: s24.count, prix_moy_2024: s24.avg, nb_2025: s25.count, prix_moy_2025: s25.avg, ecart_eur: ecart, ecart_pct: ecartPct };
  });

  // Ligne TOTAL (hors 'Inconnu')
  const valid = (txs: DVFTransaction[]) => txs.filter((t) => t.typologie !== 'Inconnu');
  const sT24 = statsFor(valid(t2024));
  const sT25 = statsFor(valid(t2025));
  const ecartT = sT24.avg != null && sT25.avg != null ? round2(sT25.avg - sT24.avg) : null;
  const ecartPctT =
    sT24.avg != null && sT25.avg != null && sT24.avg !== 0
      ? round2(sT25.avg / sT24.avg - 1)
      : null;
  rows.push({ typologie: 'TOTAL', nb_2024: sT24.count, prix_moy_2024: sT24.avg, nb_2025: sT25.count, prix_moy_2025: sT25.avg, ecart_eur: ecartT, ecart_pct: ecartPctT });

  return rows;
}
