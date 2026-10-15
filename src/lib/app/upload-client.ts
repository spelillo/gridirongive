/** Browser helper for /api/teams/[teamId]/upload. */
export type UploadKind = 'receipt' | 'delivery' | 'team' | 'verification';

export async function uploadTeamFile(teamId: string, kind: UploadKind, file: File): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  if (file.size > 4 * 1024 * 1024) return { ok: false, error: 'That file is over 4 MB. Try a smaller one.' };
  const body = new FormData();
  body.set('kind', kind);
  body.set('file', file);
  try {
    const res = await fetch(`/api/teams/${teamId}/upload`, { method: 'POST', body });
    const json = (await res.json().catch(() => null)) as { ok: boolean; key?: string; error?: string } | null;
    if (!json?.ok || !json.key) return { ok: false, error: json?.error ?? 'The upload failed. Try again.' };
    return { ok: true, key: json.key };
  } catch {
    return { ok: false, error: 'The upload failed. Check your connection and try again.' };
  }
}
