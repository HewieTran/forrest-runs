import type { Metadata } from "next";
import { signOutPath } from '@forrest/platform';
import { SessionActions } from '../components/SessionActions';
import '../components/session-actions.css';
import "./training.css";
import '../components/brand.css';

export const metadata: Metadata = {
  title: "Forrest Runs",
  applicationName: "Forrest Runs",
  description: "Forrest Runs brings your training plan, workout log, and milestones together.",
  manifest: "/branding/forrest-runs.webmanifest",
  icons: {
    icon: [{ url: "/branding/forrest-runs-32.png", type: "image/png", sizes: "32x32" }],
    shortcut: "/branding/forrest-runs-32.png",
    apple: [{ url: "/branding/forrest-runs-180.png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head><link rel="preload" href="/branding/manrope-medium-latin.ttf" as="font" type="font/ttf" crossOrigin="anonymous" /></head>
      <body className="antialiased"><SessionActions signOutPath={signOutPath()}>{children}</SessionActions></body>
    </html>
  );
}
