import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { SmoothScroll } from "@/components/SmoothScroll";
import { TourProvider } from "@/components/tour/Tour";
import { Prefetch } from "@/components/Prefetch";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });
const plex = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Daycover+ — climate income cover by Income Insurance",
  description:
    "Parametric income cover for Singapore's hawkers: settled on official NEA and MSS readings at your own gauge, with a printed receipt for every decision.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${archivo.variable} ${plex.variable} paper-bg antialiased`}>
        <TourProvider>
          <SmoothScroll />
          <Prefetch />
          <Nav />
          {children}
        </TourProvider>
      </body>
    </html>
  );
}
