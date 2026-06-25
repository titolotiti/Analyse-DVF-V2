import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { AnalysisResult, DVFTransaction, ComparatifAnnuelRow } from './types';
import { computeComparatif2024vs2025 } from './stats';

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

// ── Onglet Comparatif 2024-2025 ───────────────────────────────────────────────

function addComparatifSheet(wb: ExcelJS.Workbook, data: ComparatifAnnuelRow[]) {
  const ws = wb.addWorksheet('Comparatif 2024-2025');

  // En-têtes
  const headerRow = ws.addRow([
    'Typologie',
    'Nb 2024',
    'Prix moy. 2024 €/m²',
    'Nb 2025',
    'Prix moy. 2025 €/m²',
    'Écart €/m²',
    'Écart %',
  ]);
  headerStyle(ws, headerRow);

  // Données
  data.forEach((row, i) => {
    const excelRow = i + 2; // row 2 = T1, row 7 = TOTAL
    const isTotal = row.typologie === 'TOTAL';
    const r = ws.addRow([
      row.typologie,
      row.nb_2024 > 0 ? row.nb_2024 : null,
      row.prix_moy_2024,
      row.nb_2025 > 0 ? row.nb_2025 : null,
      row.prix_moy_2025,
      // Écart et Écart % en formule — se recalculent si l'utilisateur édite les prix
      { formula: `IF(AND(ISNUMBER(C${excelRow}),ISNUMBER(E${excelRow})),E${excelRow}-C${excelRow},"")` },
      { formula: `IF(AND(ISNUMBER(C${excelRow}),ISNUMBER(E${excelRow}),C${excelRow}<>0),E${excelRow}/C${excelRow}-1,"")` },
    ]);

    r.height = 18;

    // Style de la ligne TOTAL
    if (isTotal) {
      r.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F5FB' } };
        cell.border = {
          top: { style: 'medium', color: { argb: 'FF1E3A5F' } },
        };
      });
    }

    // Format numérique des colonnes de prix
    const fmtPrix = '#,##0 "€/m²"';
    const fmtNb = '#,##0';
    r.getCell(2).numFmt = fmtNb;
    r.getCell(3).numFmt = fmtPrix;
    r.getCell(4).numFmt = fmtNb;
    r.getCell(5).numFmt = fmtPrix;
    r.getCell(6).numFmt = '#,##0 "€/m²";-#,##0 "€/m²"';
    r.getCell(7).numFmt = '0.0%';

    // Coloration de l'écart % : positif = vert pâle, négatif = rouge pâle
    if (row.ecart_pct != null) {
      const pctCell = r.getCell(7);
      const ecart = row.ecart_pct;
      if (ecart > 0) {
        pctCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF7EB' } };
      } else if (ecart < 0) {
        pctCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFDCDC' } };
      }
    }
  });

  // Note source sous le tableau (row 9, laissant row 8 vide)
  ws.addRow([]);
  const srcRow = ws.addRow(['Source : DVF — données.gouv.fr']);
  srcRow.getCell(1).font = { italic: true, color: { argb: 'FF888888' }, size: 9 };
  srcRow.height = 14;

  // Largeurs colonnes
  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 10;
  ws.getColumn(3).width = 22;
  ws.getColumn(4).width = 10;
  ws.getColumn(5).width = 22;
  ws.getColumn(6).width = 16;
  ws.getColumn(7).width = 12;

  // Gel de la ligne d'en-têtes
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
}

// ── Injection Open XML du graphique via JSZip ─────────────────────────────────

function buildChartXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace
  xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:date1904 val="0"/>
  <c:lang val="fr-FR"/>
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title>
      <c:tx><c:rich>
        <a:bodyPr/><a:lstStyle/>
        <a:p>
          <a:pPr><a:defRPr b="1"/></a:pPr>
          <a:r>
            <a:rPr lang="fr-FR" b="1" sz="1100"/>
            <a:t>Prix moyen €/m² par typologie — 2024 vs 2025</a:t>
          </a:r>
        </a:p>
      </c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="col"/>
        <c:grouping val="clustered"/>
        <c:varyColors val="0"/>

        <c:ser>
          <c:idx val="0"/><c:order val="0"/>
          <c:tx><c:strRef>
            <c:f>'Comparatif 2024-2025'!$C$1</c:f>
            <c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Prix moy. 2024 €/m²</c:v></c:pt></c:strCache>
          </c:strRef></c:tx>
          <c:spPr>
            <a:solidFill><a:srgbClr val="1E3A5F"/></a:solidFill>
            <a:ln><a:noFill/></a:ln>
          </c:spPr>
          <c:dLbls>
            <c:numFmt formatCode="#,##0" sourceLinked="0"/>
            <c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>
            <c:txPr><a:bodyPr/><a:lstStyle/>
              <a:p><a:pPr><a:defRPr sz="750" b="0" lang="fr-FR"/></a:pPr></a:p>
            </c:txPr>
            <c:showLegendKey val="0"/>
            <c:showVal val="1"/>
            <c:showCatName val="0"/>
            <c:showSerName val="0"/>
            <c:showPercent val="0"/>
            <c:showBubbleSize val="0"/>
          </c:dLbls>
          <c:cat><c:strRef>
            <c:f>'Comparatif 2024-2025'!$A$2:$A$7</c:f>
            <c:strCache>
              <c:ptCount val="6"/>
              <c:pt idx="0"><c:v>T1</c:v></c:pt>
              <c:pt idx="1"><c:v>T2</c:v></c:pt>
              <c:pt idx="2"><c:v>T3</c:v></c:pt>
              <c:pt idx="3"><c:v>T4</c:v></c:pt>
              <c:pt idx="4"><c:v>T5+</c:v></c:pt>
              <c:pt idx="5"><c:v>TOTAL</c:v></c:pt>
            </c:strCache>
          </c:strRef></c:cat>
          <c:val><c:numRef>
            <c:f>'Comparatif 2024-2025'!$C$2:$C$7</c:f>
            <c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="6"/></c:numCache>
          </c:numRef></c:val>
        </c:ser>

        <c:ser>
          <c:idx val="1"/><c:order val="1"/>
          <c:tx><c:strRef>
            <c:f>'Comparatif 2024-2025'!$E$1</c:f>
            <c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Prix moy. 2025 €/m²</c:v></c:pt></c:strCache>
          </c:strRef></c:tx>
          <c:spPr>
            <a:solidFill><a:srgbClr val="C9A227"/></a:solidFill>
            <a:ln><a:noFill/></a:ln>
          </c:spPr>
          <c:dLbls>
            <c:numFmt formatCode="#,##0" sourceLinked="0"/>
            <c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>
            <c:txPr><a:bodyPr/><a:lstStyle/>
              <a:p><a:pPr><a:defRPr sz="750" b="0" lang="fr-FR"/></a:pPr></a:p>
            </c:txPr>
            <c:showLegendKey val="0"/>
            <c:showVal val="1"/>
            <c:showCatName val="0"/>
            <c:showSerName val="0"/>
            <c:showPercent val="0"/>
            <c:showBubbleSize val="0"/>
          </c:dLbls>
          <c:cat><c:strRef>
            <c:f>'Comparatif 2024-2025'!$A$2:$A$7</c:f>
            <c:strCache>
              <c:ptCount val="6"/>
              <c:pt idx="0"><c:v>T1</c:v></c:pt>
              <c:pt idx="1"><c:v>T2</c:v></c:pt>
              <c:pt idx="2"><c:v>T3</c:v></c:pt>
              <c:pt idx="3"><c:v>T4</c:v></c:pt>
              <c:pt idx="4"><c:v>T5+</c:v></c:pt>
              <c:pt idx="5"><c:v>TOTAL</c:v></c:pt>
            </c:strCache>
          </c:strRef></c:cat>
          <c:val><c:numRef>
            <c:f>'Comparatif 2024-2025'!$E$2:$E$7</c:f>
            <c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="6"/></c:numCache>
          </c:numRef></c:val>
        </c:ser>

        <c:axId val="3141592"/>
        <c:axId val="3141593"/>
      </c:barChart>

      <c:catAx>
        <c:axId val="3141592"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:numFmt formatCode="General" sourceLinked="0"/>
        <c:majorTickMark val="none"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:spPr><a:ln><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr>
        <c:txPr><a:bodyPr/><a:lstStyle/>
          <a:p><a:pPr><a:defRPr lang="fr-FR" sz="900"/></a:pPr></a:p>
        </c:txPr>
        <c:crossAx val="3141593"/>
        <c:auto val="1"/>
        <c:lblAlgn val="ctr"/>
        <c:lblOffset val="100"/>
        <c:noMultiLvlLbl val="0"/>
      </c:catAx>

      <c:valAx>
        <c:axId val="3141593"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:numFmt formatCode="#,##0" sourceLinked="0"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:spPr><a:ln><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr>
        <c:txPr><a:bodyPr/><a:lstStyle/>
          <a:p><a:pPr><a:defRPr lang="fr-FR" sz="900"/></a:pPr></a:p>
        </c:txPr>
        <c:crossAx val="3141592"/>
        <c:crossBetween val="between"/>
      </c:valAx>
    </c:plotArea>

    <c:legend>
      <c:legendPos val="b"/>
      <c:overlay val="0"/>
      <c:txPr><a:bodyPr/><a:lstStyle/>
        <a:p><a:pPr><a:defRPr lang="fr-FR" sz="900"/></a:pPr></a:p>
      </c:txPr>
    </c:legend>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
    <c:showDLblsOverMax val="0"/>
  </c:chart>
  <c:spPr>
    <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
    <a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln>
  </c:spPr>
</c:chartSpace>`;
}

function buildDrawingXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr
  xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
  <xdr:twoCellAnchor editAs="oneCell">
    <xdr:from>
      <xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff>
      <xdr:row>9</xdr:row><xdr:rowOff>0</xdr:rowOff>
    </xdr:from>
    <xdr:to>
      <xdr:col>11</xdr:col><xdr:colOff>0</xdr:colOff>
      <xdr:row>29</xdr:row><xdr:rowOff>0</xdr:rowOff>
    </xdr:to>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="2" name="Graphique 1"/>
        <xdr:cNvGraphicFramePr/>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm>
        <a:off x="0" y="0"/>
        <a:ext cx="0" cy="0"/>
      </xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart r:id="rId1"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;
}

const DRAWING_CHART_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart"
    Target="../charts/chart1.xml"/>
</Relationships>`;

const SHEET_DRAWING_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing"
    Target="../drawings/drawing1.xml"/>
</Relationships>`;

async function injectNativeChart(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);

  // ── 1. Trouver le fichier worksheet de "Comparatif 2024-2025" ────────────────
  const wbXml = await zip.file('xl/workbook.xml')?.async('text') ?? '';
  // Extraire r:id de la feuille cible
  const sheetElt = wbXml.split('<sheet ').find((s) => s.includes('name="Comparatif 2024-2025"'));
  const rId = sheetElt?.match(/r:id="([^"]+)"/)?.[1];

  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('text') ?? '';
  const target = rId
    ? relsXml.match(new RegExp(`Id="${rId}"[^>]*Target="([^"]+)"`))?.[1]
    : undefined;

  const sheetFile = target ? `xl/${target}` : 'xl/worksheets/sheet7.xml';
  const sheetFileName = sheetFile.split('/').pop()!;

  // ── 2. Modifier le XML de la feuille : ajouter <drawing r:id="rId1"/> ────────
  let sheetXml = await zip.file(sheetFile)?.async('text') ?? '';

  // S'assurer que le namespace r: est déclaré
  if (!sheetXml.includes('xmlns:r=')) {
    sheetXml = sheetXml.replace(
      '<worksheet ',
      '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    );
  }
  // Injecter la référence au drawing juste avant </worksheet>
  sheetXml = sheetXml.replace('</worksheet>', '<drawing r:id="rId1"/></worksheet>');
  zip.file(sheetFile, sheetXml);

  // ── 3. Ajouter les fichiers XML du graphique ──────────────────────────────────
  zip.file(`xl/worksheets/_rels/${sheetFileName}.rels`, SHEET_DRAWING_RELS);
  zip.file('xl/drawings/drawing1.xml', buildDrawingXml());
  zip.file('xl/drawings/_rels/drawing1.xml.rels', DRAWING_CHART_RELS);
  zip.file('xl/charts/chart1.xml', buildChartXml());

  // ── 4. Mettre à jour [Content_Types].xml ────────────────────────────────────
  let ct = await zip.file('[Content_Types].xml')?.async('text') ?? '';
  const insertBefore = '</Types>';
  const additions: string[] = [];
  if (!ct.includes('chart1.xml')) {
    additions.push(
      '<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>'
    );
  }
  if (!ct.includes('drawing1.xml')) {
    additions.push(
      '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
    );
  }
  if (additions.length > 0) {
    ct = ct.replace(insertBefore, additions.join('\n') + '\n' + insertBefore);
    zip.file('[Content_Types].xml', ct);
  }

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return Buffer.from(buf);
}

// ── Export principal ──────────────────────────────────────────────────────────

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
    if (label) row.getCell(1).font = { bold: true };
    row.height = 18;
  }
  wsSynthese.getColumn(1).width = 32;
  wsSynthese.getColumn(2).width = 50;

  // ── Onglet 5 : Prix par typologie ────────────────────────────────────────────
  const wsTypo = wb.addWorksheet('Prix par typologie');
  const typoHeaders = wsTypo.addRow([
    'Typologie', 'Nb transactions', 'Surface moy. (m²)',
    'Prix moy. €/m²', 'P10 €/m²', 'Q1 €/m²', 'Médiane €/m²', 'Q3 €/m²', 'P90 €/m²',
    'Min retenu €/m²', 'Max retenu €/m²',
  ]);
  headerStyle(wsTypo, typoHeaders);

  for (const t of result.stats_par_typologie) {
    wsTypo.addRow([
      t.typologie, t.count, t.surface_moyenne,
      t.prix_moyen_m2, t.p10_m2, t.q1_m2, t.prix_median_m2, t.q3_m2, t.p90_m2,
      t.min_m2, t.max_m2,
    ]).height = 16;
  }

  wsTypo.addRow([]);
  const noteRow = wsTypo.addRow([
    'Note méthodologique',
    'Les min/max retenus sont sensibles aux valeurs extrêmes. Les percentiles P10/P90 sont à privilégier pour lire la fourchette de marché.',
  ]);
  noteRow.height = 22;
  noteRow.getCell(1).font = { bold: true, italic: true, color: { argb: 'FF555555' }, size: 9 };
  noteRow.getCell(2).font = { italic: true, color: { argb: 'FF555555' }, size: 9 };

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
    for (const sec of pc.sections_autorisees) {
      const commune = sec.nom_commune !== sec.code_commune ? `${sec.nom_commune} (${sec.code_commune})` : sec.code_commune;
      metaRows.push([
        `  ✓ Section ${sec.section_complete}`,
        `${sec.raison} — ${commune} — dist. min ${sec.distance_min_m} m — ${sec.nb_transactions} tx DVF`,
      ]);
    }
    if (pc.sections_candidates_exclues.length > 0) {
      metaRows.push(['', '']);
      metaRows.push(['Sections candidates non retenues', pc.sections_candidates_exclues.length.toString()]);
      for (const sec of pc.sections_candidates_exclues) {
        const commune = sec.nom_commune !== sec.code_commune ? `${sec.nom_commune} (${sec.code_commune})` : sec.code_commune;
        metaRows.push([
          `  ✗ Section ${sec.section_complete}`,
          `${sec.raison_exclusion} — ${commune} — dist. min ${sec.distance_min_m} m — ${sec.nb_transactions} tx DVF`,
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
  metaRows.push(['Seuil prix aberrant bas', '4 000 €/m²']);
  metaRows.push(['Seuil prix aberrant haut', '22 000 €/m²']);

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

  // ── Onglet 7 : Comparatif 2024-2025 ─────────────────────────────────────────
  const comparatif = computeComparatif2024vs2025(result.transactions_retenues);
  addComparatifSheet(wb, comparatif);

  // ── Génération du buffer ExcelJS puis injection du graphique natif ───────────
  const rawBuf = Buffer.from(await wb.xlsx.writeBuffer());
  return injectNativeChart(rawBuf);
}

