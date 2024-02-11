import type { BuildResult } from "esbuild";
    import { build } from "esbuild";
    import { resolve } from "path";
    import { fileURLToPath } from "url";
    import {
    	defaultLoaderWithEsbuild,
    	getLoader,
    } from "../../../utils/esbuild.js";

	import { cp } from "fs/promises";


    import { load as regionLoader } from "../../../utils/loader/region.js";

    const MODULE_ROOT = resolve(fileURLToPath(import.meta.url), "../../src");

async function buildGlobalWorker() {
	await build({
		entryPoints: ["./global-worker/index.tsx"],
		format: "esm",
		platform: "neutral",
		mainFields: ["workerd", "module", "main", "browser"],
		conditions: [
			"workerd", // The Cloudflare Workers runtime is called 'workerd'
			"browser",
		],
		bundle: true,
		outdir: "./dist-global/_worker.js",
		define: {
			"process.env.NODE_ENV": JSON.stringify("development"),
		},
	});
}

async function buildClientSideRenderedReactApp() {
	await build({
		entryPoints: ["./src/index.tsx"],
		bundle: true,
		outdir: "./dist-global",
	});
}

async function copyStaticAssets() {
	await cp("./public", "./dist-global", { recursive: true });
}

async function buildRegionWorker() {
	await build({
		entryPoints: ["./region-worker/index.tsx"],
		format: "esm",
		platform: "neutral",
		conditions: [
			"workerd", // The Cloudflare Workers runtime is called 'workerd'
			"react-server",
		],
		bundle: true,
		outdir: "./dist-region",
		external: ["node:*"],
		define: {
			"process.env.NODE_ENV": JSON.stringify("development"),
		},
		plugins: [
			{
				name: "react-server-dom-esm-loader-region",
				async setup(build) {
					build.onLoad({ filter: /^.*$/ }, async (args) => {
						const buildResult = await build.esbuild.build({
							entryPoints: [args.path],
							write: false,
							metafile: true,
						});

						if (buildResult.errors.length > 0) {
							return {
								errors: buildResult.errors,
								warnings: buildResult.warnings,
							};
						}

						const watchFiles: string[] = [];
						const errors: BuildResult["errors"] = [];
						const warnings = buildResult.warnings;

						const regionLoaded = await regionLoader(
							args.path,
							{},
							defaultLoaderWithEsbuild({
								build,
								watchFiles,
								errors,
								warnings,
							}),
						);

						const loader = getLoader(args.path);

						if (typeof regionLoaded.source === "string") {
							regionLoaded.source = regionLoaded.source.replace(
								MODULE_ROOT,
								"/src",
							);
						}

						return {
							contents: regionLoaded.source,
							loader,
							errors,
							warnings,
							watchFiles,
						};
					});
				},
			},
		],
	});
}

await copyStaticAssets();
await buildClientSideRenderedReactApp();
await buildGlobalWorker();
await buildRegionWorker();
