import { ScrollViewStyleReset } from 'expo-router/html';

import type { PropsWithChildren } from 'react';

export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta content="IE=edge" httpEquiv="X-UA-Compatible" />
        <meta
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
          name="viewport"
        />
        <meta
          content="#1B6EF3"
          media="(prefers-color-scheme: light)"
          name="theme-color"
        />
        <meta
          content="#0F141D"
          media="(prefers-color-scheme: dark)"
          name="theme-color"
        />
        <style>{`
          #app-boot-shell {
            position: fixed;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #F5F7FB;
            color: #1B6EF3;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 16px;
            font-weight: 600;
            z-index: 9999;
            transition: opacity 120ms ease-out;
          }

          @media (prefers-color-scheme: dark) {
            #app-boot-shell {
              background: #0F141D;
            }
          }
        `}</style>
        <link href="/manifest.webmanifest" rel="manifest" />
        <link href="/icons/apple-touch-icon.png" rel="apple-touch-icon" />
        <ScrollViewStyleReset />
      </head>
      <body>
        <div aria-live="polite" id="app-boot-shell">
          Loading Bowling Journal…
        </div>
        {children}
      </body>
    </html>
  );
}
