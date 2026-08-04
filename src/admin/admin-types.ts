/**
 * Lekta Control Center: dijeljeni tipovi izmedju API klijenta, transform sloja i render modula.
 * Oblik svakog *Stats sucelja zrcali tocno ono sto vraca odgovarajuca admin_*_stats() funkcija
 * (supabase/migrations/0038_admin_dashboard_stats.sql) - ne mijenjaj jedno bez drugog.
 */

export type PeriodKind = 'today' | '7d' | '30d' | 'custom';

export interface Period {
  kind: PeriodKind;
  /** YYYY-MM-DD, samo za kind==='custom'. */
  fromDate?: string;
  toDate?: string;
}

/**
 * Sest sekcija u v1. Growth (cohorts/retention) i Academic Suite su NAMJERNO izostavljene -
 * vidi plan implementacije, odjeljak "Odgođeno s uvjetom povratka": prvo nema dovoljno
 * korisnika da retention grafovi nose signal, drugo cross-product event vokabular
 * (AcademicSuiteEventName) je deklariran ali ga nijedan producer jos ne emitira. Dodavanje
 * sekcije kasnije je novi unos ovdje + 4 nova fajla, ne refaktor postojecih.
 */
export type SectionId = 'overview' | 'funnel' | 'revenue' | 'operations' | 'usage' | 'coverage';

export const SECTION_IDS: SectionId[] = ['overview', 'funnel', 'revenue', 'operations', 'usage', 'coverage'];

export const SECTION_LABELS: Record<SectionId, string> = {
  overview: 'Overview',
  funnel: 'Funnel',
  revenue: 'Revenue',
  operations: 'Operations',
  usage: 'Usage',
  coverage: 'Coverage & Demand',
};

export interface RangeInfo {
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
}

export interface RetentionNote {
  table: string;
  retentionDays: number | null;
  note: string;
}

export interface FunnelStepCount {
  event: string;
  count: number;
}

export interface OverviewBucket {
  newUsers: number;
  analysesCompleted: number;
  purchasesCompleted: number;
  grossRevenueEur: number;
  refunds: number;
  newDocumentSlots: number;
  repairJobsDone: number;
  facultyRequestsNew: number;
  headlineFunnel: FunnelStepCount[];
}

export interface OverviewStats {
  generatedAt: string;
  range: RangeInfo;
  current: OverviewBucket;
  previous: OverviewBucket;
  retention: RetentionNote[];
}

export interface FunnelStats {
  generatedAt: string;
  /** Uvijek "event_count": analytics_events nema session/user identifikator, pa ovo NIJE
   *  cohort-deduplicirani funnel, samo brojanje neovisnih dogadjaja po koraku. */
  basis: 'event_count';
  range: RangeInfo;
  current: FunnelStepCount[];
  previous: FunnelStepCount[];
  retention: RetentionNote[];
}

export interface RevenueByWorkType { workType: string; grossEur: number; purchaseCount: number }
export interface RevenueByProduct { productId: string; grossEur: number; purchaseCount: number }
export interface RevenueByAudience { audience: string; grossEur: number }

export interface RevenueBucket {
  grossEur: number;
  refundsEur: number;
  netEur: number;
  estimatedNetAfterMorFeeEur: number;
  purchaseCount: number;
  refundCount: number;
  byWorkType: RevenueByWorkType[];
  byProduct: RevenueByProduct[];
  byAudience: RevenueByAudience[];
}

export interface FeeAssumptions {
  morFeePct: number;
  morFeeFixedEur: number;
  verified: false;
  source: string;
  note: string;
}

export interface RevenueTrendPoint {
  date: string;
  grossEur: number;
  purchaseCount: number;
}

export interface RevenuePriceChange {
  date: string;
  productId: string;
  oldValue: string | null;
  newValue: string | null;
  note: string | null;
}

export interface RevenueStats {
  generatedAt: string;
  range: RangeInfo;
  feeAssumptions: FeeAssumptions;
  /** Dnevni raspis SAMO tekuceg prozora (0 popunjeno za dane bez kupnje) - za trend graf. */
  trend: RevenueTrendPoint[];
  priceChanges: RevenuePriceChange[];
  current: RevenueBucket;
  previous: RevenueBucket;
  retention: RetentionNote[];
}

export interface OperationsRepairBucket { total: number; done: number; failed: number; avgChangesCount: number; distinctUsers: number }
export interface OperationsGenerationsBucket { total: number; byStatus: Array<{ status: string; count: number }> }
export interface OperationsPreflightBucket {
  total: number;
  avgDurationMs: number | null;
  bySeverity: Array<{ severity: string; count: number }>;
  /** Status samog pipelinea (preflight_checks.status), NE dokumentnih nalaza - vidi bySeverity za to. */
  done: number;
  error: number;
}

export interface OperationsBucket {
  repair: OperationsRepairBucket;
  generations: OperationsGenerationsBucket;
  preflight: OperationsPreflightBucket;
}

export interface OperationsStats {
  generatedAt: string;
  range: RangeInfo;
  current: OperationsBucket;
  previous: OperationsBucket;
  retention: RetentionNote[];
}

export interface UsageSlotRow { tier: number; workType: string; count: number }
export interface UsageRepairRow { workType: string; count: number }

export interface UsageBucket {
  slotsByTierAndWorkType: UsageSlotRow[];
  repairJobsByWorkType: UsageRepairRow[];
}

export interface UsageStats {
  generatedAt: string;
  range: RangeInfo;
  current: UsageBucket;
  previous: UsageBucket;
  retention: RetentionNote[];
}

export interface CoverageCell {
  facultyId: string | null;
  facultyNameRaw: string | null;
  programId: string | null;
  workType: string | null;
  totalRequests: number;
  uniqueRequesters: number;
  withEmail: number;
  firstSeen: string;
  lastSeen: string;
}

export interface CoverageCurrentBucket {
  totalRequests: number;
  withEmail: number;
  distinctFaculties: number;
  topCells: CoverageCell[];
}

/** previous NEMA topCells: usporedba dvije rangirane liste nije "delta%"-tipa, samo skalarni brojevi jesu. */
export interface CoveragePreviousBucket {
  totalRequests: number;
  withEmail: number;
  distinctFaculties: number;
}

export interface CoverageStats {
  generatedAt: string;
  range: RangeInfo;
  current: CoverageCurrentBucket;
  previous: CoveragePreviousBucket;
  retention: RetentionNote[];
}

export interface SectionStatsMap {
  overview: OverviewStats;
  funnel: FunnelStats;
  revenue: RevenueStats;
  operations: OperationsStats;
  usage: UsageStats;
  coverage: CoverageStats;
}
