import 'server-only';
import { hmac } from '@/lib/crypto';

/**
 * Signed links for photos that donors may see without an account: the
 * delivery photo of gear they funded. The signature is per need, so a link
 * opens that one photo and nothing else.
 */
export const deliverySig = (needId: string) => hmac('delivery', needId).slice(0, 24);
export const deliveryPhotoPath = (needId: string) => `/media/delivery/${needId}?sig=${deliverySig(needId)}`;
