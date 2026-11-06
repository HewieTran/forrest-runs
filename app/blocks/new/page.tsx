import { redirect } from 'next/navigation';
import SetupWizard from '../../../components/SetupWizard';
import { getCurrentUser, signInPath } from '../../../lib/auth';
import { centralToday } from '../../../lib/domain';
export const dynamic = 'force-dynamic';
export default async function NewBlock() {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath('/blocks/new'));
  const today = centralToday();
  return <SetupWizard displayName={user.fullName?.split(' ')[0] ?? 'Runner'} today={today} />;
}
