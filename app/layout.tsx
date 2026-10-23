import type { Metadata } from "next";
import "./training.css";

export const metadata: Metadata = {
  title: "Marathon Training Tracker",
  description: "Your training plan, workout log, and milestones in one place.",
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
