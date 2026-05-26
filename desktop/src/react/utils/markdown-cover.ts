export interface MarkdownCover {
  image: string;
  actualRatio?: string;
  pixelWidth?: number;
  pixelHeight?: number;
  displayWidth?: number;
  displayHeight?: number;
  positionX?: number;
  positionY?: number;
}

export interface MarkdownCoverLayoutPatch {
  displayWidth?: number;
  displayHeight?: number;
  positionX?: number;
  positionY?: number;
}

interface FrontMatterParts {
  hasFrontMatter: boolean;
  frontMatter: string;
  body: string;
  newline: '\n' | '\r\n';
}

const FRONT_MATTER_RE = /^---(\r?\n)([\s\S]*?)(?:\r?\n)---(?:\r?\n|$)/;
const EXPLICIT_PROTOCOL_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const DEPRECATED_COVER_FIELDS = new Set(['prompt', 'promptPreset', 'preferredRatio', 'generatedAt', 'generator']);

function splitFrontMatter(markdown: string): FrontMatterParts {
  const match = markdown.match(FRONT_MATTER_RE);
  if (!match) {
    return { hasFrontMatter: false, frontMatter: '', body: markdown, newline: '\n' };
  }
  const full = match[0];
  const newline = match[1] === '\r\n' ? '\r\n' : '\n';
  return {
    hasFrontMatter: true,
    frontMatter: match[2] || '',
    body: markdown.slice(full.length),
    newline,
  };
}

function unquoteScalar(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseScalar(value: string): string | number | undefined {
  const raw = unquoteScalar(value);
  if (!raw) return undefined;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
    const num = Number(raw);
    if (Number.isFinite(num)) return num;
  }
  return raw;
}

function coverBlockRange(lines: string[]): { start: number; end: number } | null {
  const start = lines.findIndex(line => /^cover:\s*$/.test(line));
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (line.trim() && !/^\s/.test(line)) break;
    end += 1;
  }
  return { start, end };
}

export function parseMarkdownCover(markdown: string): MarkdownCover | null {
  const parts = splitFrontMatter(markdown);
  if (!parts.hasFrontMatter) return null;
  const lines = parts.frontMatter.split(/\r?\n/);
  const range = coverBlockRange(lines);
  if (!range) return null;

  const rawCover: Record<string, string | number | undefined> = {};
  for (const line of lines.slice(range.start + 1, range.end)) {
    const match = line.match(/^\s{2}([A-Za-z][A-Za-z0-9_]*):\s*(.*?)\s*$/);
    if (!match) continue;
    rawCover[match[1]] = parseScalar(match[2]);
  }

  if (typeof rawCover.image !== 'string' || !rawCover.image.trim()) return null;
  const cover: MarkdownCover = { image: rawCover.image.trim() };
  for (const key of ['actualRatio'] as const) {
    if (typeof rawCover[key] === 'string') cover[key] = rawCover[key];
  }
  for (const key of ['pixelWidth', 'pixelHeight', 'displayWidth', 'displayHeight', 'positionX', 'positionY'] as const) {
    if (typeof rawCover[key] === 'number' && Number.isFinite(rawCover[key])) cover[key] = rawCover[key];
  }
  return cover;
}

export function stripMarkdownFrontMatterForPreview(markdown: string): string {
  return splitFrontMatter(markdown).body;
}

function scalarLine(key: string, value: number): string {
  return `  ${key}: ${Math.round(value)}`;
}

function stripDeprecatedCoverFields(lines: string[], range: { start: number; end: number }): void {
  const cleaned: string[] = [];
  let index = range.start + 1;
  while (index < range.end) {
    const line = lines[index];
    const match = line.match(/^\s{2}([A-Za-z][A-Za-z0-9_]*):/);
    if (match && DEPRECATED_COVER_FIELDS.has(match[1])) {
      index += 1;
      while (index < range.end && /^\s{4,}/.test(lines[index])) index += 1;
      continue;
    }
    cleaned.push(line);
    index += 1;
  }

  lines.splice(range.start + 1, range.end - range.start - 1, ...cleaned);
  range.end = range.start + 1 + cleaned.length;
}

export function updateMarkdownCoverLayout(markdown: string, patch: MarkdownCoverLayoutPatch): string {
  const parts = splitFrontMatter(markdown);
  if (!parts.hasFrontMatter) return markdown;

  const lines = parts.frontMatter.split(/\r?\n/);
  let range = coverBlockRange(lines);
  if (!range) {
    lines.push('cover:');
    range = { start: lines.length - 1, end: lines.length };
  }

  const nextLines = [...lines];
  stripDeprecatedCoverFields(nextLines, range);
  const updates: Array<[keyof MarkdownCoverLayoutPatch, number]> = [];
  for (const key of ['displayWidth', 'displayHeight', 'positionX', 'positionY'] as const) {
    const value = patch[key];
    if (typeof value === 'number' && Number.isFinite(value)) updates.push([key, value]);
  }

  let insertAt = range.end;
  for (const [key, value] of updates) {
    const existing = nextLines.findIndex((line, index) => (
      index > range!.start
      && index < range!.end
      && new RegExp(`^\\s{2}${key}:`).test(line)
    ));
    if (existing >= 0) {
      nextLines[existing] = scalarLine(key, value);
    } else {
      nextLines.splice(insertAt, 0, scalarLine(key, value));
      insertAt += 1;
      range.end += 1;
    }
  }

  return `---${parts.newline}${nextLines.join(parts.newline)}${parts.newline}---${parts.newline}${parts.body}`;
}

function normalizePathSegments(pathname: string): string {
  const prefix = pathname.startsWith('/') ? '/' : '';
  const parts: string[] = [];
  for (const part of pathname.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length > 0) parts.pop();
      continue;
    }
    parts.push(part);
  }
  return `${prefix}${parts.join('/')}`;
}

function dirnamePortable(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  if (slash < 0) return null;
  if (slash === 0) return '/';
  return normalized.slice(0, slash);
}

function isAbsoluteLocalPath(value: string): boolean {
  return value.startsWith('/')
    || /^[A-Za-z]:[\\/]/.test(value)
    || value.startsWith('\\\\')
    || value.startsWith('//');
}

export function resolveMarkdownCoverImagePath(markdownFilePath: string | undefined, image: string): string | null {
  const trimmed = image.trim();
  if (!trimmed) return null;
  if (EXPLICIT_PROTOCOL_RE.test(trimmed)) return trimmed;
  if (isAbsoluteLocalPath(trimmed)) return normalizePathSegments(trimmed);
  if (!markdownFilePath) return trimmed;
  const baseDir = dirnamePortable(markdownFilePath);
  if (!baseDir) return trimmed;
  return normalizePathSegments(`${baseDir}/${trimmed}`);
}
