const express = require('express');
const fs = require('fs');
const path = require('path');
const nameToImdb = require('name-to-imdb');

const app = express();
const PORT = process.env.PORT || 10000;
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
const films = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalog.json'), 'utf8'));
const cachePath = path.join(__dirname, 'enriched-cache.json');
let enriched = {};
try { enriched = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch (_) {}

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const byId = new Map(films.map(f => [f.id, f]));
const cleanText = value => String(value || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function posterFor(f) {
  const match = enriched[f.id];
  if (match && match.poster) return match.poster;
  // PNG fallback: Stremio's poster metadata expects PNG/JPEG, not SVG.
  return '/placeholder.png';
}
function metaFor(f) {
  const match = enriched[f.id];
  const imdbId = match && match.imdbId;
  return {
    id: imdbId || f.id,
    type: 'movie',
    name: f.title,
    releaseInfo: String(f.year),
    poster: posterFor(f),
    posterShape: 'poster',
    description: `${f.type || 'Cine'} · Dirección: ${f.director || 'Dato no disponible'}${f.notes ? '\n' + f.notes : ''}`,
    country: 'Bolivia'
  };
}

app.get('/', (_req, res) => res.type('text').send('La gran videoteca del cine boliviano está activa.'));
app.get('/manifest.json', (_req, res) => res.json(manifest));
app.get('/placeholder.png', (_req, res) => res.sendFile(path.join(__dirname, 'placeholder.png')));

// Stremio requests later pages as /catalog/movie/cine_boliviano/skip=100.json.
// Keep each response at no more than 100 items, as required by the addon protocol.
app.get(/^\/catalog\/movie\/cine_boliviano(?:\/([^/]+))?\.json$/, (req, res) => {
  const extraSegment = req.params[0] || '';
  const extra = new URLSearchParams(extraSegment);
  const q = String(req.query.search || extra.get('search') || '').toLocaleLowerCase('es');
  const skip = Math.max(0, Number(req.query.skip || extra.get('skip') || 0));
  const filtered = films.filter(f =>
    !q || f.title.toLocaleLowerCase('es').includes(q) || String(f.year).includes(q)
  );
  const metas = filtered.slice(skip, skip + 100).map(metaFor);
  res.json({ metas });
});

app.get('/meta/movie/:id.json', (req, res) => {
  const f = byId.get(req.params.id);
  if (!f) return res.status(404).json({ error: 'No encontrado' });
  res.json({ meta: metaFor(f) });
});

// Match conservatively: only accept near-exact title matches with a close year.
async function enrichOne(f) {
  if (enriched[f.id]) return;
  try {
    const result = await nameToImdb({ name: f.title, year: Number(f.year), type: 'movie', providers: ['imdbFind'] });
    const candidate = result && result.inf && result.inf.meta;
    const similarity = Number(candidate && candidate.similarity || 0);
    const candidateYear = Number(candidate && candidate.year || 0);
    const yearOK = !candidateYear || Math.abs(candidateYear - Number(f.year)) <= 1;
    const imdbId = result && result.res;
    if (imdbId && /^tt\d+$/.test(imdbId) && candidate && similarity >= 0.92 && yearOK) {
      enriched[f.id] = { imdbId, poster: candidate.image && candidate.image.src || null, matchedTitle: candidate.name, year: candidateYear, similarity };
    } else {
      enriched[f.id] = { imdbId: null, poster: null };
    }
  } catch (_) {
    enriched[f.id] = { imdbId: null, poster: null };
  }
}

async function enrichCatalog() {
  for (let i = 0; i < films.length; i += 3) {
    await Promise.all(films.slice(i, i + 3).map(enrichOne));
    if (i % 30 === 0) {
      try { fs.writeFileSync(cachePath, JSON.stringify(enriched, null, 2)); } catch (_) {}
    }
  }
  try { fs.writeFileSync(cachePath, JSON.stringify(enriched, null, 2)); } catch (_) {}
  console.log(`Identificación terminada: ${Object.values(enriched).filter(x => x.imdbId).length} de ${films.length} coincidencias seguras.`);
}

app.listen(PORT, () => {
  console.log(`Addon activo en puerto ${PORT}`);
  enrichCatalog().catch(err => console.error('Error en identificación de películas:', err.message));
});
