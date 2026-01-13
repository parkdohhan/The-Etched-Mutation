import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portfolio | Pathology",
  description: "A portfolio exploring recursive structures, memory systems, and the pathology of choice.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-mono antialiased bg-stone-950 text-stone-300">
        {children}
      </body>
    </html>
  );
}
