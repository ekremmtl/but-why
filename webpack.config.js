import path from 'path';
import { fileURLToPath } from 'url';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import CssMinimizerPlugin from 'css-minimizer-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import HtmlMinimizerPlugin from 'html-minimizer-webpack-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default (env, argv) => {
  const isProd = argv.mode === 'production';

  return {
    entry: path.resolve(__dirname, 'src/main.js'),
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isProd ? 'assets/js/[name].[contenthash].js' : 'assets/js/[name].js',
      chunkFilename: isProd ? 'assets/js/[name].[contenthash].js' : 'assets/js/[name].js',
      assetModuleFilename: 'assets/[name][ext][query]',
      clean: true
    },
    devtool: false,
    module: {
      rules: [
        {
          test: /\.css$/,
          use: [isProd ? MiniCssExtractPlugin.loader : 'style-loader', 'css-loader']
        },
        {
          test: /\.(png|jpg|jpeg|gif|svg|mp3|ttf|otf|woff|woff2)$/i,
          type: 'asset/resource'
        }
      ]
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, 'index.html'),
        inject: 'body',
        minify: isProd
          ? {
              removeComments: true,
              collapseWhitespace: true,
              removeRedundantAttributes: true,
              useShortDoctype: true,
              removeEmptyAttributes: true,
              removeStyleLinkTypeAttributes: true,
              keepClosingSlash: true,
              minifyCSS: true,
              minifyJS: true,
              minifyURLs: true
            }
          : false
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, 'assets'),
            to: path.resolve(__dirname, 'dist/assets'),
            globOptions: {
              ignore: [
                '**/css/**',
                '**/js/**'
              ]
            }
          }
        ]
      }),
      ...(isProd
        ? [
            new MiniCssExtractPlugin({
              filename: 'assets/css/[name].[contenthash].css'
            })
          ]
        : [])
    ],
    optimization: {
      minimize: isProd,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            compress: {
              passes: 2,
              drop_console: true
            },
            format: {
              comments: false
            },
            mangle: true
          },
          extractComments: false
        }),
        new CssMinimizerPlugin(),
        new HtmlMinimizerPlugin()
      ]
    },
    devServer: {
      static: {
        directory: path.resolve(__dirname, 'dist')
      },
      compress: true,
      port: 5173,
      hot: true,
      open: true
    },
    resolve: {
      extensions: ['.js']
    }
  };
};
