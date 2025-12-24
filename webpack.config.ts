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
      new CopyWebpackPlugin({
        patterns: [
          { from: 'manifest.json', to: 'manifest.json' },
          { from: 'src/sidepanel/sidepanel.html', to: 'sidepanel/sidepanel.html' },
          { from: 'src/images', to: 'images' },
        ],
      }),
    ],
  };
};

export default config;
