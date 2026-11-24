import type { MouseEvent } from 'react';
import { Disc3, Headphones, Music2, PlayCircle, Radio } from 'lucide-react';
import { cleanArtistQuery } from '../utils/dates';

interface StreamingLinksRowProps {
  artistName: string;
}

interface NativeAppLaunchConfig {
  scheme: string;
  androidPackage: string;
  appPath: string;
  webFallbackUrl: string;
}

/**
 * Opens a streaming service directly in its native mobile app when installed,
 * with automatic browser fallback otherwise (needed for Qobuz & Deezer whose
 * web search URLs are not registered as Universal / App Links).
 * - Android: native `intent://` URI with `package=...` and `S.browser_fallback_url`
 * - iOS / iPadOS: custom `<scheme>://` deep link + visibility/blur-aware fallback timer
 * - Desktop: leaves normal `<a target="_blank">` navigation untouched
 */
function handleNativeAppClick(
  e: MouseEvent<HTMLAnchorElement>,
  config: NativeAppLaunchConfig
) {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return;

  const ua = navigator.userAgent || '';
  const isAndroid = /android/i.test(ua);
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);

  if (!isAndroid && !isIOS) {
    // Desktop: let standard <a href={webFallbackUrl} target="_blank"> handle it
    return;
  }

  e.preventDefault();

  const { scheme, androidPackage, appPath, webFallbackUrl } = config;

  if (isAndroid) {
    const intentUrl = `intent://${appPath}#Intent;scheme=${scheme};package=${androidPackage};S.browser_fallback_url=${encodeURIComponent(
      webFallbackUrl
    )};end`;
    window.location.href = intentUrl;
    return;
  }

  // iOS / iPadOS: try native URL scheme and fall back to web if app isn't installed
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

  window.location.href = `${scheme}://${appPath}`;

  fallbackTimer = window.setTimeout(() => {
    cleanup();
    if (!appOpened && !document.hidden) {
      window.location.href = webFallbackUrl;
    }
  }, 1300);
}

export function StreamingLinksRow({ artistName }: StreamingLinksRowProps) {
  const query = cleanArtistQuery(artistName);
  const encoded = encodeURIComponent(query);
  const deezerWebUrl = `https://www.deezer.com/search/${encoded}`;
  const qobuzWebUrl = `https://play.qobuz.com/search?q=${encoded}`;

  const services = [
    {
      name: 'Spotify',
      url: `https://open.spotify.com/search/${encoded}`,
      icon: Disc3,
      cls: 'bg-[#1DB954]/14 hover:bg-[#1DB954]/24 border-[#1DB954]/35 text-[#6EE7A0]',
      onClick: undefined,
    },
    {
      name: 'Apple Music',
      url: `https://music.apple.com/fr/search?term=${encoded}`,
      icon: Music2,
      cls: 'bg-[#FA243C]/14 hover:bg-[#FA243C]/24 border-[#FA243C]/35 text-[#FDA4AF]',
      onClick: undefined,
    },
    {
      name: 'Deezer',
      url: deezerWebUrl,
      icon: Headphones,
      cls: 'bg-[#A238FF]/14 hover:bg-[#A238FF]/24 border-[#A238FF]/35 text-[#D8B4FE]',
      onClick: (e: MouseEvent<HTMLAnchorElement>) =>
        handleNativeAppClick(e, {
          scheme: 'deezer',
          androidPackage: 'deezer.android.app',
          appPath: `www.deezer.com/search/${encoded}`,
          webFallbackUrl: deezerWebUrl,
        }),
    },
    {
      name: 'Qobuz',
      url: qobuzWebUrl,
      icon: Radio,
      cls: 'bg-sky-500/14 hover:bg-sky-500/24 border-sky-400/35 text-sky-300',
      onClick: (e: MouseEvent<HTMLAnchorElement>) =>
        handleNativeAppClick(e, {
          scheme: 'qobuzapp',
          androidPackage: 'com.qobuz.music',
          appPath: `search?q=${encoded}`,
          webFallbackUrl: qobuzWebUrl,
        }),
    },
    {
      name: 'YouTube',
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${query} live music`)}`,
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
            className={`flex-1 min-w-[96px] py-2 px-2.5 rounded-xl border text-[11.5px] font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all ${s.cls}`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{s.name}</span>
          </a>
        );
      })}
    </div>
  );
}
