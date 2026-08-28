export const MAX_SHELL_JS_GZIP = 8 * 1024;
export const MAX_SHELL_CSS_GZIP = 12 * 1024;

const FORBIDDEN_SHELL_GRAPH_RULES = [
  { vocabulary: 'ui-boot', pattern: /(?:^|[/_.-])ui-boot(?:$|[/_.-])/u },
  { vocabulary: 'lucide', pattern: /(?:^|[/@_.-])lucide(?:$|[/_.-])/u },
  { vocabulary: 'premium', pattern: /(?:^|[/_.-])premium(?:$|[/_.-])/u },
  { vocabulary: 'motion', pattern: /(?:^|[/_.-])motion(?:$|[/_.-])/u },
  { vocabulary: 'analysis', pattern: /(?:^|[/_.-])analysis(?:$|[/_.-])/u },
  { vocabulary: 'profiles', pattern: /(?:^|[/_.-])profiles(?:$|[/_.-])/u },
  { vocabulary: 'repair', pattern: /(?:^|[/_.-])repair(?:$|[/_.-])/u },
  { vocabulary: 'auth', pattern: /(?:^|[/_.-])auth(?:$|[/_.-])/u },
  { vocabulary: 'history', pattern: /(?:^|[/_.-])history(?:$|[/_.-])/u },
  { vocabulary: 'preflight', pattern: /(?:^|[/_.-])preflight(?:$|[/_.-])/u },
  { vocabulary: 'preview', pattern: /(?:^|[/_.-])preview(?:$|[/_.-])/u },
  { vocabulary: 'landing', pattern: /(?:^|[/_.-])landing(?:$|[/_.-])/u },
  { vocabulary: 'src/report', pattern: /(?:^|\/)src\/report(?:\/|$)/u },
  { vocabulary: '@supabase', pattern: /(?:^|\/)node_modules\/@supabase(?:\/|$)/u },
] as const;

export interface RouteShellBudgetMeasurement {
  readonly jsGzipBytes: number;
  readonly cssGzipBytes: number;
  readonly inputPaths: readonly string[];
}

export type RouteShellBudgetIssue =
  | {
    readonly kind: 'js-gzip' | 'css-gzip';
    readonly actualBytes: number;
    readonly maxBytes: number;
  }
  | {
    readonly kind: 'forbidden-input';
    readonly inputPath: string;
    readonly vocabulary: string;
  };

function normalizeInputPath(inputPath: string): string {
  return inputPath.replaceAll('\\', '/');
}

function forbiddenVocabulary(inputPath: string): string | null {
  const normalized = normalizeInputPath(inputPath).toLowerCase();
  return FORBIDDEN_SHELL_GRAPH_RULES.find(({ pattern }) => pattern.test(normalized))?.vocabulary ?? null;
}

export function inspectRouteShellBudget(measurement: RouteShellBudgetMeasurement): RouteShellBudgetIssue[] {
  const issues: RouteShellBudgetIssue[] = [];
  if (measurement.jsGzipBytes > MAX_SHELL_JS_GZIP) {
    issues.push({ kind: 'js-gzip', actualBytes: measurement.jsGzipBytes, maxBytes: MAX_SHELL_JS_GZIP });
  }
  if (measurement.cssGzipBytes > MAX_SHELL_CSS_GZIP) {
    issues.push({ kind: 'css-gzip', actualBytes: measurement.cssGzipBytes, maxBytes: MAX_SHELL_CSS_GZIP });
  }
  for (const inputPath of measurement.inputPaths) {
    const vocabulary = forbiddenVocabulary(inputPath);
    if (vocabulary) {
      issues.push({ kind: 'forbidden-input', inputPath: normalizeInputPath(inputPath), vocabulary });
    }
  }
  return issues;
}