import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  path: string;
}

interface DirectoryIndex {
  path: string;
  entries: FileEntry[];
  generated: string;
}

export async function run(): Promise<void> {
  try {
    const rootDir = core.getInput('root') || '.';
    const outputFormat = core.getInput('output-format') || 'both';
    const stylesheet = core.getInput('stylesheet');
    const ignorePatterns = parseIgnorePatterns(core.getInput('ignore'));
    const includeMetadata = core.getInput('include-metadata') === 'true';
    const titleTemplate = core.getInput('title-template') || 'Index of {path}';

    core.info(`Scanning directory: ${rootDir}`);
    core.info(`Output format: ${outputFormat}`);
    core.info(`Ignore patterns: ${ignorePatterns.join(', ')}`);

    const absoluteRoot = path.resolve(rootDir);

    if (!fs.existsSync(absoluteRoot)) {
      throw new Error(`Root directory does not exist: ${absoluteRoot}`);
    }

    const stats = {
      generatedCount: 0,
      directoriesScanned: 0,
    };

    // Walk directory tree and generate indices
    await walkAndGenerate(
      absoluteRoot,
      absoluteRoot,
      ignorePatterns,
      outputFormat,
      stylesheet,
      includeMetadata,
      titleTemplate,
      stats
    );

    core.setOutput('generated-count', stats.generatedCount.toString());
    core.setOutput('directories-scanned', stats.directoriesScanned.toString());

    if (outputFormat === 'json' || outputFormat === 'both') {
      core.setOutput('manifest-path', path.join(rootDir, 'index.json'));
    }

    core.info(`Generated ${stats.generatedCount} index files across ${stats.directoriesScanned} directories`);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

function parseIgnorePatterns(input: string): string[] {
  if (!input) return [];

  return input
    .split(/[\n,]/)
    .map(p => p.trim())
    .filter(p => p && !p.startsWith('#'));
}

function shouldIgnore(relativePath: string, patterns: string[]): boolean {
  const normalizedPath = relativePath.replace(/\\/g, '/');

  for (const pattern of patterns) {
    if (minimatch(normalizedPath, pattern, { dot: true })) {
      return true;
    }
    // Also check if basename matches
    if (minimatch(path.basename(normalizedPath), pattern, { dot: true })) {
      return true;
    }
  }

  return false;
}

async function walkAndGenerate(
  dir: string,
  rootDir: string,
  ignorePatterns: string[],
  outputFormat: string,
  stylesheet: string,
  includeMetadata: boolean,
  titleTemplate: string,
  stats: { generatedCount: number; directoriesScanned: number }
): Promise<void> {
  const relativePath = path.relative(rootDir, dir) || '/';

  if (shouldIgnore(relativePath, ignorePatterns)) {
    core.debug(`Skipping ignored directory: ${relativePath}`);
    return;
  }

  stats.directoriesScanned++;

  const entries: FileEntry[] = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const itemPath = path.join(dir, item.name);
    const itemRelativePath = path.relative(rootDir, itemPath);

    // Skip generated index files
    if (item.name === 'index.html' || item.name === 'index.json') {
      continue;
    }

    if (shouldIgnore(itemRelativePath, ignorePatterns)) {
      continue;
    }

    const entry: FileEntry = {
      name: item.name,
      type: item.isDirectory() ? 'directory' : 'file',
      path: itemRelativePath,
    };

    if (includeMetadata && item.isFile()) {
      const stat = fs.statSync(itemPath);
      entry.size = stat.size;
      entry.modified = stat.mtime.toISOString();
    }

    entries.push(entry);

    // Recurse into subdirectories
    if (item.isDirectory()) {
      await walkAndGenerate(
        itemPath,
        rootDir,
        ignorePatterns,
        outputFormat,
        stylesheet,
        includeMetadata,
        titleTemplate,
        stats
      );
    }
  }

  // Sort entries: directories first, then files, alphabetically
  entries.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  const index: DirectoryIndex = {
    path: relativePath === '' ? '/' : '/' + relativePath,
    entries,
    generated: new Date().toISOString(),
  };

  // Generate HTML
  if (outputFormat === 'html' || outputFormat === 'both') {
    const html = generateHtml(index, stylesheet, titleTemplate);
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    stats.generatedCount++;
    core.debug(`Generated HTML index: ${relativePath}/index.html`);
  }

  // Generate JSON
  if (outputFormat === 'json' || outputFormat === 'both') {
    fs.writeFileSync(
      path.join(dir, 'index.json'),
      JSON.stringify(index, null, 2)
    );
    stats.generatedCount++;
    core.debug(`Generated JSON index: ${relativePath}/index.json`);
  }
}

function generateHtml(
  index: DirectoryIndex,
  stylesheet: string,
  titleTemplate: string
): string {
  const title = titleTemplate.replace('{path}', index.path);

  const stylesheetLink = stylesheet
    ? `<link rel="stylesheet" href="${escapeHtml(stylesheet)}">`
    : getDefaultStyles();

  const rows = index.entries
    .map(entry => {
      const icon = entry.type === 'directory' ? '📁' : '📄';
      const href = entry.type === 'directory'
        ? `${entry.name}/`
        : entry.name;
      const sizeCell = entry.size !== undefined
        ? formatFileSize(entry.size)
        : '-';
      const dateCell = entry.modified
        ? formatDate(entry.modified)
        : '-';

      return `    <tr>
      <td>${icon}</td>
      <td><a href="${escapeHtml(href)}">${escapeHtml(entry.name)}${entry.type === 'directory' ? '/' : ''}</a></td>
      <td class="size">${sizeCell}</td>
      <td class="date">${dateCell}</td>
    </tr>`;
    })
    .join('\n');

  const parentLink = index.path !== '/'
    ? `    <tr>
      <td>📁</td>
      <td><a href="../">../</a></td>
      <td class="size">-</td>
      <td class="date">-</td>
    </tr>\n`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${stylesheetLink}
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <table>
    <thead>
      <tr>
        <th></th>
        <th>Name</th>
        <th>Size</th>
        <th>Modified</th>
      </tr>
    </thead>
    <tbody>
${parentLink}${rows}
    </tbody>
  </table>
  <footer>
    <p>Generated ${formatDate(index.generated)}</p>
  </footer>
</body>
</html>`;
}

function getDefaultStyles(): string {
  return `<style>
    :root {
      --bg: #1a1a2e;
      --fg: #eef;
      --link: #64b5f6;
      --border: #333;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
      background: var(--bg);
      color: var(--fg);
      max-width: 900px;
      margin: 2rem auto;
      padding: 0 1rem;
    }
    h1 { border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid var(--border); }
    th:first-child, td:first-child { width: 2rem; text-align: center; }
    .size, .date { text-align: right; color: #888; font-size: 0.9rem; }
    a { color: var(--link); text-decoration: none; }
    a:hover { text-decoration: underline; }
    footer { margin-top: 2rem; color: #666; font-size: 0.8rem; }
  </style>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

run();
