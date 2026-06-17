import { NextRequest, NextResponse } from 'next/server';
import { geocodeAdresse } from '@/lib/geocode';
import { getCadastreFromCoords } from '@/lib/cadastre';
import { fetchDVFRows } from '@/lib/dvf';
import { processRows } from '@/lib/filters';
import { computeGlobalStats, computeTypologieStats } from '@/lib/stats';
import type { AnalysisResult, AnalyzeRequest } from '@/lib/types';

function getYears(dateDebut: string, dateFin: string): number[] {
  const yearStart = new Date(dateDebut).getFullYear();
  const yearEnd = new Date(dateFin).getFullYear();
  const years: number[] = [];
  for (let y = yearStart; y <= yearEnd; y++) years.push(y);
  return years;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<AnalyzeRequest>;
    const { adresse, rayon_m = 500, date_debut = '2024-01-01', date_fin = '2025-12-31' } = body;

    if (!adresse || adresse.trim().length < 5) {
      return NextResponse.json({ error: 'Adresse manquante ou trop courte.' }, { status: 400 });
    }

    // 1. Géocodage
    const geocode = await geocodeAdresse(adresse.trim());

    // 2. Cadastre (non bloquant)
    const cadastre = await getCadastreFromCoords(geocode.lat, geocode.lon);

    const dept = geocode.departement;
    if (!dept) {
      return NextResponse.json({ error: `Impossible de déterminer le département pour : ${adresse}` }, { status: 400 });
    }

    // 3. Récupération DVF par année
    const years = getYears(date_debut, date_fin);
    const avertissements: string[] = [];
    const anneesMalformes: number[] = [];

    const allRawRows = [];
    for (const year of years) {
      const { rows, missing } = await fetchDVFRows(dept, year);
      if (missing) {
        anneesMalformes.push(year);
        avertissements.push(`Les données DVF ${year} pour le département ${dept} ne sont pas disponibles.`);
      } else {
        allRawRows.push(...rows);
      }
    }

    if (allRawRows.length === 0) {
      return NextResponse.json({
        error: `Aucune donnée DVF trouvée pour le département ${dept} sur la période ${date_debut} → ${date_fin}.`,
        avertissements,
      }, { status: 404 });
    }

    // 4. Filtrage et enrichissement
    const toutes = processRows(allRawRows, {
      lat: geocode.lat,
      lon: geocode.lon,
      rayonM: rayon_m,
      dateDebut: date_debut,
      dateFin: date_fin,
    });

    const retenues = toutes.filter((t) => t.statut === 'retenue');
    const excluEtAVerifier = toutes.filter((t) => t.statut !== 'retenue');

    if (retenues.length === 0) {
      avertissements.push(
        `Aucune transaction retenue dans un rayon de ${rayon_m} m. Essayez un rayon plus large.`
      );
    }

    // 5. Statistiques
    const stats = computeGlobalStats(toutes, retenues, excluEtAVerifier);
    const statsParTypologie = computeTypologieStats(retenues);

    const result: AnalysisResult = {
      adresse_analysee: geocode.label,
      commune: geocode.city,
      code_commune: geocode.citycode,
      departement: dept,
      geocode,
      cadastre,
      perimetre_m: rayon_m,
      date_debut,
      date_fin,
      transactions_brutes: toutes,
      transactions_retenues: retenues,
      transactions_exclues_ou_a_verifier: excluEtAVerifier,
      stats,
      stats_par_typologie: statsParTypologie,
      avertissements,
      annees_manquantes: anneesMalformes,
    };

    return NextResponse.json({ success: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
