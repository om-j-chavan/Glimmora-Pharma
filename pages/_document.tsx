import { Html, Head, Main, NextScript } from "next/document";

const themeInitScript = `(function(){try{var t=localStorage.getItem('glimmora-theme')||'light';var c=localStorage.getItem('glimmora-color-theme')||'coffee-brown';document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-color-theme',c);}catch(e){}})();`;

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </Head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
