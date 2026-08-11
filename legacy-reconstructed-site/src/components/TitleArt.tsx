import { useState } from 'react';

type Props = {
  src: string;
  alt: string;
  fallback: string;
  className?: string;
};

export function TitleArt({ src, alt, fallback, className = '' }: Props) {
  const [failed, setFailed] = useState(false);
  if (failed) return <h1 className={`page-title title-art-fallback ${className}`}>{fallback}</h1>;
  return <img className={`title-art-image ${className}`} src={src} alt={alt} onError={() => setFailed(true)} />;
}
