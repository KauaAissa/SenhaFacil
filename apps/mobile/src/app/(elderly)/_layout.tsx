import { useRequireRole } from '../../hooks/useRequireRole';
import { AppTabs } from '../../components/AppTabs';

export default function ElderlyLayout() {
  const { isChecking } = useRequireRole('ELDERLY');

  // useRequireRole triggers router.replace() as a side effect; render nothing
  // while the redirect resolves to avoid flashing elderly-only screens.
  if (isChecking) return null;

  return <AppTabs />;
}
