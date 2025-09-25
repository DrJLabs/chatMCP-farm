const fs = require('fs-extra');
const os = require('node:os');
const path = require('node:path');

const DependencyResolver = require('../lib/dependency-resolver');

async function setupRoot() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dep-resolver-test-'));
  const root = path.join(tmpDir, 'workspace');
  await fs.ensureDir(root);
  await fs.ensureDir(path.join(root, 'bmad-core'));
  await fs.ensureDir(path.join(root, 'common'));
  return { tmpDir, root };
}

describe('DependencyResolver.loadResource', () => {
  let resolver;
  let tmpDir;
  let rootDir;

  beforeEach(async () => {
    const dirs = await setupRoot();
    tmpDir = dirs.tmpDir;
    rootDir = dirs.root;
    resolver = new DependencyResolver(rootDir);
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.remove(tmpDir);
    }
  });

  test('loads markdown resource from bmad-core by id without extension', async () => {
    const filePath = path.join(rootDir, 'bmad-core', 'tasks', 'alpha.md');
    await fs.outputFile(filePath, '# alpha');

    const resource = await resolver.loadResource('tasks', 'alpha');

    expect(resource).not.toBeNull();
    expect(resource.path).toBe(filePath);
    expect(resource.content).toBe('# alpha');
  });

  test('falls back to common directory when core resource missing', async () => {
    const commonPath = path.join(rootDir, 'common', 'templates', 'beta.yaml');
    await fs.outputFile(commonPath, 'kind: beta');

    const resource = await resolver.loadResource('templates', 'beta.yaml');

    expect(resource).not.toBeNull();
    expect(resource.path).toBe(commonPath);
    expect(resource.content).toBe('kind: beta');
  });

  test('caches resolved resources by id and type', async () => {
    const filePath = path.join(rootDir, 'bmad-core', 'utils', 'gamma.yml');
    await fs.outputFile(filePath, 'value: 1');

    const first = await resolver.loadResource('utils', 'gamma');
    const second = await resolver.loadResource('utils', 'gamma');

    expect(first).toBe(second);
  });

  test('blocks traversal outside resource root', async () => {
    const outside = path.join(rootDir, 'bmad-core', 'oops.md');
    await fs.outputFile(outside, 'do not read');

    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const resource = await resolver.loadResource('tasks', '../oops.md');

    expect(resource).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
