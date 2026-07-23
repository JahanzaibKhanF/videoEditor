/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false };

    // @imgly/background-removal pulls in onnxruntime-web, which ships large
    // pre-bundled .mjs files (its WASM/WebGPU worker bundles) built for
    // direct browser use, not for a bundler to re-parse. Webpack's default
    // strict-ESM parser for .mjs can misfire on these ("'import.meta'
    // cannot be used outside of module code" / "'import', 'export' cannot
    // be used outside of module code") — forcing `javascript/auto` for
    // .mjs under node_modules is the standard fix (lets webpack fall back
    // to its more permissive auto-detection instead of strict ESM-only
    // parsing for these specific files).
    config.module.rules.push({
      test: /\.mjs$/,
      include: /node_modules/,
      type: "javascript/auto",
    });
    // onnxruntime-web also conditionally references its Node.js-only
    // backend, which doesn't exist (and isn't needed) in the browser bundle.
    config.resolve.alias = { ...config.resolve.alias, "onnxruntime-node": false };

    return config;
  },
  async headers() {
    return [
      {
        // Required so FFmpeg WASM (SharedArrayBuffer) works cross-origin
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
