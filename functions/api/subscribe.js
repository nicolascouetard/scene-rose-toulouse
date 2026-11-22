/**
 * Cloudflare Pages Function — POST /api/subscribe
 * ------------------------------------------------
 * Inscrit un email à l'alerte hebdomadaire Scène Rose via l'API Brevo (serveurs UE, RGPD).
 * Aucun email n'est stocké dans GitHub ni côté client.
 *
 * Variables d'environnement à configurer dans Cloudflare Pages -> Settings -> Variables & Secrets :
 *   - BREVO_API_KEY          (obligatoire, type Secret)
 *   - BREVO_LIST_ID          (obligatoire, ex: "2")
 *   - BREVO_DOI_TEMPLATE_ID  (recommandé pour le Double Opt-In RGPD, ex: "1")
 *   - BREVO_REDIRECT_URL     (optionnel, ex: "https://scene-rose.pages.dev/?subscribed=1")
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
  const consent = Boolean(payload?.consent);

  if (!EMAIL_REGEX.test(email) || email.length > 180) {
    return jsonResponse({ ok: false, error: 'Adresse email invalide.' }, 400);
  }

  if (!consent) {
    return jsonResponse(
      { ok: false, error: 'Merci de cocher la case de consentement RGPD.' },
      400
    );
  }

  const apiKey = env?.BREVO_API_KEY;
  const listId = Number(env?.BREVO_LIST_ID);

  if (!apiKey || !listId) {
    return jsonResponse(
      {
        ok: false,
        code: 'NOT_CONFIGURED',
        error:
          'Le service Brevo n’est pas encore connecté (ajoute BREVO_API_KEY et BREVO_LIST_ID dans Cloudflare Pages).',
      },
      503
    );
  }

  const doiTemplateId = Number(env?.BREVO_DOI_TEMPLATE_ID || 0);
  const redirectUrl =
    env?.BREVO_REDIRECT_URL || new URL('/', request.url).toString() + '?subscribed=1';

  const consentAt = new Date().toISOString();

  try {
    // 1. Mode recommandé (RGPD) : Double Opt-In Brevo (envoie un mail de confirmation avant ajout)
    if (doiTemplateId > 0) {
      const doiRes = await fetch('https://api.brevo.com/v3/contacts/doubleOptinConfirmation', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify({
          email,
          includeListIds: [listId],
          templateId: doiTemplateId,
          redirectionUrl: redirectUrl,
          attributes: {
            CONSENT_SOURCE: 'scene-rose-web',
            CONSENT_DATE: consentAt,
          },
        }),
      });

      if (doiRes.ok || doiRes.status === 201 || doiRes.status === 204) {
        return jsonResponse({
          ok: true,
          doubleOptIn: true,
          message:
            'Presque terminé ! Clique sur le lien reçu par mail pour confirmer ton inscription.',
        });
      }

      const errData = await doiRes.json().catch(() => ({}));
      if (errData?.code === 'duplicate_parameter') {
        return jsonResponse({
          ok: true,
          doubleOptIn: false,
          message: 'Cette adresse est déjà inscrite à l’alerte hebdomadaire.',
        });
      }
      return jsonResponse(
        { ok: false, error: errData?.message || 'Erreur Brevo lors de la confirmation.' },
        502
      );
    }

    // 2. Mode simple opt-in si BREVO_DOI_TEMPLATE_ID n'est pas encore défini
    const res = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        email,
        listIds: [listId],
        updateEnabled: true,
        attributes: {
          CONSENT_SOURCE: 'scene-rose-web',
          CONSENT_DATE: consentAt,
        },
      }),
    });

    if (res.ok || res.status === 201 || res.status === 204) {
      return jsonResponse({
        ok: true,
        doubleOptIn: false,
        message: 'Inscription confirmée ! Tu recevras les nouvelles sorties chaque semaine.',
      });
    }

    const errData = await res.json().catch(() => ({}));
    return jsonResponse(
      { ok: false, error: errData?.message || 'Impossible de finaliser l’inscription.' },
      502
    );
  } catch {
    return jsonResponse(
      { ok: false, error: 'Service momentanément indisponible. Réessaie dans un instant.' },
      502
    );
  }
}
