import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
    display: "swap",
});

const spaceGrotesk = Space_Grotesk({
    subsets: ["latin"],
    variable: "--font-space-grotesk",
    display: "swap",
});

export const metadata: Metadata = {
    title: "Morning Article - Medical Insight Assistant",
    description: "AI-powered medical research briefing for healthcare professionals",
    icons: {
        icon: "/favicon.svg",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ko" suppressHydrationWarning className={`${inter.variable} ${spaceGrotesk.variable}`}>
            <body className="font-sans antialiased" suppressHydrationWarning>{children}</body>
        </html>
    );
}
