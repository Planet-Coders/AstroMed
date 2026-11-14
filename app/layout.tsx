import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";
import { MissionModeProvider } from "@/components/MissionModeContext";
import { SyncProvider } from "@/components/SyncContext";
import { MissionTelemetryProvider } from "@/components/MissionTelemetryProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

const display = Playfair_Display({
  subsets: ["latin"],
  style: ["italic"],
  weight: ["500", "700"],
  variable: "--font-playfair",
});

export const metadata: Metadata = {
  title: "AstroMed // EDGE AI",
  description: "Astronaut Health Monitoring Console",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${plexMono.variable} ${display.variable}`}>
      <body className="antialiased" suppressHydrationWarning>
        <MissionModeProvider>
          <MissionTelemetryProvider>
            <SyncProvider>{children}</SyncProvider>
          </MissionTelemetryProvider>
        </MissionModeProvider>
      </body>
    </html>
  );
}
