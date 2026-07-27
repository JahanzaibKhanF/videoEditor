import path from "node:path";

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

    // @imgly/background-removal dynamically imports either
    // "onnxruntime-web" or "onnxruntime-web/webgpu" depending on the
    // `device` option — but webpack still has to bundle (and, on Chrome,
    // evaluate the module factory of) BOTH branches regardless of which one
    // actually runs, since it can't know at build time which branch wins.
    // The webgpu bundle (dist/ort.webgpu.bundle.min.mjs) spawns its own
    // Worker via a `new URL(..., import.meta.url)` pattern that webpack
    // mishandles in this project's config, throwing "url.replace is not a
    // function" the moment that module is evaluated — even when `device:
    // "cpu"` means it's never actually used. Redirecting BOTH entry points
    // to onnxruntime-web's plain single-file CPU/WASM build (a boring
    // CommonJS .js file — no ESM, no WebGPU, no internal Worker spawning)
    // removes the crashing file from the bundle entirely rather than hoping
    // runtime config prevents it from being touched.
    const cpuOnlyBuild = path.resolve(process.cwd(), "node_modules/onnxruntime-web/dist/ort.wasm.min.js");
    config.resolve.alias["onnxruntime-web/webgpu"] = cpuOnlyBuild;
    config.resolve.alias["onnxruntime-web$"] = cpuOnlyBuild;

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
