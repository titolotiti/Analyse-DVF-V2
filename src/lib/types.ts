export interface GeocodeResult {
  lat: number;
  lon: number;
  label: string;
  city: string;
  citycode: string;
  postcode: string;
  departement: string;
  score: number;
}

export interface CadastreResult {
  id: string;
  section: string;
  numero: string;
  commune: string;
  prefixe_section: string;
}

export interface SectionAdjacenteInfo {
  /** commune (5 chars) + prefixe (3) + section (2) = 10 chars, ex: "920440000C" */
  cle: string;
  code_commune: string;
  nom_commune: string;
  /** Code section brut de l'API, ex: "0C" */
  section: string;
  /** Préfixe de section de l'API, ex: "000" */
  prefixe: string;
  /** prefixe + section = 5 chars, ex: "0000C" — correspond à id_parcelle.slice(5,10) */
  section_complete: string;
  est_cible: boolean;
  raison: 'Section cible' | 'Section voisine (DVF)' | 'Forcée manuellement';
  /** Distance minimale entre l'adresse et une transaction de cette section (m) */
  distance_min_m: number;
  /** Distance moyenne entre l'adresse et les transactions de cette section (m) */
  distance_moy_m: number;
  /** Nombre de transactions DVF brutes dans cette section dans le rayon de recherche */
  nb_transactions: number;
}

export interface SectionCandidateExclue {
  cle: string;
  code_commune: string;
  nom_commune: string;
  section_complete: string;
  distance_min_m: number;
  distance_moy_m: number;
  nb_transactions: number;
  raison_exclusion: 'Trop éloignée' | 'Exclue manuellement' | 'Limite dépassée';
}

export interface CadastrePerimetre {
  parcelle_cible: CadastreResult | null;
  code_commune_cible: string;
  section_cible_code: string;
  section_cible_complete: string;
  sections_autorisees: SectionAdjacenteInfo[];
  sections_candidates_exclues: SectionCandidateExclue[];
  distance_max_section_m: number;
  communes_incluses: { code: string; nom: string }[];
  communes_exclues_du_rayon: string[];
  fallback_haversine: boolean;
}

export type TransactionStatut = 'retenue' | 'exclue' | 'a_verifier';

export type Typologie = 'T1' | 'T2' | 'T3' | 'T4' | 'T5+' | 'Inconnu';

export interface DVFTransaction {
  id_mutation: string;
  date_mutation: string;
  nature_mutation: string;
  valeur_fonciere: number | null;
  adresse_numero: string;
  adresse_nom_voie: string;
  code_postal: string;
  code_commune: string;
  nom_commune: string;
  code_departement: string;
  id_parcelle: string;
  code_section_cadastrale: string;
  type_local: string;
  surface_reelle_bati: number | null;
  nombre_pieces_principales: number | null;
  nombre_lots: number;
  longitude: number | null;
  latitude: number | null;
  // Champs calculés
  adresse_complete: string;
  distance_m: number | null;
  prix_m2: number | null;
  typologie: Typologie;
  statut: TransactionStatut;
  raisons_flag: string[];
}

export interface TypelogieStats {
  typologie: Typologie;
  count: number;
  surface_moyenne: number;
  prix_moyen_m2: number;
  prix_median_m2: number;
  min_m2: number;
  max_m2: number;
}

export interface GlobalStats {
  count_brutes: number;
  count_retenues: number;
  count_exclues: number;
  count_a_verifier: number;
  prix_moyen_m2: number;
  prix_median_m2: number;
  prix_min_m2: number;
  prix_max_m2: number;
  quartile_bas: number;
  quartile_haut: number;
}

export interface AnalysisResult {
  adresse_analysee: string;
  commune: string;
  code_commune: string;
  departement: string;
  geocode: GeocodeResult;
  cadastre: CadastreResult | null;
  perimetre_cadastral: CadastrePerimetre | null;
  perimetre_m: number;
  date_debut: string;
  date_fin: string;
  transactions_brutes: DVFTransaction[];
  transactions_retenues: DVFTransaction[];
  transactions_exclues_ou_a_verifier: DVFTransaction[];
  stats: GlobalStats;
  stats_par_typologie: TypelogieStats[];
  avertissements: string[];
  annees_manquantes: number[];
}

export interface AnalyzeRequest {
  adresse: string;
  rayon_m: number;
  date_debut: string;
  date_fin: string;
  distance_max_section_m?: number;
  nombre_sections_voisines?: number;
  sections_force_include?: string[];
  sections_force_exclude?: string[];
}
