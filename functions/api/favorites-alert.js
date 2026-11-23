/**
 * Cloudflare Pages Function — POST /api/favorites-alert
 * -----------------------------------------------------
 * Synchronise la liste des concerts favoris d'un abonné sur sa fiche contact Brevo (UE, RGPD, 0 €)
 * afin de lui envoyer automatiquement :
 *   - Un rappel à J-7 avant un concert mis en favori
 *   - Une alerte prioritaire si un favori passe en "Dernières places"
 *
 * Attributs contact à créer une seule fois dans Brevo -> Contacts -> Paramètres -> Attributs :
 *   - FAVORITE_IDS    (type Texte)
 *   - FAVORITE_ALERTS (type Booléen)
 *   - NOTIFIED_IDS    (type Texte)
 *
 * Variables Cloudflare Pages déjà configurées :
 *   - BREVO_API_KEY
 *   - BREVO_LIST_ID (optionnel)
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Requête invalide.' }, 400);
  }

  const email = String(payload?.email || '').trim().toLowerCase();
  const enabled = payload?.enabled !== false;
  const consent = Boolean(payload?.consent);
  const rawIds = Array.isArray(payload?.favoriteIds) ? payload.favoriteIds : [];

  if (!EMAIL_REGEX.test(email) || email.length > 180) {
    return jsonResponse({ ok: false, error: 'Adresse e-mail invalide.' }, 400);
  }

  if (enabled && !consent) {
    return jsonResponse(
      { ok: false, error: 'Merci de cocher la case de consentement RGPD.' },
      400
    );
  }

  const apiKey = env?.BREVO_API_KEY;
  if (!apiKey) {
    return jsonResponse(
      {
        ok: false,
        code: 'NOT_CONFIGURED',
        error: 'Clé Brevo absente dans Cloudflare Pages.',
      },
      503
    );
  }

  // Nettoyage strict des IDs favoris (max 40 concerts suivis)
  const cleanIds = [...new Set(rawIds.map((id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)).filter(Boolean))].slice(0, 40);

  // Séparation stricte RGPD : on ne l'inscrit PAS à la newsletter du jeudi (BREVO_LIST_ID)
  // S'il est déjà abonné à la newsletter, updateEnabled: true conserve intacte son inscription existante.
  const body = {
    email,
    updateEnabled: true,
    attributes: {
      FAVORITE_IDS: enabled ? cleanIds.join(',') : '',
      FAVORITE_ALERTS: enabled,
      CONSENT_FAVORITES_DATE: new Date().toISOString(),
    },
  };

  try {
    const res = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok && res.status !== 204) {
      const errText = await res.text().catch(() => '');
      return jsonResponse(
        {
          ok: false,
          error: 'Impossible de synchroniser tes alertes favoris pour le moment.',
          detail: errText.slice(0, 200),
        },
        502
      );
    }

    return jsonResponse({
      ok: true,
      enabled,
      syncedCount: cleanIds.length,
      message: enabled
        ? `Alertes activées sur ${cleanIds.length} favori${cleanIds.length > 1 ? 's' : ''} (rappel J-7 & Dernières places).`
        : 'Alertes e-mail sur tes favoris désactivées.',
    });
  } catch {
    return jsonResponse(
      { ok: false, error: 'Erreur réseau vers le service Brevo.' },
      502
    );
  }
}
