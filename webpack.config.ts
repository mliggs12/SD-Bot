import path from 'path';
import webpack from 'webpack';
import CopyWebpackPlugin from 'copy-webpack-plugin';

const config = (env: unknown, argv: { mode?: string }): webpack.Configuration => {
  const isProduction = argv.mode === 'production';
  
  return {
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? 'source-map' : 'inline-source-map',
    
    entry: {
      background: './src/background/background.ts',
      'content/ringcentral': './src/content/ringcentral.ts',
      'content/freshservice': './src/content/freshservice.ts',
      sidepanel: './src/sidepanel/sidepanel.ts',
    },
    
    resolve: {
      extensions: ['.ts', '.js'],
    },
    
    module: {
      rules: [
        {
          test: /\.ts$/,
          loader: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },
    
    output: {
      filename: '[name].js',
      path: path.resolve(__dirname, 'dist'),
      clean: true,
    },
    optimization: {
      minimize: isProduction,
    },
    
    plugins: [
      // Bake a build timestamp into the compiled JS so a stale dist/ is
      // immediately visible in the sidepanel and console logs
      new webpack.DefinePlugin({
        __BUILD_INFO__: JSON.stringify(
          `${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`
        ),
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: 'manifest.json',
            to: 'manifest.json',
            // The root manifest's paths are relative to the repo root (so the
            // root folder is loadable as an unpacked extension). Strip the
            // dist/ prefix in the copy so dist/ is ALSO a valid standalone
            // unpacked extension.
            transform: (content: Buffer): string => {
              const manifest = JSON.parse(content.toString()) as {
                icons: Record<string, string>;
                background: { service_worker: string };
                side_panel: { default_path: string };
                content_scripts: Array<{ js: string[] }>;
              };
              const strip = (p: string): string => p.replace(/^dist\//, '');
              manifest.icons['128'] = strip(manifest.icons['128']);
              manifest.background.service_worker = strip(manifest.background.service_worker);
              manifest.side_panel.default_path = strip(manifest.side_panel.default_path);
              for (const contentScript of manifest.content_scripts) {
                contentScript.js = contentScript.js.map(strip);
              }
              return JSON.stringify(manifest, null, 2);
            },
          },
          { from: 'src/sidepanel/sidepanel.html', to: 'sidepanel/sidepanel.html' },
          { from: 'src/images', to: 'images' },
        ],
      }),
    ],
  };
};

export default config;
