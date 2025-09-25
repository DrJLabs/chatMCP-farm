const fs = require('fs-extra');

function escapeXml(string_) {
  if (typeof string_ !== 'string') {
    return String(string_);
  }
  return string_.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll("'", '&apos;');
}

function generateXMLOutput(aggregatedContent, outputPath) {
  const { textFiles } = aggregatedContent;
  const writeStream = fs.createWriteStream(outputPath, { encoding: 'utf8' });

  return new Promise((resolve, reject) => {
    writeStream.on('error', reject);
    writeStream.on('finish', resolve);

    // Sort files by path for deterministic order
    const filesSorted = [...textFiles].sort((a, b) => a.path.localeCompare(b.path));
    let index = 0;

    const writeNext = () => {
      if (index >= filesSorted.length) {
        if (!writeStream.write('</files>\n')) {
          writeStream.once('drain', () => writeStream.end());
        } else {
          writeStream.end();
        }
        return;
      }

      const file = filesSorted[index++];
      const p = escapeXml(file.path);
      const content = typeof file.content === 'string' ? file.content : '';
      let entry = '';

      if (content.length === 0) {
        entry = `\t<file path='${p}'/>\n`;
      } else {
        const needsCdata = content.includes('<') || content.includes('&') || content.includes(']]>');
        if (needsCdata) {
          const safe = content.replaceAll(']]>', ']]]]><![CDATA[>');
          const trimmed = safe.replace(/[\r\n]+$/, '');
          const body =
            trimmed.length > 0
              ? trimmed
                  .split('\n')
                  .map((line) => `\t\t${line}`)
                  .join('\n')
              : '';
          entry = `\t<file path='${p}'><![CDATA[\n${body}]]></file>\n`;
        } else {
          const trimmed = content.replace(/[\r\n]+$/, '');
          const body =
            trimmed.length > 0
              ? trimmed
                  .split('\n')
                  .map((line) => `\t\t${line}`)
                  .join('\n')
              : '';
          entry = `\t<file path='${p}'>\n${body}</file>\n`;
        }
      }

      if (!writeStream.write(entry)) {
        writeStream.once('drain', writeNext);
        return;
      }

      setImmediate(writeNext);
    };

    const header = '<?xml version="1.0" encoding="UTF-8"?>\n<files>\n';
    if (!writeStream.write(header)) {
      writeStream.once('drain', writeNext);
    } else {
      writeNext();
    }
  });
}

module.exports = { generateXMLOutput };
