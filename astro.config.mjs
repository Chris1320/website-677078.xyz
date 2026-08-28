import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import vue from "@astrojs/vue";
import icon from "astro-icon";
import tailwindcss from "@tailwindcss/vite";
import { transform } from "esbuild";

function minifyServerChunks() {
  return {
    name: "minify-server-chunks",
    enforce: "post",
    async generateBundle(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (
          chunk.type === "chunk" &&
          (fileName.endsWith(".mjs") || fileName.endsWith(".js"))
        ) {
          const res = await transform(chunk.code, {
            minify: true,
            target: "es2022",
          });
          chunk.code = res.code;
        }
      }
    },
  };
}

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
  integrations: [
    vue(),
    icon({
      include: {
        lucide: [
          "home",
          "arrow-left",
          "arrow-right",
          "activity",
          "book-open",
          "tags",
          "calendar",
          "newspaper",
          "clock",
          "shield-check",
          "alert-triangle",
          "alert-circle",
          "key",
          "copy",
          "search",
          "tag",
        ],
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss(), minifyServerChunks()],
    build: {
      minify: true,
    },
  },
});
