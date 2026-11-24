#!/usr/bin/env node
/**
 * Scène Rose — Alertes personnalisées Favoris (J-7 & Dernières places) via Brevo
 * ------------------------------------------------------------------------------
 * Interroge les contacts Brevo ayant activé FAVORITE_ALERTS = true, croise leur
 * attribut FAVORITE_IDS avec public/data/concerts.json, et envoie un e-mail
 * transactionnel unique regroupant :
 *   - Les concerts favoris ayant lieu exactement dans 7 jours (J-7)
 *   - Les concerts favoris passés en statut "Dernières places"
 *
 * Anti-spam garanti : chaque alerte envoyée enregistre son jeton ("j7:<id>" ou
 * "last:<id>") dans l'attribut Brevo NOTIFIED_IDS pour ne jamais être renvoyée.
 *
 * Usages :
 *   node scripts/favorites-alerts.mjs --preview   (génère public/favorites-alert-preview.html)
 *   node scripts/favorites-alerts.mjs --send      (vérifie Brevo & envoie les alertes du jour)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(PROJECT_ROOT, 'public', 'data', 'concerts.json');
const PREVIEW_PATH = path.join(PROJECT_ROOT, 'public', 'favorites-alert-preview.html');

const SITE_URL = (process.env.SITE_URL || 'https://scene-rose.pages.dev').replace(/\/+$/, '');
const ACCENT = '#C85A6E';

function getTodayParisIso(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function diffDays(isoFrom, isoTo) {
  const [ya, ma, da] = isoFrom.split('-').map(Number);
  const [yb, mb, db] = isoTo.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeMatchText(str = '') {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`\-_./,&:+()]+/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesFollowedArtist(text, artistName) {
  const normArtist = normalizeMatchText(artistName);
  if (!normArtist || normArtist.length < 2) return false;
  const normText = normalizeMatchText(text);
  if (!normText) return false;
  const escaped = normArtist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`).test(normText);
}

function formatDateFr(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Paris',
  }).format(dt);
}

function buildAlertEmailHtml({ artistMatchItems = [], lastTicketsItems = [], weekBeforeItems = [], venueMap }) {
  const renderCard = (concert, kind, matchedArtist = '') => {
    const venue = venueMap[concert.venueId];
    const venueName = venue ? venue.name : concert.venueId;
    const badgeBg =
      kind === 'artist' ? '#FDE8EC' : kind === 'last' ? '#FEF3C7' : '#FCE7F3';
    const badgeColor =
      kind === 'artist' ? '#943A4D' : kind === 'last' ? '#92400E' : '#943A4D';
    const badgeLabel =
      kind === 'artist'
        ? `Nouveau concert · Artiste suivi (${matchedArtist})`
        : kind === 'last'
          ? 'Dernières places'
          : 'Dans 7 jours · Rappel J-7';
    const deepUrl = `${SITE_URL}/?concert=${encodeURIComponent(concert.id)}`;
    const ticketUrl = concert.venueEventUrl || deepUrl;
    const price = concert.price ? ` · ${escapeHtml(concert.price)}` : '';

    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #EFECE8;">
          <div style="margin-bottom:5px;">
            <span style="display:inline-block;padding:3px 9px;border-radius:99px;background:${badgeBg};color:${badgeColor};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.4px;">
              ${escapeHtml(badgeLabel)}
            </span>
          </div>
          <div style="font-size:16px;font-weight:800;color:#18151C;line-height:1.3;">
            <a href="${escapeHtml(deepUrl)}" style="color:#18151C;text-decoration:none;">
              ${escapeHtml(concert.title)}
            </a>
          </div>
          <div style="margin-top:4px;font-size:13px;color:#57534E;">
            ${escapeHtml(formatDateFr(concert.date))} à ${escapeHtml(concert.time)} · <strong>${escapeHtml(venueName)}</strong>${price}
          </div>
          <div style="margin-top:10px;">
            <a href="${escapeHtml(ticketUrl)}" style="display:inline-block;padding:8px 14px;border-radius:10px;background:${ACCENT};color:#FFFFFF;font-size:12.5px;font-weight:700;text-decoration:none;">
              Voir les billets officiels →
            </a>
            &nbsp;
            <a href="${escapeHtml(deepUrl)}" style="display:inline-block;padding:8px 12px;border-radius:10px;background:#F5F2EE;color:#18151C;font-size:12.5px;font-weight:600;text-decoration:none;">
              Fiche Scène Rose
            </a>
          </div>
        </td>
      </tr>
    `;
  };

  const totalAlerts = artistMatchItems.length + lastTicketsItems.length + weekBeforeItems.length;
  const firstArtistMatch = artistMatchItems[0];
  const firstTitle =
    firstArtistMatch?.concert?.title ||
    (lastTicketsItems[0] || weekBeforeItems[0])?.title ||
    'Ton concert favori';

  const subject =
    artistMatchItems.length > 0 && lastTicketsItems.length === 0 && weekBeforeItems.length === 0
      ? artistMatchItems.length === 1
        ? `Scène Rose · ${firstArtistMatch.artist} annoncé à Toulouse !`
        : `Scène Rose · ${artistMatchItems.length} nouveaux concerts pour tes artistes suivis !`
      : lastTicketsItems.length > 0 && weekBeforeItems.length === 0 && artistMatchItems.length === 0
        ? `Scène Rose · Dernières places pour ${firstTitle} !`
        : weekBeforeItems.length > 0 && lastTicketsItems.length === 0 && artistMatchItems.length === 0
          ? `Scène Rose · J-7 avant ${firstTitle} à Toulouse`
          : `Scène Rose · ${totalAlerts} alertes sur tes favoris & artistes suivis`;

  const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F2EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18151C;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F5F2EE;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #EAE4DC;">
          <tr>
            <td style="background-color:#141218;padding:24px 28px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#F2A9B6;">
                Alerte Favoris · Scène Rose
              </div>
              <div style="margin-top:6px;font-size:22px;font-weight:800;color:#FFFFFF;">
                Tes concerts à ne pas rater
              </div>
              <div style="margin-top:4px;font-size:13px;color:#B8B0A7;">
                Nouveaux concerts de tes artistes suivis & rappels sur tes favoris à Toulouse.
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 28px 16px 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                ${artistMatchItems.map(({ concert, artist }) => renderCard(concert, 'artist', artist)).join('')}
                ${lastTicketsItems.map((c) => renderCard(c, 'last')).join('')}
                ${weekBeforeItems.map((c) => renderCard(c, 'j7')).join('')}
              </table>
            </td>
          </tr>

          <tr>
            <td style="background-color:#FAF7F4;padding:18px 28px;border-top:1px solid #EFECE8;font-size:11.5px;line-height:1.6;color:#78716C;">
              <p style="margin:0 0 6px 0;">
                Tu reçois cette alerte car tu as activé le <strong>suivi de tes favoris & artistes sur Scène Rose</strong> (indépendant de la newsletter hebdomadaire).
              </p>
              <p style="margin:0;">
                Pour modifier ou désactiver ces alertes à tout moment, ouvre l’onglet
                <a href="${SITE_URL}/?tab=favorites" style="color:#18151C;font-weight:700;text-decoration:underline;">Mes favoris</a>
                sur Scène Rose.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, htmlContent };
}

async function fetchBrevoContacts(apiKey) {
  const all = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await fetch(`https://api.brevo.com/v3/contacts?limit=${limit}&offset=${offset}`, {
      headers: { accept: 'application/json', 'api-key': apiKey },
    });
    if (!res.ok) {
      throw new Error(`Brevo GET /contacts HTTP ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    const batch = data.contacts || [];
    all.push(...batch);
    if (batch.length < limit || all.length >= 2000) break;
    offset += limit;
  }
  return all;
}

async function sendTransactionalEmail({ apiKey, senderEmail, senderName, toEmail, subject, htmlContent }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: toEmail }],
      subject,
      htmlContent,
      tags: ['scene-rose-favorites-alert'],
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    const err = new Error(`Brevo SMTP HTTP ${res.status}: ${errBody}`);
    err.status = res.status;
    throw err;
  }
}

async function updateContactNotifiedIds(apiKey, email, notifiedList) {
  const trimmed = [...new Set(notifiedList)].slice(-80).join(',');
  await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
    method: 'PUT',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      attributes: {
        NOTIFIED_IDS: trimmed,
      },
    }),
  });
}

async function main() {
  const mode = process.argv.includes('--send') ? 'send' : 'preview';
  const db = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  const venueMap = Object.fromEntries((db.venues || []).map((v) => [v.id, v]));
  const concertMap = Object.fromEntries((db.concerts || []).map((c) => [c.id, c]));
  const todayIso = getTodayParisIso();

  if (mode === 'preview') {
    const upcoming = (db.concerts || []).filter((c) => diffDays(todayIso, c.date) >= 0);
    const sampleArtistConcert = upcoming[0];
    const sampleLast = upcoming.filter((c) => c.status === 'last-tickets').slice(0, 1);
    const sampleWeek = upcoming.filter((c) => diffDays(todayIso, c.date) >= 5 && diffDays(todayIso, c.date) <= 9).slice(0, 1);
    const { subject, htmlContent } = buildAlertEmailHtml({
      artistMatchItems: sampleArtistConcert
        ? [{ artist: sampleArtistConcert.title.split(/\s+[—–-]\s+/)[0], concert: sampleArtistConcert }]
        : [],
      lastTicketsItems: sampleLast,
      weekBeforeItems: sampleWeek,
      venueMap,
    });
    fs.writeFileSync(PREVIEW_PATH, htmlContent, 'utf-8');
    console.log(`🔔 Aperçu alerte favoris généré : ${PREVIEW_PATH}`);
    console.log(`   Objet : ${subject}`);
    return;
  }

  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.NEWSLETTER_SENDER_EMAIL;
  const senderName = process.env.NEWSLETTER_SENDER_NAME || 'Scène Rose · Toulouse';

  if (!apiKey || !senderEmail) {
    console.log('ℹ️ BREVO_API_KEY ou NEWSLETTER_SENDER_EMAIL manquant — aucun envoi effectué.');
    return;
  }

  const upcomingConcerts = (db.concerts || []).filter((c) => diffDays(todayIso, c.date) >= 0);
  const contacts = await fetchBrevoContacts(apiKey);
  let sentCount = 0;

  for (const contact of contacts) {
    const attrs = contact.attributes || {};
    if (!attrs.FAVORITE_ALERTS) continue;

    const favIds = String(attrs.FAVORITE_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const favArtists = String(attrs.FAVORITE_ARTISTS || '')
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);

    if (favIds.length === 0 && favArtists.length === 0) continue;

    const notified = new Set(
      String(attrs.NOTIFIED_IDS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );

    const artistMatchItems = [];
    const lastTicketsItems = [];
    const weekBeforeItems = [];
    const newTokens = [];
    const matchedConcertIds = new Set();

    // 1. Nouveaux concerts correspondant aux artistes suivis
    for (const artist of favArtists) {
      for (const concert of upcomingConcerts) {
        if (matchedConcertIds.has(concert.id)) continue;
        if (notified.has(`artist:${concert.id}`)) continue;
        if (matchesFollowedArtist(concert.title, artist)) {
          artistMatchItems.push({ artist, concert });
          matchedConcertIds.add(concert.id);
          newTokens.push(`artist:${concert.id}`);
        }
      }
    }

    // 2. Rappels J-7 & Dernières places sur les concerts enregistrés en favori
    for (const cid of favIds) {
      const concert = concertMap[cid];
      if (!concert) continue;
      const days = diffDays(todayIso, concert.date);
      if (days < 0) continue;

      if (concert.status === 'last-tickets' && !notified.has(`last:${cid}`)) {
        lastTicketsItems.push(concert);
        newTokens.push(`last:${cid}`);
      } else if (days === 7 && concert.status !== 'sold-out' && !notified.has(`j7:${cid}`)) {
        weekBeforeItems.push(concert);
        newTokens.push(`j7:${cid}`);
      }
    }

    if (
      artistMatchItems.length === 0 &&
      lastTicketsItems.length === 0 &&
      weekBeforeItems.length === 0
    ) {
      continue;
    }

    const { subject, htmlContent } = buildAlertEmailHtml({
      artistMatchItems: artistMatchItems.slice(0, 8),
      lastTicketsItems,
      weekBeforeItems,
      venueMap,
    });

    try {
      await sendTransactionalEmail({
        apiKey,
        senderEmail,
        senderName,
        toEmail: contact.email,
        subject,
        htmlContent,
      });
    } catch (err) {
      // Garde-fou quota journalier Brevo (300/j gratuit) : on s'arrête proprement
      // sans marquer NOTIFIED_IDS pour que les alertes restantes partent le lendemain.
      if (err && (err.status === 402 || err.status === 429)) {
        console.warn(`⚠️ Quota journalier Brevo atteint après ${sentCount} envoi(s) — reprise automatique demain.`);
        break;
      }
      throw err;
    }

    await updateContactNotifiedIds(apiKey, contact.email, [...notified, ...newTokens]);
    sentCount++;
  }

  console.log(`✅ Alertes favoris terminées (${todayIso}) : ${sentCount} e-mail(s) personnalisé(s) envoyé(s).`);
}

main().catch((err) => {
  console.error('❌ Erreur favorites-alerts:', err);
  process.exit(1);
});
