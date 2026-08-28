export const MAX_SHELL_JS_GZIP = 8 * 1024;
export const MAX_SHELL_CSS_GZIP = 12 * 1024;

const FORBIDDEN_SHELL_GRAPH_VOCABULARY = [
  'ui-boot',
  'lucide',
  'premium',
  'motion',
  'analysis',
  'profiles',
  'repair',
  'auth',
  'history',
  'preflight',
  'preview',
  'landing',
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
  return FORBIDDEN_SHELL_GRAPH_VOCABULARY.find((vocabulary) => normalized.includes(vocabulary)) ?? null;
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