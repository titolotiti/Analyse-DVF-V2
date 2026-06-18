import ExcelJS from 'exceljs';
import type { AnalysisResult, DVFTransaction, TypelogieStats } from './types';

function headerStyle(ws: ExcelJS.Worksheet, row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } },
    };
  });
  row.height = 30;
  void ws;
}

function autoWidth(ws: ExcelJS.Worksheet) {
  ws.columns.forEach((col) => {
    if (!col) return;
    let maxLen = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxLen + 2, 40);
  });
}

function fillTransactionRows(ws: ExcelJS.Worksheet, transactions: DVFTransaction[], avecStatut: boolean) {
  const headers = [
    'Date mutation',
    'Valeur foncière (€)',
    'Adresse',
    'Commune',
    'Code postal',
    'Code dept',
    'Section cadastrale',
    'Parcelle',
    'Type local',
    'Surface bâtie (m²)',
    'Pièces princ.',
    'Nb lots',
    'Prix/m² (€)',
    'Typologie',
    'Distance (m)',
    'Nature mutation',
    ...(avecStatut ? ['Statut', 'Raisons / flags'] : []),
  ];

  const headerRow = ws.addRow(headers);
  headerStyle(ws, headerRow);

  for (const t of transactions) {
    const row = ws.addRow([
      t.date_mutation,
      t.valeur_fonciere,
      t.adresse_complete,
      t.nom_commune,
      t.code_postal,
      t.code_departement,
      t.code_section_cadastrale,
      t.id_parcelle,
      t.type_local,
      t.surface_reelle_bati,
      t.nombre_pieces_principales,
      t.nombre_lots,
      t.prix_m2 ? Math.round(t.prix_m2) : null,
      t.typologie,
      t.distance_m ? Math.round(t.distance_m) : null,
      t.nature_mutation,
      ...(avecStatut ? [t.statut, t.raisons_flag.join(' | ')] : []),
    ]);

    // Coloration ligne selon statut
    if (avecStatut) {
      const statut = t.statut;
      const color = statut === 'exclue' ? 'FFFFDCDC' : statut === 'a_verifier' ? 'FFFFF3CD' : 'FFEBF7EB';
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
      });
    }

    row.height = 16;
  }

  autoWidth(ws);
}

export async function generateExcel(result: AnalysisResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Analyse DVF';
  wb.created = new Date();

  // ── Onglet 1 : Transactions brutes ──────────────────────────────────────────
  const wsBrutes = wb.addWorksheet('Transactions brutes');
  fillTransactionRows(wsBrutes, result.transactions_brutes, true);

  // ── Onglet 2 : Transactions retenues ────────────────────────────────────────
  const wsRetenues = wb.addWorksheet('Transactions retenues');
  fillTransactionRows(wsRetenues, result.transactions_retenues, false);

  // ── Onglet 3 : Exclues & à vérifier ─────────────────────────────────────────
  const wsExclues = wb.addWorksheet('Exclues & à vérifier');
  fillTransactionRows(wsExclues, result.transactions_exclues_ou_a_verifier, true);

  // ── Onglet 4 : Synthèse globale ──────────────────────────────────────────────
  const wsSynthese = wb.addWorksheet('Synthèse globale');
  const s = result.stats;
  const synthRows: [string, string | number][] = [
    ['Adresse analysée', result.adresse_analysee],
    ['Commune', result.commune],
    ['Département', result.departement],
    ['Rayon retenu (m)', result.perimetre_m],
    ['Période analysée', `${result.date_debut} → ${result.date_fin}`],
    ['', ''],
    ['Transactions brutes', s.count_brutes],
    ['Transactions retenues', s.count_retenues],
    ['Transactions exclues', s.count_exclues],
    ['Transactions à vérifier', s.count_a_verifier],
    ['', ''],
    ['Prix moyen/m² (€)', s.prix_moyen_m2],
    ['Prix médian/m² (€)', s.prix_median_m2],
    ['Prix min/m² (€)', s.prix_min_m2],
    ['Prix max/m² (€)', s.prix_max_m2],
    ['Quartile bas (Q1) €/m²', s.quartile_bas],
    ['Quartile haut (Q3) €/m²', s.quartile_haut],
  ];
  if (result.avertissements.length > 0) {
    synthRows.push(['', '']);
    synthRows.push(['Avertissements', result.avertissements.join('\n')]);
  }
  for (const [label, val] of synthRows) {
    const row = wsSynthese.addRow([label, val]);
    if (label) {
      row.getCell(1).font = { bold: true };
    }
    row.height = 18;
  }
  wsSynthese.getColumn(1).width = 32;
  wsSynthese.getColumn(2).width = 50;

  // ── Onglet 5 : Prix par typologie ────────────────────────────────────────────
  const wsTypo = wb.addWorksheet('Prix par typologie');
  const typoHeaders = wsTypo.addRow([
    'Typologie', 'Nb transactions', 'Surface moy. (m²)',
    'Prix moy. €/m²', 'Prix médian €/m²', 'Min €/m²', 'Max €/m²',
  ]);
  headerStyle(wsTypo, typoHeaders);

  for (const t of result.stats_par_typologie) {
    wsTypo.addRow([
      t.typologie, t.count, t.surface_moyenne,
      t.prix_moyen_m2, t.prix_median_m2, t.min_m2, t.max_m2,
    ]).height = 16;
  }
  autoWidth(wsTypo);

  // ── Onglet 6 : Périmètre & méthodologie ─────────────────────────────────────
  const wsMeta = wb.addWorksheet('Périmètre & méthodologie');
  const pc = result.perimetre_cadastral;
  const metaRows: [string, string | number][] = [
    ['Adresse analysée', result.adresse_analysee],
    ['Latitude', result.geocode.lat],
    ['Longitude', result.geocode.lon],
    ['Score géocodage', result.geocode.score],
    ['Source géocodage', 'Géoplateforme IGN / BAN (fallback)'],
    ['', ''],
    ['Parcelle cible', pc?.parcelle_cible?.id || result.cadastre?.id || 'Non disponible'],
    ['N° parcelle', pc?.parcelle_cible?.numero || result.cadastre?.numero || 'Non disponible'],
    ['Section cible (code)', pc?.section_cible_code || result.cadastre?.section || 'Non disponible'],
    ['Section cible (complète)', pc?.section_cible_complete || 'Non disponible'],
    ['Commune cible (INSEE)', pc?.code_commune_cible || 'Non disponible'],
    ['', ''],
  ];

  if (pc && !pc.fallback_haversine) {
    metaRows.push(['Méthode périmètre', 'Filtre cadastral — sections les plus proches détectées via DVF (rayon initial)']);
    metaRows.push(['Rayon de détection', `${result.perimetre_m} m — détection des sections candidates uniquement, pas filtre final`]);
    metaRows.push(['Distance max section', `${pc.distance_max_section_m} m — seuil d'inclusion automatique des voisines`]);
    metaRows.push(['Filtre final', 'id_parcelle.slice(0,10) dans la liste des sections retenues']);
    metaRows.push(['', '']);

    // Communes candidates (toutes détectées dans le rayon)
    const communesIncluesSet = new Set(pc.communes_incluses.map((c) => c.code));
    metaRows.push(['Communes candidates (rayon)', `${pc.communes_candidates.length} commune(s) détectée(s)`]);
    for (const c of pc.communes_candidates) {
      const incluse = communesIncluesSet.has(c.code);
      const label = c.nom !== c.code ? `${c.nom} (${c.code})` : c.code;
      metaRows.push([`  ${incluse ? '✓' : '✗'} ${label}`, incluse ? 'Incluse' : 'Non retenue']);
    }
    metaRows.push(['Communes incluses', pc.communes_incluses.map((c) => c.nom !== c.code ? `${c.nom} (${c.code})` : c.code).join(', ')]);
    if (pc.communes_exclues_du_rayon.length > 0) {
      metaRows.push(['Communes non retenues (dans rayon)', pc.communes_exclues_du_rayon.join(', ')]);
    }
    metaRows.push(['', '']);

    metaRows.push(['Sections retenues', pc.sections_autorisees.length.toString()]);
    for (const s of pc.sections_autorisees) {
      const commune = s.nom_commune !== s.code_commune ? `${s.nom_commune} (${s.code_commune})` : s.code_commune;
      metaRows.push([
        `  ✓ Section ${s.section_complete}`,
        `${s.raison} — ${commune} — dist. min ${s.distance_min_m} m — ${s.nb_transactions} tx DVF`,
      ]);
    }
    if (pc.sections_candidates_exclues.length > 0) {
      metaRows.push(['', '']);
      metaRows.push(['Sections candidates non retenues', pc.sections_candidates_exclues.length.toString()]);
      for (const s of pc.sections_candidates_exclues) {
        const commune = s.nom_commune !== s.code_commune ? `${s.nom_commune} (${s.code_commune})` : s.code_commune;
        metaRows.push([
          `  ✗ Section ${s.section_complete}`,
          `${s.raison_exclusion} — ${commune} — dist. min ${s.distance_min_m} m — ${s.nb_transactions} tx DVF`,
        ]);
      }
    }
  } else {
    metaRows.push(['Méthode périmètre', `Rayon géographique ${result.perimetre_m} m (Haversine) — fallback API cadastre indisponible`]);
  }

  metaRows.push(['', '']);
  metaRows.push(['Source DVF', 'data.gouv.fr – Fichiers Geo-DVF par département et année']);
  metaRows.push(['URL source', 'https://files.data.gouv.fr/geo-dvf/latest/csv/{année}/departements/{dept}.csv.gz']);
  metaRows.push(['Filtrage appartements', 'type_local = "Appartement"']);
  metaRows.push(['Seuil prix aberrant bas', '500 €/m²']);
  metaRows.push(['Seuil prix aberrant haut', '35 000 €/m²']);

  if (result.annees_manquantes.length > 0) {
    metaRows.push(['Années sans données', result.annees_manquantes.join(', ')]);
  }
  for (const [label, val] of metaRows) {
    const row = wsMeta.addRow([label, val]);
    if (label) row.getCell(1).font = { bold: true };
    row.height = 18;
  }
  wsMeta.getColumn(1).width = 35;
  wsMeta.getColumn(2).width = 80;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
