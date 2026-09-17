import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { webpack }) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, buffer: "buffer" };

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
    //
    // Scoped to @imgly/background-removal specifically (via
    // NormalModuleReplacementPlugin checking the importing file's own
    // path), NOT a blanket alias on the bare "onnxruntime-web" specifier —
    // @huggingface/transformers (captionWorker.ts's Whisper pipeline) ships
    // its OWN, newer onnxruntime-web nested in its own node_modules, built
    // specifically to match that version. A blanket alias silently forced
    // Whisper onto imgly's older CPU-only build instead, which fails
    // entirely at inference time ("no available backend found ... Failed to
    // fetch dynamically imported module") since its WASM/worker glue
    // doesn't line up with the newer version transformers.js expects.
    const cpuOnlyBuild = path.resolve(process.cwd(), "node_modules/onnxruntime-web/dist/ort.wasm.min.js");
    // @huggingface/transformers ships its OWN separately-versioned
    // onnxruntime-web nested in its own node_modules — same "plain
    // single-file build" fix, applied to ITS copy specifically (imgly's
    // cpuOnlyBuild above is a different, incompatible version).
    const transformersCpuOnlyBuild = path.resolve(
      process.cwd(),
      "node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist/ort.wasm.min.js",
    );
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^onnxruntime-web(\/webgpu)?$/, (resource) => {
        if (resource.context && resource.context.includes("@imgly")) {
          resource.request = cpuOnlyBuild;
        } else if (resource.context && resource.context.includes("@huggingface")) {
          resource.request = transformersCpuOnlyBuild;
        }
      }),
    );

    // The "ebml" package (a transitive dep of ts-ebml, used to patch WebM
    // duration metadata after background removal — see backgroundRemoval.ts)
    // ships a "browser" field in its package.json pointing at
    // lib/ebml.iife.js. That file is a self-executing IIFE bundle meant to
    // be dropped in with a <script> tag (it assigns to a `var EBML`, not
    // `module.exports`) — it was never meant to be `require()`d by a
    // bundler. Webpack's default browser-field resolution picks it anyway,
    // so `require("ebml")` resolves to a module whose exports object is
    // empty. ts-ebml's tools.js does
    // `const { tools: _tools } = require("ebml"); exports.readVint =
    // _tools.readVint;` at import time, so `_tools` is undefined and this
    // throws `Cannot read properties of undefined (reading 'readVint')`
    // immediately when the chunk containing backgroundRemoval.ts loads —
    // not when background removal actually runs — which is why it shows up
    // as an immediate client-side crash. Forcing resolution to the real
    // CommonJS build (lib/ebml.js, which correctly sets `exports.tools`)
    // fixes it.
    config.resolve.alias["ebml$"] = path.resolve(process.cwd(), "node_modules/ebml/lib/ebml.js");

    // @huggingface/transformers (captionWorker.ts's Whisper pipeline) ships
    // separate node/browser builds selected via package.json `exports`
    // conditions — but webpack's worker sub-compilation (for `new
    // Worker(new URL(...))`, see captionWorker.ts) resolves it against the
    // Node.js build instead of the browser one, which then fails outright
    // (`Module not found: ort-wasm-simd-threaded.asyncify.wasm`, a file that
    // only exists for the Node build). Aliasing straight to the browser
    // bundle sidesteps whatever condition webpack's worker resolution is
    // actually using.
    config.resolve.alias["@huggingface/transformers$"] = path.resolve(
      process.cwd(),
      "node_modules/@huggingface/transformers/dist/transformers.web.js",
    );

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
