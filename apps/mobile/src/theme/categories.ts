import type { IconName } from '../components/ui/Presentation';
import type { LocalVaultItem } from '../services/offline-vault.service';
import type { Tone } from './theme';

type Category = LocalVaultItem['category'];
export const categories: ReadonlyArray<{ value: Category; label: string; icon: IconName; tone: Tone }> = [
  { value: 'BANKING', label: 'Banco', icon: 'wallet-outline', tone: 'primary' },
  { value: 'SOCIAL_MEDIA', label: 'Rede social', icon: 'chatbubbles-outline', tone: 'coral' },
  { value: 'EMAIL', label: 'E-mail', icon: 'mail-outline', tone: 'accent' },
  { value: 'HEALTH', label: 'Saúde', icon: 'heart-outline', tone: 'danger' },
  { value: 'GOVERNMENT', label: 'Governo', icon: 'business-outline', tone: 'primary' },
  { value: 'SHOPPING', label: 'Compras', icon: 'bag-handle-outline', tone: 'warning' },
  { value: 'OTHER', label: 'Outro', icon: 'key-outline', tone: 'neutral' },
];

export function categoryDetails(value: string) {
  return categories.find((category) => category.value === value) ?? categories[categories.length - 1];
}
