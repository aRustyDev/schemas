import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.mock('@actions/core');
jest.mock('@actions/github');

describe('static-site-index-gen action', () => {
  let tempDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'index-gen-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('generates index.html for a directory', async () => {
    // Setup test directory structure
    fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'content');
    fs.writeFileSync(path.join(tempDir, 'file2.json'), '{}');
    fs.mkdirSync(path.join(tempDir, 'subdir'));

    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        root: tempDir,
        'output-format': 'html',
        'include-metadata': 'true',
        'title-template': 'Index of {path}',
        ignore: 'node_modules\n.git',
      };
      return inputs[name] || '';
    });

    const { run } = await import('../src/main');
    await run();

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith('generated-count', expect.any(String));

    // Verify index.html was created
    const indexPath = path.join(tempDir, 'index.html');
    expect(fs.existsSync(indexPath)).toBe(true);

    const content = fs.readFileSync(indexPath, 'utf-8');
    expect(content).toContain('file1.txt');
    expect(content).toContain('file2.json');
    expect(content).toContain('subdir');
  });

  it('generates both HTML and JSON when format is both', async () => {
    fs.writeFileSync(path.join(tempDir, 'test.md'), '# Test');

    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        root: tempDir,
        'output-format': 'both',
        'include-metadata': 'false',
        'title-template': 'Index of {path}',
        ignore: '',
      };
      return inputs[name] || '';
    });

    const { run } = await import('../src/main');
    await run();

    expect(fs.existsSync(path.join(tempDir, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'index.json'))).toBe(true);

    const jsonContent = JSON.parse(
      fs.readFileSync(path.join(tempDir, 'index.json'), 'utf-8')
    );
    expect(jsonContent.entries).toContainEqual(
      expect.objectContaining({ name: 'test.md', type: 'file' })
    );
  });

  it('respects ignore patterns', async () => {
    fs.mkdirSync(path.join(tempDir, 'node_modules'));
    fs.writeFileSync(path.join(tempDir, 'node_modules', 'pkg.js'), '');
    fs.writeFileSync(path.join(tempDir, 'app.js'), '');

    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        root: tempDir,
        'output-format': 'json',
        'include-metadata': 'false',
        'title-template': 'Index of {path}',
        ignore: 'node_modules',
      };
      return inputs[name] || '';
    });

    const { run } = await import('../src/main');
    await run();

    const jsonContent = JSON.parse(
      fs.readFileSync(path.join(tempDir, 'index.json'), 'utf-8')
    );

    // Should include app.js but not node_modules
    expect(jsonContent.entries).toContainEqual(
      expect.objectContaining({ name: 'app.js' })
    );
    expect(jsonContent.entries).not.toContainEqual(
      expect.objectContaining({ name: 'node_modules' })
    );
  });

  it('fails gracefully when root directory does not exist', async () => {
    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      if (name === 'root') return '/nonexistent/path';
      return '';
    });

    const { run } = await import('../src/main');
    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('does not exist')
    );
  });

  it('includes file metadata when enabled', async () => {
    const testFile = path.join(tempDir, 'test.txt');
    fs.writeFileSync(testFile, 'Hello World');

    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        root: tempDir,
        'output-format': 'json',
        'include-metadata': 'true',
        'title-template': 'Index of {path}',
        ignore: '',
      };
      return inputs[name] || '';
    });

    const { run } = await import('../src/main');
    await run();

    const jsonContent = JSON.parse(
      fs.readFileSync(path.join(tempDir, 'index.json'), 'utf-8')
    );

    const testEntry = jsonContent.entries.find(
      (e: { name: string }) => e.name === 'test.txt'
    );
    expect(testEntry).toBeDefined();
    expect(testEntry.size).toBe(11); // "Hello World" is 11 bytes
    expect(testEntry.modified).toBeDefined();
  });
});
