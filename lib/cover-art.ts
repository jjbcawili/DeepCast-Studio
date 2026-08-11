export const AUTO_COVER_OPTIONS = [
  { id: "vinyl-editorial", label: "VINYL EDITORIAL", src: "/assets/auto-covers/vinyl-editorial.webp" },
  { id: "neon-broadcast", label: "NEON BROADCAST", src: "/assets/auto-covers/neon-broadcast.webp" },
  { id: "pop-stage", label: "POP STAGE", src: "/assets/auto-covers/pop-stage.webp" },
  { id: "archive-room", label: "ENTERTAINMENT ARCHIVE", src: "/assets/auto-covers/archive-room.webp" },
] as const;

export function automaticCoverFor(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  return AUTO_COVER_OPTIONS[Math.abs(hash) % AUTO_COVER_OPTIONS.length].src;
}
