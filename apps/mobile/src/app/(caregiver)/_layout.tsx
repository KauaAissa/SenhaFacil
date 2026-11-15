import { useRequireRole } from '../../hooks/useRequireRole';
import { AppTabs } from '../../components/AppTabs';

export default function CaregiverLayout() {
  const { isChecking } = useRequireRole('CAREGIVER');

  if (isChecking) return null;

  return <AppTabs caregiver />;
}
