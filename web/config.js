// Where the app reads its data and where share links point.
// Change OWNER/REPO here if the GitHub repository ends up somewhere else.
export const OWNER = 'b3Ed';
export const REPO = 'lucky-lines';
export const BRANCH = 'main';

export const REMOTE_DATA = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/docs/data/`;
export const SHARE_BASE = `https://${OWNER.toLowerCase()}.github.io/${REPO}/`;

const local = ['localhost', '127.0.0.1'].includes(location.hostname);
// Dev server: read the pipeline output straight from the repo. App: remote first, bundled copy as fallback.
export const DATA_SOURCES = local ? ['../docs/data/'] : [REMOTE_DATA, './data/'];
