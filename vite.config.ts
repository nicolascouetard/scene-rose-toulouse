import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sceneRoseJsonLdPlugin } from './scripts/vite-plugin-jsonld.js';

const SYNC_SLOTS_PARIS = [
  { hour: 6, minute: 0, label: '06h00' },
  { hour: 11, minute: 30, label: '11h30' },
  { hour: 17, minute: 30, label: '17h30' },
  { hour: 21, minute: 0, label: '21h00' },
];

function msUntilNextSyncSlot(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, Number(p.value)]));
  const nowSec = map.hour * 3600 + map.minute * 60 + map.second;
  for (const slot of SYNC_SLOTS_PARIS) {
    const slotSec = slot.hour * 3600 + slot.minute * 60;
    if (slotSec > nowSec + 5) return (slotSec - nowSec) * 1000;
  }
  return (24 * 3600 - nowSec + SYNC_SLOTS_PARIS[0].hour * 3600) * 1000;
}

function sceneRoseSyncPlugin(): Plugin {
  let syncInProgress: Promise<unknown> | null = null;
  let dailyTimer: ReturnType<typeof setTimeout> | null = null;

  const runLiveSync = async () => {
    if (!syncInProgress) {
      const scriptUrl = pathToFileURL(path.resolve(process.cwd(), 'scripts/sync-concerts.mjs')).href;
      syncInProgress = import(/* @vite-ignore */ scriptUrl)
        .then((mod) => mod.syncConcerts({ quiet: true }))
        .finally(() => {
          syncInProgress = null;
        });
    }
    return syncInProgress;
  };

  const scheduleDailyAutoSync = () => {
    if (dailyTimer) clearTimeout(dailyTimer);
    dailyTimer = setTimeout(async () => {
      try {
        await runLiveSync();
      } catch (err) {
        console.error('[Scène Rose] Auto-sync error:', err);
      }
      scheduleDailyAutoSync();
    }, msUntilNextSyncSlot());
    dailyTimer.unref?.();
  };

  return {
    name: 'scene-rose-sync-api',
    configureServer(server) {
      scheduleDailyAutoSync();

      server.middlewares.use('/api/concerts', (req, res, next) => {
        if (req.method !== 'GET') return next();
        const filePath = path.resolve(process.cwd(), 'public/data/concerts.json');
        if (!fs.existsSync(filePath)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Data not synced yet' }));
          return;
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(fs.readFileSync(filePath, 'utf-8'));
      });

      server.middlewares.use('/api/sync', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        try {
          const result = await runLiveSync();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(result));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Sync failed' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), sceneRoseSyncPlugin(), sceneRoseJsonLdPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
});
