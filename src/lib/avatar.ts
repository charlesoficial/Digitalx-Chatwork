import { useEffect, useState } from "react";
import { signedFile } from "./api";

// The database stores a stable private Storage path, never an expiring signed URL.
export function useAvatarUrl(avatar: string | null | undefined) {
  const privatePhoto = avatar?.startsWith("storage://avatars/");
  const [resolved, setResolved] = useState<{ avatar: string; url: string } | null>(null);
  useEffect(() => {
    if (!avatar?.startsWith("storage://avatars/")) return;
    let active = true;
    signedFile(avatar.slice("storage://avatars/".length), "avatars")
      .then(url => { if (active) setResolved({ avatar, url }); })
      .catch(() => { /* Initials remain visible if the private photo is unavailable. */ });
    return () => { active = false; };
  }, [avatar]);
  return privatePhoto ? (resolved && resolved.avatar === avatar ? resolved.url : null) : avatar;
}
