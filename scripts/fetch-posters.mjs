#!/usr/bin/env node
/**
 * Scène Rose — Pipeline de rapatriement & compression des affiches
 * -----------------------------------------------------------------
 * Les scrapers enregistrent parfois l'URL distante d'origine (lemetronum.fr,
 * img.openagenda.com, …) : ces images pèsent ~785 Ko en moyenne (jusqu'à 3,6 Mo),
 * ne sont jamais mises en cache hors-ligne et cassent quand la salle refait son site.
 *
 * Ce script :
 *   1. télécharge chaque affiche distante,
 *   2. la redimensionne (max 800px) et la convertit en WebP q78 (~40-70 Ko),
 *   3. réécrit `poster` dans public/data/concerts.json vers le fichier local,
 *   4. conserve `sourcePosterUrl` comme filet de sécurité côté client.
 *
 * Idempotent : les affiches déjà locales sont ignorées (aucun re-téléchargement).
 *
 * Usage :
 *   node scripts/fetch-posters.mjs            # 8 téléchargements en parallèle
 *   node scripts/fetch-posters.mjs --limit 20 # utile pour tester
 *   node scripts/fetch-posters.mjs --force    # re-télécharge même les locales
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const DATA_PATH = path.join(ROOT, 'public/data/concerts.json');
const POSTER_DIR = path.join(ROOT, 'public/posters');

const MAX_PARALLEL = 8;
const MAX_EDGE = 800;
const WEBP_QUALITY = 78;
const MAX_BYTES = 12 * 1024 * 1024; // garde-fou anti-fichier géant
const UA = 'Mozilla/5.0 (compatible; SceneRoseBot/1.0; +https://scene-rose.pages.dev)';

const argv = process.argv.slice(2);
const LIMIT = (() => {
  const i = argv.indexOf('--limit');
  return i !== -1 ? Number(argv[i + 1]) || 0 : 0;
})();
const FORCE = argv.includes('--force');
const PRUNE = !argv.includes('--no-prune');

function isLocalPoster(poster) {
  return typeof poster === 'string' && poster.startsWith('/posters/');
}

/** Nom de fichier stable et lisible : <venue>-<slug-titre>-<hash>.webp */
function posterFileName(concert) {
  const slug = `${concert.title || concert.id}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const hash = crypto
    .createHash('sha1')
    .update(`${concert.id}|${concert.date}|${concert.poster}`)
    .digest('hex')
    .slice(0, 6);
  return `${concert.venueId}-${slug}-${hash}.webp`;
}

async function download(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'image/*,*/*;q=0.8' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get('content-type') || '';
    if (type && !type.startsWith('image/')) throw new Error(`type inattendu: ${type}`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_BYTES) throw new Error(`trop volumineux: ${(len / 1048576).toFixed(1)} Mo`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) throw new Error('image vide');
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

/** Raccourci robuste : 2 tentatives avec petit backoff */
async function downloadWithRetry(url) {
  try {
    return await download(url);
  } catch {
    await new Promise((r) => setTimeout(r, 900));
    return await download(url);
  }
}

async function processConcert(concert) {
  const buffer = await downloadWithRetry(concert.poster);
  return await writePoster(concert, buffer);
}

async function writePoster(concert, buffer) {
  const fileName = posterFileName(concert);
  const outPath = path.join(POSTER_DIR, fileName);
  const info = await sharp(buffer, { animated: false })
    .rotate() // respecte l'orientation EXIF
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toFile(outPath);
  return {
    fileName,
    bytesIn: buffer.length,
    bytesOut: info.size,
    width: info.width,
    height: info.height,
  };
}

/**
 * Ménage : supprime les affiches qui ne sont plus référencées (concert annulé ou
 * passé), sinon public/posters grossit indéfiniment à chaque synchronisation.
 */
function pruneOrphans(concerts) {
  if (!PRUNE || !fs.existsSync(POSTER_DIR)) return;
  const referenced = new Set(
    concerts
      .map((c) =>
        typeof c.poster === 'string' && c.poster.startsWith('/posters/')
          ? c.poster.split('/').pop()
          : null
      )
      .filter(Boolean)
  );
  let pruned = 0;
  let prunedBytes = 0;
  for (const file of fs.readdirSync(POSTER_DIR)) {
    if (!/\.(webp|jpe?g|png)$/i.test(file)) continue;
    if (referenced.has(file)) continue;
    const full = path.join(POSTER_DIR, file);
    prunedBytes += fs.statSync(full).size;
    fs.unlinkSync(full);
    pruned++;
  }
  if (pruned > 0) {
    console.log(
      `   Ménage : ${pruned} affiche(s) orpheline(s) supprimée(s) (${(prunedBytes / 1048576).toFixed(1)} Mo)`
    );
  }
}

async function main() {
  if (!fs.existsSync(DATA_PATH)) {
    console.error('❌ public/data/concerts.json introuvable — lance `npm run sync` d’abord.');
    process.exit(1);
  }
  fs.mkdirSync(POSTER_DIR, { recursive: true });

  const db = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  const concerts = Array.isArray(db.concerts) ? db.concerts : [];

  // --- Étape 0 : recompresser les affiches locales encore en JPEG (ancien format) ---
  const legacyLocal = concerts.filter(
    (c) => isLocalPoster(c.poster) && /\.(jpe?g|png)$/i.test(c.poster)
  );
  if (legacyLocal.length > 0) {
    console.log(`\n♻️  Conversion de ${legacyLocal.length} affiches locales JPEG → WebP…`);
    let converted = 0;
    let outTotal = 0;
    let cursorLegacy = 0;
    const legacyWorker = async () => {
      while (cursorLegacy < legacyLocal.length) {
        const concert = legacyLocal[cursorLegacy++];
        const oldRel = concert.poster;
        const oldPath = path.join(ROOT, 'public', oldRel);
        try {
          if (!fs.existsSync(oldPath)) throw new Error('fichier absent');
          const buffer = fs.readFileSync(oldPath);
          const result = await writePoster(concert, buffer);
          concert.poster = `/posters/${result.fileName}`;
          outTotal += result.bytesOut;
          converted++;
          console.log(
            `  ✅ [${converted}/${legacyLocal.length}] ${Math.round(buffer.length / 1024)} Ko → ${Math.round(result.bytesOut / 1024)} Ko  ${result.fileName}`
          );
        } catch (err) {
          console.log(`  ⚠️  conversion impossible ${oldRel} — ${err.message}`);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(MAX_PARALLEL, legacyLocal.length) }, legacyWorker)
    );
    console.log(`  → ${converted}/${legacyLocal.length} converties (${(outTotal / 1048576).toFixed(1)} Mo)\n`);
  }

  let targets = concerts.filter((c) => c.poster && (!isLocalPoster(c.poster) || FORCE));
  if (LIMIT) targets = targets.slice(0, LIMIT);

  const alreadyLocal = concerts.filter((c) => isLocalPoster(c.poster)).length;
  console.log(
    `\n🖼️  Scène Rose — Affiches : ${alreadyLocal} déjà locales · ${targets.length} à rapatrier\n`
  );
  if (targets.length === 0) {
    pruneOrphans(concerts);
    return;
  }

  let done = 0;
  let failed = 0;
  let bytesIn = 0;
  let bytesOut = 0;
  const failures = [];
  const startedAt = Date.now();

  // File d'attente simple avec parallélisme borné
  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const concert = targets[cursor++];
      try {
        const result = await processConcert(concert);
        concert.poster = `/posters/${result.fileName}`;
        bytesIn += result.bytesIn;
        bytesOut += result.bytesOut;
        done++;
        const kIn = Math.round(result.bytesIn / 1024);
        const kOut = Math.round(result.bytesOut / 1024);
        console.log(
          `  ✅ [${done + failed}/${targets.length}] ${kIn} Ko → ${kOut} Ko  ${result.fileName}`
        );
      } catch (err) {
        failed++;
        failures.push({ id: concert.id, url: concert.poster, error: err.message });
        console.log(`  ⚠️  [${done + failed}/${targets.length}] échec ${concert.id} — ${err.message}`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, targets.length) }, worker));

  // Écriture atomique des données mises à jour
  if (done > 0 || legacyLocal.length > 0) {
    const tmp = `${DATA_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tmp, DATA_PATH);
  }

  pruneOrphans(concerts);

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  const mb = (n) => (n / 1048576).toFixed(1);
  console.log(`\n🎉 Affiches : ${done} rapatriées · ${failed} échecs · ${secs}s`);
  if (done > 0) {
    console.log(`   Poids : ${mb(bytesIn)} Mo → ${mb(bytesOut)} Mo (×${(bytesIn / bytesOut).toFixed(1)} plus léger)`);
  }
  if (failures.length > 0) {
    console.log(`   Les ${failures.length} affiches en échec conservent leur URL distante (fallback client).`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('❌ Pipeline affiches :', err);
  process.exit(1);
});
