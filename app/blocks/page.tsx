import { redirect } from 'next/navigation';
import BlockLibrary from '../../components/BlockLibrary';
import { getCurrentUser, signInPath } from '../../lib/auth';
import { loadBlockLibrary } from '../../lib/store';
export const dynamic = 'force-dynamic';
export default async function Blocks() {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath('/blocks'));
  return <BlockLibrary initial={await loadBlockLibrary(user)} displayName={user.fullName?.split(' ')[0] ?? 'Runner'} />;
}
