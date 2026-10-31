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

// CORS is required by Stremio clients, including web/mobile clients.
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
  return `/poster/${encodeURIComponent(f.id)}.svg`;
}
function metaFor(f) {
  const match = enriched[f.id];
  const imdbId = match && match.imdbId;
  const id = imdbId || f.id;
  const meta = {
    id, type: 'movie', name: f.title, releaseInfo: String(f.year),
    poster: posterFor(f), posterShape: 'poster',
    description: `${f.type || 'Cine'} · Dirección: ${f.director || 'Dato no disponible'}${f.notes ? '\n' + f.notes : ''}`,
    country: 'Bolivia'
  };
  return meta;
}

app.get('/', (_req, res) => res.type('text').send('La gran videoteca del cine boliviano está activa.'));
app.get('/manifest.json', (_req, res) => res.json(manifest));
app.get('/poster/:id.svg', (req, res) => {
  const f = byId.get(req.params.id);
  if (!f) return res.sendStatus(404);
  const title = cleanText(f.title);
  const year = cleanText(f.year);
  res.type('image/svg+xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#27364a"/><stop offset="1" stop-color="#10151d"/></linearGradient></defs><rect width="600" height="900" fill="url(#g)"/><path d="M0 610 Q150 500 300 620 T600 600 V900 H0Z" fill="#9b6b3e" opacity=".45"/><text x="300" y="270" fill="#f2d6a2" font-family="sans-serif" font-size="30" text-anchor="middle" letter-spacing="8">CINE BOLIVIANO</text><text x="300" y="430" fill="white" font-family="sans-serif" font-size="38" font-weight="bold" text-anchor="middle">${title}</text><text x="300" y="510" fill="#d7dce4" font-family="sans-serif" font-size="30" text-anchor="middle">${year}</text><text x="300" y="820" fill="#d7dce4" font-family="sans-serif" font-size="22" text-anchor="middle">Cartel no localizado</text></svg>`);
});
app.get('/catalog/movie/cine_boliviano.json', (req, res) => {
  const q = String(req.query.search || '').toLocaleLowerCase('es');
  const metas = films.filter(f => !q || f.title.toLocaleLowerCase('es').includes(q) || String(f.year).includes(q))
    .map(f => metaFor(f));
  res.json({ metas });
});
app.get('/meta/movie/:id.json', (req, res) => {
  const f = byId.get(req.params.id);
  if (!f) return res.status(404).json({ error: 'No encontrado' });
  res.json({ meta: metaFor(f) });
});

// Match conservatively: only accept near-exact title matches with a close year.
// Unmatched films retain their own ID and get an honest placeholder poster.
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
  // Small batches avoid hammering the public lookup provider.
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
