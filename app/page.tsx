import { redirect } from 'next/navigation';
import BlockLibrary from '../components/BlockLibrary';
import BrandIcon from '../components/BrandIcon';
import { getCurrentUser,signInPath,signInLabel } from '../lib/auth';
import { loadBlockLibrary } from '../lib/store';
import { guidanceSessionKey, landingFilter, libraryFilter } from '../lib/onboarding';
import { centralToday } from '../lib/domain';
import {ArrowRight,LockKeyhole} from 'lucide-react';
export const dynamic='force-dynamic';
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }){
 const query = await searchParams;
 const selected = libraryFilter(query.status);
 const search = typeof query.q === 'string' ? query.q : '';
 const returnQuery = new URLSearchParams();
 if (selected) returnQuery.set('status', selected);
 if (search) returnQuery.set('q', search);
 const returnTo = '/' + (returnQuery.size ? '?' + returnQuery : '');
 const user=await getCurrentUser();
 if(!user)return <main className="signin-page"><div className="signin-card"><BrandIcon /><p className="overline brand-wordmark signin-brand-name">Forrest Runs</p><h1>One run at a time.</h1><p>Your training plan, workout history, and milestones, together in one private space.</p><a className="button primary" href={signInPath(returnTo)} target="_top">{signInLabel()} <ArrowRight size={17}/></a><small><LockKeyhole size={13}/> Your training records are saved to your account.</small></div></main>;
 const blocks = await loadBlockLibrary(user);
 const currentBlock = blocks.find(block => block.status === 'active');
 if (currentBlock && !selected && !search) redirect(`/blocks/${encodeURIComponent(currentBlock.id)}`);
 return <BlockLibrary initial={blocks} initialFilter={selected ?? landingFilter(blocks)} initialSearch={search} today={centralToday()} guidanceKey={blocks.length ? undefined : await guidanceSessionKey(user.userId)} displayName={user.fullName?.split(' ')[0] ?? 'Runner'} />;
}
