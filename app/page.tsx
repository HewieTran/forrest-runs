import { redirect } from 'next/navigation';
import BlockLibrary from '../components/BlockLibrary';
import { getCurrentUser,signInPath,signInLabel } from '../lib/auth';
import { loadBlockLibrary } from '../lib/store';
import {Activity,ArrowRight,LockKeyhole} from 'lucide-react';
export const dynamic='force-dynamic';
export default async function Home(){
 const user=await getCurrentUser();
 if(!user)return <main className="signin-page"><div className="signin-card"><span className="brand-icon"><Activity size={29}/></span><p className="overline">Forrest Runs</p><h1>One run at a time.</h1><p>Your training plan, workout history, and milestones, together in one private space.</p><a className="button primary" href={signInPath('/')} target="_top">{signInLabel()} <ArrowRight size={17}/></a><small><LockKeyhole size={13}/> Your training records are saved to your account.</small></div></main>;
 const blocks = await loadBlockLibrary(user);
 const currentBlock = blocks.find(block => block.status === 'active');
 if (currentBlock) redirect(`/blocks/${encodeURIComponent(currentBlock.id)}`);
 return <BlockLibrary initial={blocks} displayName={user.fullName?.split(' ')[0] ?? 'Runner'} />;
}
