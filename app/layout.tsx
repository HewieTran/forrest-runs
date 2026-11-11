import type { Metadata } from "next";
import { signOutPath } from '@forrest/platform';
import { SessionActions } from '../components/SessionActions';
import '../components/session-actions.css';
import "./training.css";

export const metadata: Metadata = {
  title: "Forrest Runs",
  description: "Forrest Runs brings your training plan, workout log, and milestones together.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased"><SessionActions signOutPath={signOutPath()}>{children}</SessionActions></body>
    </html>
  );
}
