import { NextRequest, NextResponse } from 'next/server';
import { geocodeAdresse } from '@/lib/geocode';
import { getCadastrePerimetre } from '@/lib/cadastre';
import { fetchDVFRows } from '@/lib/dvf';
import { processRows } from '@/lib/filters';
import { computeGlobalStats, computeTypologieStats } from '@/lib/stats';
import type { AnalysisResult, AnalyzeRequest } from '@/lib/types';

function getYears(dateDebut: string, dateFin: string): number[] {
  const yearStart = new Date(dateDebut).getFullYear();
  const yearEnd   = new Date(dateFin).getFullYear();
  const years: number[] = [];
  for (let y = yearStart; y <= yearEnd; y++) years.push(y);
  return years;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<AnalyzeRequest>;
    const {
      adresse,
      rayon_m                  = 500,
      date_debut               = '2024-01-01',
      date_fin                 = '2025-12-31',
      distance_max_section_m   = 300,
      nombre_sections_voisines = 4,
      sections_force_include   = [],
      sections_force_exclude   = [],
      communes_selectionnees   = [],
    } = body;

    if (!adresse || adresse.trim().length < 5) {
      return NextResponse.json({ error: 'Adresse manquante ou trop courte.' }, { status: 400 });
    }

    // 1. Géocodage
    const geocode = await geocodeAdresse(adresse.trim());
    console.log(`[analyze] geocode OK: label="${geocode.label}" lat=${geocode.lat} lon=${geocode.lon} dept=${geocode.departement}`);

    const dept = geocode.departement;
    if (!dept) {
      return NextResponse.json({ error: `Impossible de déterminer le département pour : ${adresse}` }, { status: 400 });
    }

    // 2. Chargement DVF (avant le périmètre cadastral pour alimenter la détection de sections)
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

    // 3. Périmètre cadastral V2 : section cible + sections voisines détectées via DVF
    console.log('[analyze] calling getCadastrePerimetre V2…');
    const perimetre = await getCadastrePerimetre(geocode.lat, geocode.lon, rayon_m, {
      expectedCitycode:      geocode.citycode,
      dvfRows:               allRawRows,
      nombreSectionsVoisines: nombre_sections_voisines,
      distanceMaxSectionM:   distance_max_section_m,
      sectionsForceInclude:  sections_force_include,
      sectionsForceExclude:  sections_force_exclude,
      communesSelectionnees: communes_selectionnees,
    });
    console.log(
      `[analyze] getCadastrePerimetre result: ` +
      (perimetre
        ? `OK (${perimetre.sections_autorisees.length} sections, fallback=${perimetre.fallback_haversine})`
        : 'null → haversine fallback')
    );

    if (!perimetre) {
      console.log('[analyze] FALLBACK MODE: perimetre is null, using haversine radius filter');
      avertissements.push('API cadastre indisponible — filtre de secours par rayon géographique activé.');
    } else {
      const nbVoisines = perimetre.sections_autorisees.length - 1;
      avertissements.push(
        nbVoisines > 0
          ? `Périmètre cadastral V2 : section cible + ${nbVoisines} section(s) voisine(s) détectée(s) via DVF (rayon ${rayon_m} m).`
          : `Périmètre cadastral : section cible uniquement — aucune section voisine détectée dans le rayon ${rayon_m} m.`
      );
    }

    // 4. Filtrage cadastral (ou haversine en fallback)
    const toutes = processRows(allRawRows, {
      lat:       geocode.lat,
      lon:       geocode.lon,
      rayonM:    rayon_m,
      dateDebut: date_debut,
      dateFin:   date_fin,
      perimetre,
    });

    const retenues          = toutes.filter((t) => t.statut === 'retenue');
    const excluEtAVerifier  = toutes.filter((t) => t.statut !== 'retenue');

    if (retenues.length === 0) {
      avertissements.push('Aucune transaction retenue dans le périmètre cadastral. Vérifiez l\'adresse ou essayez un rayon plus large.');
    }

    // 5. Enrichissement noms de communes (filet de sécurité si DVF bruts avaient des noms vides)
    if (perimetre) {
      const codeToNom = new Map<string, string>();
      for (const t of toutes) {
        if (t.nom_commune && t.code_commune) codeToNom.set(t.code_commune, t.nom_commune);
      }
      const enrichNom = (code: string, nom: string) =>
        nom !== code ? nom : (codeToNom.get(code) || code);

      perimetre.sections_autorisees = perimetre.sections_autorisees.map((s) => ({
        ...s,
        nom_commune: enrichNom(s.code_commune, s.nom_commune),
      }));
      perimetre.communes_incluses = perimetre.communes_incluses.map((c) => ({
        ...c,
        nom: enrichNom(c.code, c.nom),
      }));
      perimetre.communes_candidates = perimetre.communes_candidates.map((c) => ({
        ...c,
        nom: enrichNom(c.code, c.nom),
      }));

      // Communes candidates non retenues = candidates - incluses
      const communesAutorisees = new Set(perimetre.communes_incluses.map((c) => c.code));
      perimetre.communes_exclues_du_rayon = perimetre.communes_candidates
        .filter((c) => !communesAutorisees.has(c.code))
        .map((c) => c.nom !== c.code ? `${c.nom} (${c.code})` : c.code);
    }

    // 6. Statistiques
    const stats            = computeGlobalStats(toutes, retenues, excluEtAVerifier);
    const statsParTypologie = computeTypologieStats(retenues);

    const result: AnalysisResult = {
      adresse_analysee:                geocode.label,
      commune:                         geocode.city,
      code_commune:                    geocode.citycode,
      departement:                     dept,
      geocode,
      cadastre:                        perimetre?.parcelle_cible || null,
      perimetre_cadastral:             perimetre,
      perimetre_m:                     rayon_m,
      date_debut,
      date_fin,
      transactions_brutes:             toutes,
      transactions_retenues:           retenues,
      transactions_exclues_ou_a_verifier: excluEtAVerifier,
      stats,
      stats_par_typologie:             statsParTypologie,
      avertissements,
      annees_manquantes:               anneesMalformes,
    };

    return NextResponse.json({ success: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
