import Tracker from '../components/Tracker';
import { getCurrentUser,signInPath } from '../lib/auth';
import { loadTraining } from '../lib/store';
import {Activity,ArrowRight,LockKeyhole} from 'lucide-react';
export const dynamic='force-dynamic';
export default async function Home(){
 const user=await getCurrentUser();
 if(!user)return <main className="signin-page"><div className="signin-card"><span className="brand-icon"><Activity size={29}/></span><p className="overline">Forrest Runs</p><h1>One run at a time.</h1><p>Your training plan, workout history, and milestones, together in one private space.</p><a className="button primary" href={signInPath('/')} target="_top">Sign in with ChatGPT <ArrowRight size={17}/></a><small><LockKeyhole size={13}/> Your training records are saved to your account.</small></div></main>;
 return <Tracker initial={await loadTraining(user)}/>;
}
