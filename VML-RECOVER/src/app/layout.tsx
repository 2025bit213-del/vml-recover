import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
export const metadata: Metadata = {
  title: "VML RECOVER | Debt Recovery & Legal Platform",
  description: "Institutional debt recovery, loan workout and legal mediation platform.",
  applicationName: "VML RECOVER",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "VML RECOVER" }
};
export const viewport: Viewport = { themeColor: "#070D1E", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}<PwaRegister /><PwaInstallPrompt /></body></html>;
}
