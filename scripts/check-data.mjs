#!/usr/bin/env node
/**
 * Scène Rose — Contrôle qualité des données
 * ------------------------------------------
 * Vérifie l'intégrité de public/data/concerts.json avant publication :
 *   - champs obligatoires, dates ISO valides et futures,
 *   - genre appartenant à la taxonomie des 12 catégories,
 *   - affiche locale existante sur le disque (et non une URL distante),
 *   - identifiants uniques, salles connues.
 *
 * Usage : node scripts/check-data.mjs  (code de sortie 1 si erreur bloquante)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = path.join(ROOT, 'public/data/concerts.json');
const POSTER_DIR = path.join(ROOT, 'public/posters');

const GENRES = new Set([
  'Rock & Indie',
  'Metal & Hardcore',
  'Électro & House',
  'Techno & Rave',
  'Rap & Hip-Hop',
  'Pop',
  'Chanson & Folk',
  'Jazz & Blues',
  'Soul, Funk & R&B',
  'Reggae & Dub',
  'Musiques du Monde',
  'Classique & Opéra',
]);

const errors = [];
const warnings = [];

function todayParisIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const db = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
const venues = new Map((db.venues || []).map((v) => [v.id, v]));
const concerts = db.concerts || [];
const today = todayParisIso();

if (!Array.isArray(concerts) || concerts.length === 0) {
  errors.push('Aucun concert dans le fichier de données.');
}

const seenIds = new Set();
const seenPosters = new Map();
let remotePosters = 0;
let missingPosters = 0;
let pastConcerts = 0;
let badGenres = 0;
let unknownVenues = 0;

for (const c of concerts) {
  if (!c.id || typeof c.id !== 'string') {
    errors.push(`Concert sans identifiant : ${JSON.stringify(c).slice(0, 80)}`);
    continue;
  }
  if (seenIds.has(c.id)) errors.push(`Identifiant dupliqué : ${c.id}`);
  seenIds.add(c.id);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date || '')) {
    errors.push(`${c.id} : date invalide « ${c.date} »`);
  } else if ((c.endDate || c.date) < today) {
    pastConcerts++;
  }

  if (!venues.has(c.venueId)) {
    unknownVenues++;
    warnings.push(`${c.id} : salle inconnue « ${c.venueId} »`);
  }

  if (!GENRES.has(c.category)) {
    badGenres++;
    warnings.push(`${c.id} : genre hors taxonomie « ${c.category} »`);
  }

  const poster = c.poster || '';
  if (/^https?:\/\//.test(poster)) {
    remotePosters++;
    warnings.push(`${c.id} : affiche encore distante (${poster.slice(0, 60)}…)`);
  } else if (poster.startsWith('/posters/')) {
    const file = path.join(POSTER_DIR, path.basename(poster));
    if (!fs.existsSync(file)) {
      missingPosters++;
      errors.push(`${c.id} : fichier d'affiche manquant ${poster}`);
    }
    if (seenPosters.has(poster)) {
      // Partages normaux pour les spectacles multi-dates : simple info
      seenPosters.set(poster, seenPosters.get(poster) + 1);
    } else {
      seenPosters.set(poster, 1);
    }
  } else {
    missingPosters++;
    errors.push(`${c.id} : affiche absente ou chemin invalide « ${poster} »`);
  }
}

if (pastConcerts > 0) warnings.push(`${pastConcerts} concert(s) déjà passé(s) — purge au prochain sync`);

const totalPosterBytes = [...seenPosters.keys()].reduce((sum, p) => {
  const file = path.join(POSTER_DIR, path.basename(p));
  return sum + (fs.existsSync(file) ? fs.statSync(file).size : 0);
}, 0);

console.log('\n🔍 Contrôle qualité des données Scène Rose');
console.log(`   ${concerts.length} concerts · ${venues.size} salles · ${seenPosters.size} affiches uniques`);
console.log(`   Affiches : ${(totalPosterBytes / 1048576).toFixed(1)} Mo sur disque`);
console.log(`   Distantes : ${remotePosters} · manquantes : ${missingPosters} · genres hors taxonomie : ${badGenres}`);
if (warnings.length > 0) {
  console.log(`\n⚠️  ${warnings.length} avertissement(s) :`);
  for (const w of warnings.slice(0, 10)) console.log(`   • ${w}`);
  if (warnings.length > 10) console.log(`   … et ${warnings.length - 10} autres`);
}
if (errors.length > 0) {
  console.log(`\n❌ ${errors.length} erreur(s) bloquante(s) :`);
  for (const e of errors.slice(0, 15)) console.log(`   • ${e}`);
  if (errors.length > 15) console.log(`   … et ${errors.length - 15} autres`);
  console.log('');
  process.exit(1);
}
console.log('\n✅ Données valides.\n');
