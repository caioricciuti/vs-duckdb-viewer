const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

/** @type {import('esbuild').BuildOptions} */
const extensionBuild = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode", "@duckdb/node-api"],
  sourcemap: !production,
  minify: production,
};

/** @type {import('esbuild').BuildOptions} */
const webviewBuild = {
  entryPoints: ["src/webview/main.ts"],
  bundle: true,
  outfile: "dist/webview.js",
  platform: "browser",
  format: "iife",
  target: "es2022",
  sourcemap: !production,
  minify: production,
};

async function main() {
  if (watch) {
    const [extCtx, webCtx] = await Promise.all([
      esbuild.context(extensionBuild),
      esbuild.context(webviewBuild),
    ]);
    await Promise.all([extCtx.watch(), webCtx.watch()]);
    console.log("Watching for changes...");
  } else {
    await Promise.all([
      esbuild.build(extensionBuild),
      esbuild.build(webviewBuild),
    ]);
    console.log("Build complete.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
