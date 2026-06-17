import { NextRequest, NextResponse } from 'next/server';
import { geocodeAdresse } from '@/lib/geocode';
import { getCadastrePerimetre } from '@/lib/cadastre';
import { fetchDVFRows } from '@/lib/dvf';
import { processRows, haversineMeters } from '@/lib/filters';
import { computeGlobalStats, computeTypologieStats } from '@/lib/stats';
import { generateExcel } from '@/lib/excel';
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
      return NextResponse.json({ error: 'Adresse manquante.' }, { status: 400 });
    }

    const geocode = await geocodeAdresse(adresse.trim());
    const perimetre = await getCadastrePerimetre(geocode.lat, geocode.lon, rayon_m);
    const dept = geocode.departement;

    const years = getYears(date_debut, date_fin);
    const avertissements: string[] = [];
    const anneesMalformes: number[] = [];
    const allRawRows = [];

    if (!perimetre) {
      avertissements.push('API cadastre indisponible — filtre de secours par rayon géographique activé.');
    } else {
      avertissements.push('Périmètre cadastral V1 : section cible uniquement — pas d\'adjacence géométrique complète.');
    }

    for (const year of years) {
      const { rows, missing } = await fetchDVFRows(dept, year);
      if (missing) {
        anneesMalformes.push(year);
        avertissements.push(`Données DVF ${year} (dept ${dept}) indisponibles.`);
      } else {
        allRawRows.push(...rows);
      }
    }

    const toutes = processRows(allRawRows, {
      lat: geocode.lat,
      lon: geocode.lon,
      rayonM: rayon_m,
      dateDebut: date_debut,
      dateFin: date_fin,
      perimetre,
    });

    const retenues = toutes.filter((t) => t.statut === 'retenue');
    const excluEtAVerifier = toutes.filter((t) => t.statut !== 'retenue');

    // Enrichissement communes
    if (perimetre) {
      const codeToNom = new Map<string, string>();
      for (const t of toutes) {
        if (t.nom_commune && t.code_commune) codeToNom.set(t.code_commune, t.nom_commune);
      }
      for (const row of allRawRows.slice(0, 50000)) {
        if (row.nom_commune && row.code_commune && !codeToNom.has(row.code_commune)) {
          codeToNom.set(row.code_commune, row.nom_commune);
        }
      }
      perimetre.sections_autorisees = perimetre.sections_autorisees.map((s) => ({
        ...s,
        nom_commune: codeToNom.get(s.code_commune) || s.code_commune,
      }));
      perimetre.communes_incluses = perimetre.communes_incluses.map((c) => ({
        ...c,
        nom: codeToNom.get(c.code) || c.code,
      }));
      const communesAutorisees = new Set(perimetre.communes_incluses.map((c) => c.code));
      const communesRayon = new Set<string>();
      for (const row of allRawRows) {
        const rowLat = parseFloat(row.latitude || '');
        const rowLon = parseFloat(row.longitude || '');
        if (!isNaN(rowLat) && !isNaN(rowLon)) {
          if (haversineMeters(geocode.lat, geocode.lon, rowLat, rowLon) <= rayon_m) {
            communesRayon.add(row.code_commune);
          }
        }
      }
      perimetre.communes_exclues_du_rayon = [...communesRayon]
        .filter((c) => !communesAutorisees.has(c))
        .map((c) => codeToNom.get(c) || c);
    }

    const stats = computeGlobalStats(toutes, retenues, excluEtAVerifier);
    const statsParTypologie = computeTypologieStats(retenues);

    const result: AnalysisResult = {
      adresse_analysee: geocode.label,
      commune: geocode.city,
      code_commune: geocode.citycode,
      departement: dept,
      geocode,
      cadastre: perimetre?.parcelle_cible || null,
      perimetre_cadastral: perimetre,
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

    const buffer = await generateExcel(result);
    const commune = geocode.city.replace(/\s+/g, '_').toLowerCase();
    const filename = `dvf_${commune}_${rayon_m}m_${date_debut}_${date_fin}.xlsx`;
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
