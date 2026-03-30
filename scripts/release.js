const { execSync } = require('child_process');
const v = require('../package.json').version;
execSync(`git add -A && git commit -m "Release ${v}" && git push`, { stdio: 'inherit' });
