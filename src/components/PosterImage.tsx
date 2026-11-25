import { useMemo, useState, type SyntheticEvent } from 'react';
import { ImageOff } from 'lucide-react';
import type { Concert } from '../data/toulouseData';

interface PosterImageProps {
  concert: Concert;
  /** Texte alternatif ; par défaut « Affiche <titre> » */
  alt?: string;
  className?: string;
  /**
   * Intrinsic dimensions — évitent tout décalage de mise en page (CLS) pendant
   * le chargement. Les ratios par défaut correspondent aux gabarits de l'app.
   */
  width?: number;
  height?: number;
  loading?: 'lazy' | 'eager';
  sizes?: string;
  /** Décoratif : masque le texte alternatif (miniatures déjà légendées) */
  decorative?: boolean;
}

/**
 * Affiche de concert avec :
 *  - dimensions intrinsèques (zéro CLS),
 *  - `decoding="async"` (n'bloque pas le rendu),
 *  - bascule automatique vers `sourcePosterUrl` puis placeholder gracieux,
 *  - `referrerPolicy="no-referrer"` pour les images distantes restantes.
 */
export function PosterImage({
  concert,
  alt,
  className = '',
  width = 600,
  height = 600,
  loading = 'lazy',
  sizes,
  decorative = false,
}: PosterImageProps) {
  const sources = useMemo(() => {
    const list = [concert.poster, concert.sourcePosterUrl].filter(
      (s): s is string => typeof s === 'string' && s.length > 0
    );
    return [...new Set(list)];
  }, [concert.poster, concert.sourcePosterUrl]);

  const [srcIndex, setSrcIndex] = useState(0);
  const [failed, setFailed] = useState(sources.length === 0);
  const src = sources[srcIndex];

  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    event.currentTarget.dataset.broken = '1';
    if (srcIndex < sources.length - 1) {
      setSrcIndex(srcIndex + 1);
    } else {
      setFailed(true);
    }
  };

  if (failed || !src) {
    return (
      <div
        role={decorative ? 'presentation' : 'img'}
        aria-label={decorative ? undefined : (alt ?? `Affiche indisponible : ${concert.title}`)}
        className={`flex items-center justify-center bg-gradient-to-br from-[#231F29] to-[#151319] text-[#6B6472] ${className}`}
      >
        <ImageOff className="w-5 h-5" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={decorative ? '' : (alt ?? `Affiche ${concert.title}`)}
      width={width}
      height={height}
      loading={loading}
      decoding="async"
      sizes={sizes}
      referrerPolicy="no-referrer"
      onError={handleError}
      className={className}
    />
  );
}
