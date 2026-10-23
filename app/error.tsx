'use client';
export default function TrainingError({reset}:{reset:()=>void}) {return <main className="signin-page"><div className="signin-card"><h1>Let’s try that again.</h1><p>Your training data couldn’t be loaded. Your existing records haven’t been replaced.</p><button className="button primary" onClick={reset}>Try again</button></div></main>;}
