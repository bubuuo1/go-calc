import type { AppProps } from "next/app";
import Head from "next/head";
import AuthGate from "@/components/AuthGate";
import PwaStatusBanner from "@/components/PwaStatusBanner";
import { AuthProvider } from "@/contexts/AuthContext";
import { PwaProvider } from "@/contexts/PwaContext";
import "@/styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <link href="/favicon.png" rel="icon" type="image/png" />
        <link href="/apple-touch-icon.png" rel="apple-touch-icon" sizes="180x180" />
        <link href="/manifest.webmanifest" rel="manifest" />
        <meta content="#2563eb" name="theme-color" />
        <meta content="yes" name="apple-mobile-web-app-capable" />
        <meta content="default" name="apple-mobile-web-app-status-bar-style" />
        <meta content="솔샘네 가계부" name="apple-mobile-web-app-title" />
      </Head>
      <PwaProvider>
        <AuthProvider>
          <PwaStatusBanner />
          <AuthGate>
            <Component {...pageProps} />
          </AuthGate>
        </AuthProvider>
      </PwaProvider>
    </>
  );
}
   
