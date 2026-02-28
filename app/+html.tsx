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
        <link href="/manifest.webmanifest" rel="manifest" />
        <link href="/icons/apple-touch-icon.png" rel="apple-touch-icon" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
