import { installationId } from './installation-id';

export async function installationData() {
  return { installationId: await installationId(), devicePlatform: 'WEB' as const };
}
