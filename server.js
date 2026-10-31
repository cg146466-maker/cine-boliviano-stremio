const express = require('express');
const fs = require('fs');
const path = require('path');
const nameToImdb = require('name-to-imdb');

const app = express();
const PORT = process.env.PORT || 10000;
const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const films = JSON.parse(fs.readFileSync(path.join(root, 'catalog.json'), 'utf8'));
const byId = new Map(films.map(f => [f.id, f]));
const cachePath = path.join(root, 'enriched-cache.json');
let enriched = {};
try { enriched = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch (_) {}
let lookupRunning = false;
let lastLookupAt = 0;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function posterFor(f) {
  const hit = enriched[f.id];
  return hit && hit.poster ? hit.poster : 'https://cine-boliviano-stremio.onrender.com/placeholder.png';
}
function metaFor(f) {
  return {
    id: f.id, type: 'movie', name: f.title, releaseInfo: String(f.year),
    poster: posterFor(f), posterShape: 'poster',
    description: `${f.type || 'Cine'} · Dirección: ${f.director || 'Dato no disponible'}${f.notes ? '\n' + f.notes : ''}`,
    country: 'Bolivia'
  };
}
function extrasFromRequest(req) {
  // Stremio normally encodes extra args in the final path segment; accept query args too.
  const segment = req.params[0] || '';
  const parsed = new URLSearchParams(segment);
  return {
    search: String(req.query.search || parsed.get('search') || '').trim().toLocaleLowerCase('es'),
    skip: Math.max(0, Number(req.query.skip || parsed.get('skip') || 0) || 0)
  };
}

app.get('/', (_req, res) => res.type('text').send('La gran videoteca del cine boliviano está activa.'));
app.get('/manifest.json', (_req, res) => res.json(manifest));
app.get('/placeholder.png', (_req, res) => res.sendFile(path.join(root, 'placeholder.png')));
app.get('/health.json', (_req, res) => res.json({ total: films.length, identifiedPosters: Object.values(enriched).filter(x => x && x.poster).length, lookupRunning, version: manifest.version }));
app.get(/^\/catalog\/movie\/cine_boliviano(?:\/([^/]+))?\.json$/, (req, res) => {
  const { search, skip } = extrasFromRequest(req);
  const filtered = films.filter(f => !search || f.title.toLocaleLowerCase('es').includes(search) || String(f.year).includes(search));
  const metas = filtered.slice(skip, skip + 100).map(metaFor);
  res.json({ metas });
});
app.get('/meta/movie/:id.json', (req, res) => {
  const f = byId.get(req.params.id);
  if (!f) return res.status(404).json({ error: 'No encontrado' });
  res.json({ meta: metaFor(f) });
});

async function enrichOne(f) {
  // Cache only verified positive matches. A failed lookup is NOT permanent:
  // it will be retried on the next background pass/restart.
  if (enriched[f.id] && enriched[f.id].poster) return;
  try {
    const result = await nameToImdb({ name: f.title, year: Number(f.year), type: 'movie', providers: ['imdbFind'] });
    const candidate = result && result.inf && result.inf.meta;
    const similarity = Number(candidate && candidate.similarity || 0);
    const candidateYear = Number(candidate && candidate.year || 0);
    const yearOK = !candidateYear || Math.abs(candidateYear - Number(f.year)) <= 1;
    const imdbId = result && result.res;
    const poster = candidate && candidate.image && candidate.image.src;
    if (imdbId && /^tt\d+$/.test(imdbId) && poster && candidate && similarity >= 0.92 && yearOK) {
      enriched[f.id] = { imdbId, poster, matchedTitle: candidate.name, year: candidateYear, similarity };
      return true;
    }
  } catch (err) {
    // Temporary provider/network errors are deliberately not cached.
  }
  return false;
}
function savePositiveCache() {
  try {
    const positives = Object.fromEntries(Object.entries(enriched).filter(([,v]) => v && v.poster));
    fs.writeFileSync(cachePath, JSON.stringify(positives, null, 2));
  } catch (_) {}
}
async function enrichCatalog() {
  if (lookupRunning || Date.now() - lastLookupAt < 30 * 60 * 1000) return;
  lookupRunning = true; lastLookupAt = Date.now();
  try {
    let found = 0;
    for (let i = 0; i < films.length; i += 3) {
      const results = await Promise.all(films.slice(i, i + 3).map(enrichOne));
      found += results.filter(Boolean).length;
      if (i % 15 === 0) savePositiveCache();
      // Gentle pacing for the public lookup provider.
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    savePositiveCache();
    console.log(`Búsqueda terminada: ${Object.values(enriched).filter(x => x && x.poster).length} carteles verificados; ${found} nuevos en esta pasada.`);
  } finally { lookupRunning = false; }
}

app.listen(PORT, () => {
  console.log(`Addon ${manifest.version} activo; ${films.length} registros; páginas de 100.`);
  enrichCatalog().catch(err => console.error('Error de identificación:', err.message));
});
