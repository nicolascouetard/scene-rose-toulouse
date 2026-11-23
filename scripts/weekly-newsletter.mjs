#!/usr/bin/env node
/**
 * Scène Rose — Générateur & expéditeur de l'alerte hebdomadaire (Brevo, RGPD)
 * ---------------------------------------------------------------------------
 * Sélectionne les nouvelles dates annoncées sur les 7 derniers jours ainsi que
 * les concerts immanquables du week-end à Toulouse, génère un email HTML épuré
 * avec pied de page RGPD + désinscription en 1 clic Brevo ({{ unsubscribe }}).
 *
 * Usages :
 *   node scripts/weekly-newsletter.mjs --preview   (génère public/newsletter-preview.html)
 *   node scripts/weekly-newsletter.mjs --send      (crée & envoie la campagne via Brevo API)
 *
 * Variables d'environnement requises pour --send :
 *   BREVO_API_KEY       Clé API Brevo v3
 *   BREVO_LIST_ID       ID numérique de la liste d'abonnés Brevo
 *   NEWSLETTER_SENDER_EMAIL   Ex: agenda@scene-rose.fr (expéditeur validé dans Brevo)
 *   NEWSLETTER_SENDER_NAME    Ex: Scène Rose · Toulouse
 *   SITE_URL                  Ex: https://scene-rose.pages.dev
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(PROJECT_ROOT, 'public', 'data', 'concerts.json');
const PREVIEW_PATH = path.join(PROJECT_ROOT, 'public', 'newsletter-preview.html');

const SITE_URL = (process.env.SITE_URL || 'https://scene-rose.pages.dev').replace(/\/+$/, '');
const ACCENT = process.env.NEWSLETTER_ACCENT || '#C85A6E';

function getTodayParisIso(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateFr(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Paris',
  }).format(dt);
}

function diffDays(isoA, isoB) {
  const [ya, ma, da] = isoA.split('-').map(Number);
  const [yb, mb, db] = isoB.split('-').map(Number);
  const a = Date.UTC(ya, ma - 1, da);
  const b = Date.UTC(yb, mb - 1, db);
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

function statusBadgeHtml(status) {
  if (status === 'last-tickets') {
    return `<span style="display:inline-block;padding:2px 7px;border-radius:99px;background:#FEF3C7;color:#92400E;font-size:11px;font-weight:700;">Dernières places</span>`;
  }
  if (status === 'free') {
    return `<span style="display:inline-block;padding:2px 7px;border-radius:99px;background:#D1FAE5;color:#065F46;font-size:11px;font-weight:700;">Gratuit</span>`;
  }
  if (status === 'sold-out') {
    return `<span style="display:inline-block;padding:2px 7px;border-radius:99px;background:#F3F4F6;color:#6B7280;font-size:11px;font-weight:700;">Complet</span>`;
  }
  return '';
}

function renderConcertRow(concert, venue) {
  const badge = statusBadgeHtml(concert.status);
  const venueName = venue ? venue.shortName : concert.venueId;
  const price = concert.price ? ` · ${escapeHtml(concert.price)}` : '';
  const genre = concert.genres?.[0] ? ` · ${escapeHtml(concert.genres[0])}` : '';

  return `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #EFECE8;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="vertical-align:top;padding-right:12px;">
              <div style="font-size:12px;font-weight:700;color:${ACCENT};text-transform:uppercase;letter-spacing:0.4px;">
                ${escapeHtml(formatDateFr(concert.date))} · ${escapeHtml(concert.time)}
              </div>
              <div style="margin-top:3px;font-size:16px;font-weight:700;color:#18151C;line-height:1.3;">
                <a href="${escapeHtml(concert.venueEventUrl)}" style="color:#18151C;text-decoration:none;">
                  ${escapeHtml(concert.title)}
                </a>
              </div>
              <div style="margin-top:4px;font-size:13px;color:#6B6560;">
                ${escapeHtml(venueName)}${genre}${price}
                ${badge ? `&nbsp;&nbsp;${badge}` : ''}
              </div>
            </td>
            <td width="86" align="right" style="vertical-align:middle;">
              <a href="${escapeHtml(concert.venueEventUrl)}"
                 style="display:inline-block;padding:7px 12px;border-radius:10px;background:#FAF7F4;border:1px solid #E5DFD8;color:#18151C;font-size:12px;font-weight:700;text-decoration:none;">
                Voir →
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

export function buildWeeklyEmail(data, now = new Date()) {
  const todayIso = getTodayParisIso(now);
  const venueMap = Object.fromEntries(data.venues.map((v) => [v.id, v]));
  const activeConcerts = data.concerts.filter((c) => (c.endDate || c.date) >= todayIso);

  const sevenDaysMs = 7 * 24 * 3600 * 1000;
  const newlyAnnounced = activeConcerts
    .filter((c) => {
      if (!c.firstSeenAt) return false;
      const age = now.getTime() - new Date(c.firstSeenAt).getTime();
      return age >= 0 && age <= sevenDaysMs;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // Prochain week-end / 5 prochains jours (hors complets)
  const upcomingWeek = activeConcerts
    .filter((c) => {
      const d = diffDays(c.date, todayIso);
      return d >= 0 && d <= 5 && c.status !== 'sold-out';
    })
    .slice(0, 6);

  const lastTickets = activeConcerts
    .filter((c) => c.status === 'last-tickets')
    .slice(0, 4);

  const newSlice = newlyAnnounced.slice(0, 12);
  const moreNewCount = Math.max(0, newlyAnnounced.length - newSlice.length);

  const weekLabel = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(now);

  const subject =
    newlyAnnounced.length > 0
      ? `Scène Rose · ${newlyAnnounced.length} nouvelle${newlyAnnounced.length > 1 ? 's' : ''} date${newlyAnnounced.length > 1 ? 's' : ''} à Toulouse cette semaine`
      : `Scène Rose · Les concerts de la semaine à Toulouse`;

  const preheader =
    newlyAnnounced.length > 0
      ? `${newSlice
          .slice(0, 3)
          .map((c) => c.title)
          .join(', ')} et les sorties de la semaine à Toulouse.`
      : `Agenda concert de la semaine sur ${data.venues.length} salles toulousaines et les festivals d’Occitanie.`;

  const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F2EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18151C;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F5F2EE;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background-color:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #EAE4DC;">
          <!-- Header -->
          <tr>
            <td style="background-color:#141218;padding:26px 28px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${ACCENT};">
                Alerte hebdomadaire · ${escapeHtml(weekLabel)}
              </div>
              <div style="margin-top:6px;font-size:24px;font-weight:800;color:#FFFFFF;letter-spacing:-0.3px;">
                Scène Rose
              </div>
              <div style="margin-top:4px;font-size:13px;color:#B8B0A7;">
                L’essentiel des nouvelles annonces concerts sur ${data.venues.length} salles de Toulouse.
              </div>
            </td>
          </tr>

          <!-- Section 1: Nouveautés -->
          <tr>
            <td style="padding:26px 28px 10px 28px;">
              <h2 style="margin:0 0 6px 0;font-size:18px;font-weight:800;color:#18151C;">
                Nouvelles dates annoncées (${newlyAnnounced.length})
              </h2>
              <p style="margin:0 0 12px 0;font-size:13px;color:#6B6560;">
                Détectées automatiquement sur les billetteries officielles ces 7 derniers jours.
              </p>

              ${
                newSlice.length > 0
                  ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      ${newSlice.map((c) => renderConcertRow(c, venueMap[c.venueId])).join('')}
                    </table>`
                  : `<p style="padding:14px;border-radius:12px;background:#FAF7F4;font-size:13px;color:#6B6560;">
                      Aucune nouvelle annonce majeure cette semaine — retrouve tout l’agenda complet sur le site.
                    </p>`
              }

              ${
                moreNewCount > 0
                  ? `<div style="margin-top:14px;text-align:center;">
                      <a href="${SITE_URL}/" style="display:inline-block;padding:10px 18px;border-radius:12px;background:${ACCENT};color:#FFFFFF;font-size:13px;font-weight:700;text-decoration:none;">
                        Voir les ${moreNewCount} autre${moreNewCount > 1 ? 's' : ''} nouveauté${moreNewCount > 1 ? 's' : ''} sur Scène Rose
                      </a>
                    </div>`
                  : ''
              }
            </td>
          </tr>

          <!-- Section 2: Cette semaine à Toulouse -->
          ${
            upcomingWeek.length > 0
              ? `<tr>
                  <td style="padding:22px 28px 10px 28px;">
                    <h2 style="margin:0 0 6px 0;font-size:17px;font-weight:800;color:#18151C;">
                      À ne pas manquer ces prochains jours
                    </h2>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      ${upcomingWeek.map((c) => renderConcertRow(c, venueMap[c.venueId])).join('')}
                    </table>
                  </td>
                </tr>`
              : ''
          }

          <!-- Section 3: Dernières places -->
          ${
            lastTickets.length > 0
              ? `<tr>
                  <td style="padding:18px 28px 10px 28px;">
                    <div style="padding:14px 16px;border-radius:14px;background:#FFFBEB;border:1px solid #FDE68A;">
                      <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.6px;color:#92400E;">
                        Dernières places avant complet
                      </div>
                      <ul style="margin:8px 0 0 0;padding-left:18px;font-size:13px;color:#451A03;line-height:1.6;">
                        ${lastTickets
                          .map(
                            (c) =>
                              `<li><strong>${escapeHtml(c.title)}</strong> — ${escapeHtml(
                                venueMap[c.venueId]?.shortName || c.venueId
                              )} (${escapeHtml(formatDateFr(c.date))})</li>`
                          )
                          .join('')}
                      </ul>
                    </div>
                  </td>
                </tr>`
              : ''
          }

          <!-- Section 4: Encart Festivals d'Occitanie -->
          <tr>
            <td style="padding:14px 28px 6px 28px;">
              <div style="padding:16px 18px;border-radius:16px;background:linear-gradient(135deg,#18151C 0%,#261820 100%);border:1px solid #3A232D;">
                <div style="font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:1.1px;color:#F2A9B6;">
                  Festivals d’Occitanie · Agenda évolutif
                </div>
                <div style="margin-top:5px;font-size:15px;font-weight:800;color:#FFFFFF;">
                  Rose Festival, Rio Loco, Pause Guitare, Les Déferlantes, Carcassonne…
                </div>
                <div style="margin-top:5px;font-size:12.5px;line-height:1.5;color:#D6CEC7;">
                  Retrouve les 18 grands festivals de Toulouse & d’Occitanie (Rose Festival, Poney Club, La Kermesse, Rio Loco…), leurs programmations et les liens d’écoute artistes dans l’onglet dédié.
                </div>
                <div style="margin-top:11px;">
                  <a href="${SITE_URL}/?tab=festivals"
                     style="display:inline-block;padding:8px 14px;border-radius:10px;background:${ACCENT};color:#FFFFFF;font-size:12px;font-weight:700;text-decoration:none;">
                    Explorer les festivals d’Occitanie →
                  </a>
                </div>
              </div>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:18px 28px 28px 28px;text-align:center;">
              <a href="${SITE_URL}/"
                 style="display:inline-block;padding:13px 24px;border-radius:14px;background:#141218;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none;">
                Ouvrir l’agenda complet (${activeConcerts.length} concerts · ${data.venues.length} salles) →
              </a>
            </td>
          </tr>

          <!-- Footer RGPD & Désinscription -->
          <tr>
            <td style="background-color:#FAF7F4;padding:20px 28px;border-top:1px solid #EFECE8;font-size:11.5px;line-height:1.6;color:#78716C;">
              <p style="margin:0 0 8px 0;">
                Vous recevez cet e-mail car vous vous êtes inscrit(e) à l’alerte hebdomadaire <strong>Scène Rose — Toulouse</strong>. Votre adresse e-mail est utilisée uniquement pour cet envoi hebdomadaire et n’est jamais cédée ni vendue à des tiers (hébergement UE via Brevo).
              </p>
              <p style="margin:0;">
                <a href="{{ unsubscribe }}" style="color:#18151C;font-weight:700;text-decoration:underline;">
                  Se désinscrire en 1 clic
                </a>
                &nbsp;·&nbsp;
                <a href="${SITE_URL}/" style="color:#78716C;text-decoration:underline;">
                  Ouvrir Scène Rose
                </a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, htmlContent, newlyCount: newlyAnnounced.length };
}

async function sendViaBrevo({ subject, htmlContent }) {
  const apiKey = process.env.BREVO_API_KEY;
  const listId = Number(process.env.BREVO_LIST_ID);
  const senderEmail = process.env.NEWSLETTER_SENDER_EMAIL;
  const senderName = process.env.NEWSLETTER_SENDER_NAME || 'Scène Rose · Toulouse';

  if (!apiKey || !listId || !senderEmail) {
    throw new Error(
      'Variables manquantes : BREVO_API_KEY, BREVO_LIST_ID et NEWSLETTER_SENDER_EMAIL sont requises.'
    );
  }

  // 1. Créer la campagne Brevo
  const createRes = await fetch('https://api.brevo.com/v3/emailCampaigns', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      name: `Scène Rose Hebdo — ${getTodayParisIso()}`,
      subject,
      sender: { name: senderName, email: senderEmail },
      type: 'classic',
      htmlContent,
      recipients: { listIds: [listId] },
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Échec création campagne Brevo (${createRes.status}): ${errText}`);
  }
  const { id: campaignId } = await createRes.json();

  // 2. Envoyer immédiatement
  const sendRes = await fetch(`https://api.brevo.com/v3/emailCampaigns/${campaignId}/sendNow`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': apiKey,
    },
  });

  if (!sendRes.ok && sendRes.status !== 204) {
    const errText = await sendRes.text();
    throw new Error(`Échec envoi campagne Brevo #${campaignId} (${sendRes.status}): ${errText}`);
  }

  console.log(`✅ Campagne Brevo #${campaignId} envoyée à la liste #${listId} (« ${subject} »)`);
}

// Exécution CLI
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const { subject, htmlContent, newlyCount } = buildWeeklyEmail(data);

if (process.argv.includes('--send')) {
  await sendViaBrevo({ subject, htmlContent });
} else {
  fs.writeFileSync(PREVIEW_PATH, htmlContent, 'utf8');
  console.log(`✉️ Aperçu email généré : ${PREVIEW_PATH}`);
  console.log(`   Objet      : ${subject}`);
  console.log(`   Nouveautés : ${newlyCount} concert(s) sur les 7 derniers jours`);
}
