import { Platform } from 'react-native';
import { installationId } from './installation-id';

export async function installationData() {
  return { installationId: await installationId(), devicePlatform: Platform.OS === 'android' ? 'ANDROID' : 'IOS' };
}
