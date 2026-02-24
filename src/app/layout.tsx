import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShowBuilder – AI Slide Generator for ProPresenter",
  description:
    "Upload a style guide and presentation notes, and let AI build your ProPresenter slides instantly.",
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
