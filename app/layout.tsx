import type { Metadata } from "next";
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
