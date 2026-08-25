const fs = require('node:fs');
const path = require('node:path');

const distDirectory = path.resolve(__dirname, '..', 'dist');
const canonicalEntry = path.join(distDirectory, 'main.js');
const legacyEntry = path.join(distDirectory, 'src', 'main.js');

if (!fs.existsSync(canonicalEntry)) {
  throw new Error(`Nest build entrypoint not found: ${canonicalEntry}`);
}

// Older Render service settings used `node dist/src/main.js`, while the
// current Nest build emits `dist/main.js`. Keep that old command deployable
// during the service-command migration without changing the real output.
fs.mkdirSync(path.dirname(legacyEntry), { recursive: true });
fs.writeFileSync(legacyEntry, "'use strict';\nrequire('../main.js');\n", 'utf8');
