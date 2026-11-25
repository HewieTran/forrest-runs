import { redirect } from 'next/navigation';
import BlockLibrary from '../../components/BlockLibrary';
import { getCurrentUser, signInPath } from '../../lib/auth';
import { firstName, librarySearch } from '../../lib/library-greeting';
import { loadBlockLibrary } from '../../lib/store';
import { guidanceSessionKey, landingFilter, libraryFilter } from '../../lib/onboarding';
import { centralToday } from '../../lib/domain';
export const dynamic = 'force-dynamic';
export default async function Blocks({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const returnQuery = new URLSearchParams();
  const selected = libraryFilter(query.status);
  if (selected) returnQuery.set('status', selected);
  const search = librarySearch(query.q);
  if (search) returnQuery.set('q', search);
  const returnTo = '/blocks' + (returnQuery.size ? '?' + returnQuery : '');
  const user = await getCurrentUser();
  if (!user) redirect(signInPath(returnTo));
  const blocks = await loadBlockLibrary(user);
  return <BlockLibrary initial={blocks} initialFilter={selected ?? landingFilter(blocks)} initialSearch={search} today={centralToday()} guidanceKey={blocks.length ? undefined : await guidanceSessionKey(user.userId)} displayName={firstName(user.fullName)} />;
}
