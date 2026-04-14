import type { AppProps } from "next/app";
import Head from "next/head";
import { StrictMode } from "react";
import "@/index.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <StrictMode>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>pharma-glimmora</title>
      </Head>
      <Component {...pageProps} />
    </StrictMode>
  );
}
