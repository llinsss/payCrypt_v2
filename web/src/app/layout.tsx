import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "Tagged Dashboard",
  description: "Secure crypto payments dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
