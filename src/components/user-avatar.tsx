"use client";

import { useState } from "react";

interface UserAvatarProps {
  user: { id: string; name: string; photoFileName?: string | null };
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASSES = {
  sm: "w-8 h-8 text-[11px]",
  md: "w-9 h-9 text-xs",
  lg: "w-16 h-16 text-lg rounded-2xl",
} as const;

export function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Photo when the person has one and it loads; initials otherwise. `onError`
 * (not just a `photoFileName` check) matters here: the fileToken behind
 * `/api/users/[id]/photo` can expire between render and load, and the user
 * must never see a broken-image icon in that window — see S12 plan.
 */
export function UserAvatar({ user, size = "md" }: UserAvatarProps) {
  const [errored, setErrored] = useState(false);
  const showImg = !!user.photoFileName && !errored;

  return (
    <div
      className={`${SIZE_CLASSES[size]} shrink-0 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5 text-primary flex items-center justify-center font-semibold ring-1 ring-primary/15`}
    >
      {showImg ? (
        <img
          src={`/api/users/${user.id}/photo`}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        initialsOf(user.name)
      )}
    </div>
  );
}
