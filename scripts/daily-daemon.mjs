#!/usr/bin/env node
/**
 * Scène Rose — Démon de synchronisation automatique (4× / jour)
 * -------------------------------------------------------------
 * Exécute automatiquement `syncConcerts()` à 06h00, 11h30, 17h30 et 21h00 (Europe/Paris).
 * Usage :
 *   npm run sync:daemon
 *   npm run sync:daemon -- --immediate
 */

import { syncConcerts } from './sync-concerts.mjs';

const SLOTS_PARIS = [
  { hour: 6, minute: 0, label: '06h00' },
  { hour: 11, minute: 30, label: '11h30' },
  { hour: 17, minute: 30, label: '17h30' },
  { hour: 21, minute: 0, label: '21h00' },
];

function getParisParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, Number(p.value)]));
  return { hour: map.hour, minute: map.minute, second: map.second };
}

function nextSlotInfo() {
  const { hour, minute, second } = getParisParts();
  const nowSec = hour * 3600 + minute * 60 + second;

  for (const slot of SLOTS_PARIS) {
    const slotSec = slot.hour * 3600 + slot.minute * 60;
    if (slotSec > nowSec + 5) {
      return { waitMs: (slotSec - nowSec) * 1000, label: `Aujourd'hui à ${slot.label}` };
    }
  }
  const first = SLOTS_PARIS[0];
  const waitSec = 24 * 3600 - nowSec + first.hour * 3600 + first.minute * 60;
  return { waitMs: waitSec * 1000, label: `Demain à ${first.label}` };
}

function scheduleNext() {
  const { waitMs, label } = nextSlotInfo();
  const waitH = (waitMs / 3_600_000).toFixed(2);
  console.log(`⏰ [Scène Rose] Prochaine synchronisation automatique : ${label} (dans ${waitH}h)`);
  setTimeout(async () => {
    try {
      await syncConcerts();
    } catch (err) {
      console.error('❌ [Scène Rose] Échec sync planifiée :', err);
    }
    scheduleNext();
  }, waitMs);
}

console.log('🌹 Scène Rose — Planificateur 4×/jour (06h00 · 11h30 · 17h30 · 21h00 Europe/Paris)...');
if (process.argv.includes('--immediate')) {
  await syncConcerts().catch((err) => console.error('❌ Erreur sync initiale :', err));
}
scheduleNext();
