import type { DVFTransaction, TypelogieStats, GlobalStats, Typologie } from './types';

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
      prix_median_m2: round2(median(prix)),
      min_m2: prix.length > 0 ? round2(Math.min(...prix)) : 0,
      max_m2: prix.length > 0 ? round2(Math.max(...prix)) : 0,
    };
  }).filter((t) => t.count > 0);
}
