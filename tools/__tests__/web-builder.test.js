const fs = require('fs-extra');
const os = require('node:os');
const path = require('node:path');

const WebBuilder = require('../builders/web-builder');

async function createTempRoot() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'web-builder-test-'));
  const root = path.join(tmpDir, 'workspace');
  await fs.ensureDir(root);
  return { tmpDir, root };
}

describe('WebBuilder.readResourceFrom', () => {
  let builder;
  let tmpDir;
  let rootDir;

  beforeEach(async () => {
    const dirs = await createTempRoot();
    tmpDir = dirs.tmpDir;
    rootDir = dirs.root;
    builder = new WebBuilder({ rootDir });
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.remove(tmpDir);
    }
  });

  test('loads markdown dependency when extension omitted', async () => {
    const baseDir = path.join(rootDir, 'bmad-core');
    const tasksDir = path.join(baseDir, 'tasks');
    await fs.ensureDir(tasksDir);
    await fs.writeFile(path.join(tasksDir, 'sample.md'), 'hello md');

    const loaded = await builder.readResourceFrom(baseDir, 'tasks', 'sample');

    expect(loaded).not.toBeNull();
    expect(loaded.path).toMatch(/sample\.md$/);
    expect(loaded.content).toBe('hello md');
  });

  test('prefers provided candidates before fallback extensions', async () => {
    const baseDir = path.join(rootDir, 'bmad-core');
    const utilsDir = path.join(baseDir, 'utils');
    await fs.ensureDir(utilsDir);
    await fs.writeFile(path.join(utilsDir, 'tool.md'), 'markdown version');
    await fs.writeFile(path.join(utilsDir, 'tool.yaml'), 'yaml: version');

    const loaded = await builder.readResourceFrom(baseDir, 'utils', 'tool', ['tool.yaml']);

    expect(loaded).not.toBeNull();
    expect(loaded.path).toMatch(/tool\.yaml$/);
    expect(loaded.content).toBe('yaml: version');
  });

  test('supports yml fallback when only .yml exists', async () => {
    const baseDir = path.join(rootDir, 'bmad-core');
    const dataDir = path.join(baseDir, 'data');
    await fs.ensureDir(dataDir);
    await fs.writeFile(path.join(dataDir, 'dataset.yml'), 'name: test');

    const loaded = await builder.readResourceFrom(baseDir, 'data', 'dataset');

    expect(loaded).not.toBeNull();
    expect(loaded.path).toMatch(/dataset\.yml$/);
    expect(loaded.content).toBe('name: test');
  });

  test('blocks path traversal attempts outside resource directory', async () => {
    const baseDir = path.join(rootDir, 'bmad-core');
    const tasksDir = path.join(baseDir, 'tasks');
    await fs.ensureDir(tasksDir);
    await fs.writeFile(path.join(baseDir, 'evil.md'), 'not allowed');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const loaded = await builder.readResourceFrom(baseDir, 'tasks', '../evil.md');
    warnSpy.mockRestore();

    expect(loaded).toBeNull();
  });
});
