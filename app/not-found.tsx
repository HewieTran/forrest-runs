import { ArrowLeft, Flag } from 'lucide-react';
export default function NotFound() {
  return <main className="signin-page"><div className="signin-card"><Flag size={30} /><h1>Block unavailable.</h1><p>This page may have moved, or this training block isn’t available to your account.</p><a className="button primary" href="/blocks"><ArrowLeft size={16} />Training blocks</a></div></main>;
}
