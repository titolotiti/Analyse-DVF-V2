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
  const metaRows: [string, string | number][] = [
    ['Adresse analysée', result.adresse_analysee],
    ['Latitude', result.geocode.lat],
    ['Longitude', result.geocode.lon],
    ['Score géocodage', result.geocode.score],
    ['Source géocodage', 'Géoplateforme IGN / BAN (fallback)'],
    ['', ''],
    ['Parcelle cadastrale', result.cadastre?.id || 'Non disponible'],
    ['Section cadastrale', result.cadastre?.section || 'Non disponible'],
    ['Numéro parcelle', result.cadastre?.numero || 'Non disponible'],
    ['', ''],
    ['Méthode périmètre', `Rayon de ${result.perimetre_m} m autour de l'adresse géocodée (formule de Haversine)`],
    ['Limites méthodologiques', 'Le rayon géographique ne correspond pas à une analyse cadastrale exacte. Il peut inclure des zones de caractéristiques différentes (copropriétés, immeubles de rapport, etc.).'],
    ['', ''],
    ['Source DVF', 'data.gouv.fr – Fichiers Geo-DVF par département et année'],
    ['URL source', 'https://files.data.gouv.fr/geo-dvf/latest/csv/{année}/departements/{dept}.csv.gz'],
    ['Filtrage appartements', 'type_local = "Appartement"'],
    ['Seuil prix aberrant bas', '500 €/m²'],
    ['Seuil prix aberrant haut', '35 000 €/m²'],
  ];
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
