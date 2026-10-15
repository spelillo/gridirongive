import { SITE } from '@/config/site';

export function sportLabel(id: string) {
  return SITE.sports.find((s) => s.id === id)?.label ?? id;
}
