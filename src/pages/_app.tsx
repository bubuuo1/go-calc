import type { AppProps } from "next/app";
import Head from "next/head";
import AuthGate from "@/components/AuthGate";
import { AuthProvider } from "@/contexts/AuthContext";
import "@/styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <link href="/favicon.png" rel="icon" type="image/png" />
        <link href="/favicon.png" rel="apple-touch-icon" />
      </Head>
      <AuthProvider>
        <AuthGate>
          <Component {...pageProps} />
        </AuthGate>
      </AuthProvider>
    </>
  );
}
   
