const fs = require('fs-extra');
const os = require('node:os');
const path = require('node:path');

const { generateXMLOutput } = require('../flattener/xml');

describe('generateXMLOutput', () => {
  let tmpDir;
  let outputFile;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flattener-xml-'));
    outputFile = path.join(tmpDir, 'bundle.xml');
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.remove(tmpDir);
    }
  });

  test('writes XML with escaped paths and CDATA for special content', async () => {
    const largeBlock = 'X'.repeat(1024 * 512); // 512KB block to exercise backpressure
    const content = `${largeBlock}\nNeeds & escape\nContains ]]> marker`;

    await generateXMLOutput(
      {
        textFiles: [
          { path: 'docs/example.md', content },
          { path: 'docs/empty.md', content: '' },
        ],
      },
      outputFile,
    );

    const xml = await fs.readFile(outputFile, 'utf8');

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<file path='docs/example.md'><![CDATA[");
    expect(xml).toContain(']]]]><![CDATA[>');
    expect(xml).toContain("<file path='docs/empty.md'/>");
    expect(xml.trim().endsWith('</files>')).toBe(true);
  });
});
