"use client";
// Artwork for a title we may not stock: Qloo or a CDN supplies the image URL, and some of those links die.
// No URL or a failed load shows a hand-written shop tag (format + name) instead of a grey square or a broken icon.
import { useState } from "react";

const KIND: Record<string, string> = { "urn:entity:artist": "Vinyl", "urn:entity:movie": "Film", "urn:entity:book": "Book", "urn:entity:videogame": "Game", "urn:entity:tv_show": "TV" };

export function Cover({ src, name, type, className = "", alt = "", lazy = false }: { src?: string | null; name: string; type?: string; className?: string; alt?: string; lazy?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) return <img className={className} src={src} alt={alt} loading={lazy ? "lazy" : undefined} onError={() => setFailed(true)} />;
  return (
    <span className={`cover-tag ${className}`} role="img" aria-label={alt || name}>
      <small>{(type && KIND[type]) ?? "Title"}</small>
      <b>{name}</b>
    </span>
  );
}
