import { useEffect, useState, type MouseEvent } from 'react';
import { Disc3, Headphones, Music2, PlayCircle, Radio } from 'lucide-react';
import { cleanArtistQuery, normalizeSearchText } from '../utils/dates';

interface StreamingLinksRowProps {
  artistName: string;
  onNotify?: (msg: string) => void;
}

interface ResolvedArtistIds {
  spotifyId?: string;
  deezerId?: string;
  appleMusicId?: string;
  qobuzId?: string;
}

interface NativeAppLaunchConfig {
  scheme: string;
  androidPackage: string;
  appPath: string;
  iosUri?: string;
  webFallbackUrl: string;
}

// Cache mémoire pour éviter de refaire l'appel Wikidata pour un même artiste durant la session
const artistIdsCache = new Map<string, ResolvedArtistIds>();

async function resolveArtistIdsFromWikidata(
  artistQuery: string,
  signal: AbortSignal
): Promise<ResolvedArtistIds> {
  const normTarget = normalizeSearchText(artistQuery);
  if (!normTarget || normTarget.length < 2) return {};

  const cached = artistIdsCache.get(normTarget);
  if (cached) return cached;

  try {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
      artistQuery
    )}&language=fr&uselang=fr&format=json&limit=6&origin=*`;
    const searchRes = await fetch(searchUrl, { signal });
    if (!searchRes.ok) return {};
    const searchData = await searchRes.json();
    const candidates: { id: string; label?: string; match?: { text?: string } }[] =
      searchData?.search || [];

    // On ne garde que les candidats dont le nom (ou alias matché) correspond vraiment à l'artiste
    const matchingIds = candidates
      .filter((c) => {
        const l = normalizeSearchText(c.label || '');
        const m = normalizeSearchText(c.match?.text || '');
        return l === normTarget || m === normTarget;
      })
      .map((c) => c.id);

    if (matchingIds.length === 0) {
      artistIdsCache.set(normTarget, {});
      return {};
    }

    const entitiesUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${matchingIds.join(
      '|'
    )}&props=claims&format=json&origin=*`;
    const entRes = await fetch(entitiesUrl, { signal });
    if (!entRes.ok) return {};
    const entData = await entRes.json();

    for (const id of matchingIds) {
      const claims = entData?.entities?.[id]?.claims || {};
      const spotifyId: string | undefined =
        claims?.P1902?.[0]?.mainsnak?.datavalue?.value;
      const deezerId: string | undefined =
        claims?.P2722?.[0]?.mainsnak?.datavalue?.value;
      const appleMusicId: string | undefined =
        claims?.P2850?.[0]?.mainsnak?.datavalue?.value;
      const qobuzId: string | undefined =
        claims?.P11578?.[0]?.mainsnak?.datavalue?.value ||
        claims?.P7071?.[0]?.qualifiers?.P11578?.[0]?.datavalue?.value;

      if (spotifyId || deezerId || appleMusicId || qobuzId) {
        const resolved: ResolvedArtistIds = {
          spotifyId,
          deezerId,
          appleMusicId,
          qobuzId,
        };
        artistIdsCache.set(normTarget, resolved);
        return resolved;
      }
    }

    artistIdsCache.set(normTarget, {});
    return {};
  } catch {
    return {};
  }
}

function isMobileDevice(): { isAndroid: boolean; isIOS: boolean } {
  if (typeof navigator === 'undefined') return { isAndroid: false, isIOS: false };
  const ua = navigator.userAgent || '';
  const isAndroid = /android/i.test(ua);
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  return { isAndroid, isIOS };
}

/**
 * Ouvre directement l'application native sur mobile quand elle est installée,
 * avec bascule automatique sur le navigateur web sinon.
 */
function launchMobileAppOrWeb(
  e: MouseEvent<HTMLAnchorElement>,
  config: NativeAppLaunchConfig
) {
  if (typeof window === 'undefined') return;
  const { isAndroid, isIOS } = isMobileDevice();
  if (!isAndroid && !isIOS) return;

  e.preventDefault();

  const { scheme, androidPackage, appPath, iosUri, webFallbackUrl } = config;

  if (isAndroid) {
    const intentUrl = `intent://${appPath}#Intent;scheme=${scheme};package=${androidPackage};S.browser_fallback_url=${encodeURIComponent(
      webFallbackUrl
    )};end`;
    window.location.href = intentUrl;
    return;
  }

  // iOS / iPadOS : tente le deep link natif et bascule sur le navigateur si l'app n'est pas installée
  let appOpened = false;
  let fallbackTimer = 0;

  const cleanup = () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onLeave);
    window.removeEventListener('blur', onLeave);
    if (fallbackTimer) {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = 0;
    }
  };

  const onLeave = () => {
    appOpened = true;
    cleanup();
  };

  const onVisibilityChange = () => {
    if (document.hidden) onLeave();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onLeave);
  window.addEventListener('blur', onLeave);

  window.location.href = iosUri || `${scheme}://${appPath}`;

  fallbackTimer = window.setTimeout(() => {
    cleanup();
    if (!appOpened && !document.hidden) {
      window.location.href = webFallbackUrl;
    }
  }, 1300);
}

export function StreamingLinksRow({ artistName, onNotify }: StreamingLinksRowProps) {
  const query = cleanArtistQuery(artistName);
  const encoded = encodeURIComponent(query);
  const [resolved, setResolved] = useState<ResolvedArtistIds>(() => {
    return artistIdsCache.get(normalizeSearchText(query)) || {};
  });

  useEffect(() => {
    const norm = normalizeSearchText(query);
    const cached = artistIdsCache.get(norm);
    if (cached) {
      setResolved(cached);
      return;
    }
    setResolved({});
    const controller = new AbortController();
    resolveArtistIdsFromWikidata(query, controller.signal).then((ids) => {
      if (!controller.signal.aborted) {
        setResolved(ids);
      }
    });
    return () => controller.abort();
  }, [query]);

  // URLs directes vers la page artiste quand résolu, sinon recherche propre
  const spotifyWebUrl = resolved.spotifyId
    ? `https://open.spotify.com/artist/${resolved.spotifyId}`
    : `https://open.spotify.com/search/${encoded}`;

  const appleMusicUrl = resolved.appleMusicId
    ? `https://music.apple.com/fr/artist/${resolved.appleMusicId}`
    : `https://music.apple.com/fr/search?term=${encoded}`;

  const deezerWebUrl = resolved.deezerId
    ? `https://www.deezer.com/artist/${resolved.deezerId}`
    : `https://www.deezer.com/search/${encoded}`;

  const qobuzWebUrl = resolved.qobuzId
    ? `https://open.qobuz.com/artist/${resolved.qobuzId}`
    : `https://play.qobuz.com/search?q=${encoded}`;

  const youtubeUrl = `https://www.youtube.com/results?search_query=${encoded}`;

  const handleSpotifyClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Si on a l'ID artiste exact, le lien universel https://open.spotify.com/artist/{id} ouvre directement la page dans l'app
    if (resolved.spotifyId) return;
    // Sinon sur mobile, on utilise l'URI natif spotify:search:... (les liens web /search/ ouvrent parfois Spotify sur l'accueil)
    const plusQuery = encodeURIComponent(query).replace(/%20/g, '+');
    launchMobileAppOrWeb(e, {
      scheme: 'https',
      androidPackage: 'com.spotify.music',
      appPath: `open.spotify.com/search/${encoded}`,
      iosUri: `spotify:search:${plusQuery}`,
      webFallbackUrl: spotifyWebUrl,
    });
  };

  const handleDeezerClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Si on a l'ID artiste exact, https://www.deezer.com/artist/{id} est un Universal/App Link natif
    if (resolved.deezerId) return;
    launchMobileAppOrWeb(e, {
      scheme: 'deezer',
      androidPackage: 'deezer.android.app',
      appPath: `www.deezer.com/search/${encoded}`,
      webFallbackUrl: deezerWebUrl,
    });
  };

  const handleQobuzClick = (e: MouseEvent<HTMLAnchorElement>) => {
    const { isAndroid, isIOS } = isMobileDevice();
    if (!isAndroid && !isIOS) return;

    if (resolved.qobuzId) {
      launchMobileAppOrWeb(e, {
        scheme: 'qobuzapp',
        androidPackage: 'com.qobuz.music',
        appPath: `artist/${resolved.qobuzId}`,
        webFallbackUrl: qobuzWebUrl,
      });
      return;
    }

    // L'app mobile Qobuz ne supporte pas le pré-remplissage de sa barre de recherche par URL :
    // on copie le nom de l'artiste dans le presse-papiers pour un collage en 1 tap dès l'ouverture de Qobuz.
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(query).catch(() => {});
      onNotify?.(`« ${query} » copié — colle-le dans la recherche Qobuz`);
    }

    launchMobileAppOrWeb(e, {
      scheme: 'qobuzapp',
      androidPackage: 'com.qobuz.music',
      appPath: `search?q=${encoded}`,
      webFallbackUrl: qobuzWebUrl,
    });
  };

  const services = [
    {
      name: 'Spotify',
      url: spotifyWebUrl,
      icon: Disc3,
      cls: 'bg-[#1DB954]/14 hover:bg-[#1DB954]/24 border-[#1DB954]/35 text-[#6EE7A0]',
      onClick: handleSpotifyClick,
    },
    {
      name: 'Apple Music',
      url: appleMusicUrl,
      icon: Music2,
      cls: 'bg-[#FA243C]/14 hover:bg-[#FA243C]/24 border-[#FA243C]/35 text-[#FDA4AF]',
      onClick: undefined,
    },
    {
      name: 'Deezer',
      url: deezerWebUrl,
      icon: Headphones,
      cls: 'bg-[#A238FF]/14 hover:bg-[#A238FF]/24 border-[#A238FF]/35 text-[#D8B4FE]',
      onClick: handleDeezerClick,
    },
    {
      name: 'Qobuz',
      url: qobuzWebUrl,
      icon: Radio,
      cls: 'bg-sky-500/14 hover:bg-sky-500/24 border-sky-400/35 text-sky-300',
      onClick: handleQobuzClick,
    },
    {
      name: 'YouTube',
      url: youtubeUrl,
      icon: PlayCircle,
      cls: 'bg-[#FF0000]/14 hover:bg-[#FF0000]/24 border-[#FF0000]/30 text-[#FCA5A5]',
      onClick: undefined,
    },
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {services.map((s) => {
        const Icon = s.icon;
        return (
          <a
            key={s.name}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={s.onClick}
            aria-label={`Écouter ${query} sur ${s.name} (nouvel onglet)`}
            className={`flex-1 min-w-[96px] py-2 px-2.5 rounded-xl border text-[11.5px] font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all ${s.cls}`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{s.name}</span>
            <span className="sr-only"> (nouvel onglet)</span>
          </a>
        );
      })}
    </div>
  );
}
