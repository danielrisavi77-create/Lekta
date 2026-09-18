export const ROOT_MAX_LINES = 200;

export const REQUIRED_SCOPED_GUIDES = [
  'src/repair/CLAUDE.md',
  'src/citations/CLAUDE.md',
  'src/docx/CLAUDE.md',
  'supabase/CLAUDE.md',
  'scripts/autonomy/CLAUDE.md',
];

export const RULE_INVENTORY_PATH = 'docs/decisions/CLAUDE_V2_RULE_INVENTORY.md';
export const REQUIRED_CONTEXT_FILES = [...REQUIRED_SCOPED_GUIDES, RULE_INVENTORY_PATH];

function normalizedPath(path) {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

function physicalLineCount(text) {
  if (!text) return 0;
  const normalized = text.replace(/\r\n?/g, '\n');
  return normalized.endsWith('\n')
    ? normalized.slice(0, -1).split('\n').length
    : normalized.split('\n').length;
}

export function auditClaudeContext(rootText, existingPaths) {
  const lineCount = physicalLineCount(rootText);
  const available = new Set([...existingPaths].map(normalizedPath));
  const routes = [...rootText.matchAll(/^\s*-\s+`([^`]+\/CLAUDE\.md)`/gm)].map((match) =>
    normalizedPath(match[1]),
  );
  const problems = [];

  if (lineCount > ROOT_MAX_LINES) {
    problems.push({
      code: 'root-too-long',
      message: `CLAUDE.md ima ${lineCount} redaka, dopusteno je najvise ${ROOT_MAX_LINES}.`,
    });
  }

  if (/@(?:\.\/)?(?:src|supabase|scripts)\/[^\s]+\/CLAUDE\.md/.test(rootText)) {
    problems.push({
      code: 'eager-scoped-import',
      message: 'Root ne smije @-importati path-scoped CLAUDE.md datoteke.',
    });
  }

  for (const path of REQUIRED_SCOPED_GUIDES) {
    if (!routes.includes(path)) {
      problems.push({ code: 'required-route-missing', path, message: `Nedostaje ruta: ${path}` });
    }
  }

  for (const path of REQUIRED_CONTEXT_FILES) {
    if (!available.has(path)) {
      problems.push({
        code: REQUIRED_SCOPED_GUIDES.includes(path) ? 'route-target-missing' : 'required-context-file-missing',
        path,
        message: `Nedostaje datoteka: ${path}`,
      });
    }
  }

  return { lineCount, problems, routes };
}
