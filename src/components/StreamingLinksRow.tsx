import { Disc3, Headphones, Music2, PlayCircle, Radio } from 'lucide-react';
import { cleanArtistQuery } from '../utils/dates';

interface StreamingLinksRowProps {
  artistName: string;
}

export function StreamingLinksRow({ artistName }: StreamingLinksRowProps) {
  const query = cleanArtistQuery(artistName);
  const encoded = encodeURIComponent(query);

  const services = [
    {
      name: 'Spotify',
      url: `https://open.spotify.com/search/${encoded}`,
      icon: Disc3,
      cls: 'bg-[#1DB954]/14 hover:bg-[#1DB954]/24 border-[#1DB954]/35 text-[#6EE7A0]',
    },
    {
      name: 'Apple Music',
      url: `https://music.apple.com/fr/search?term=${encoded}`,
      icon: Music2,
      cls: 'bg-[#FA243C]/14 hover:bg-[#FA243C]/24 border-[#FA243C]/35 text-[#FDA4AF]',
    },
    {
      name: 'Deezer',
      url: `https://www.deezer.com/search/${encoded}`,
      icon: Headphones,
      cls: 'bg-[#A238FF]/14 hover:bg-[#A238FF]/24 border-[#A238FF]/35 text-[#D8B4FE]',
    },
    {
      name: 'Qobuz',
      url: `https://play.qobuz.com/search?q=${encoded}`,
      icon: Radio,
      cls: 'bg-sky-500/14 hover:bg-sky-500/24 border-sky-400/35 text-sky-300',
    },
    {
      name: 'YouTube',
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${query} live music`)}`,
      icon: PlayCircle,
      cls: 'bg-[#FF0000]/14 hover:bg-[#FF0000]/24 border-[#FF0000]/30 text-[#FCA5A5]',
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
