import { nodeResolve } from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
import terser from "@rollup/plugin-terser";

export default {
  input: "./src/worker.js",
  output: {
    file: "dist/worker.js",
    format: "es",
    sourcemap: true,
  },
  plugins: [
    nodeResolve({
      preferBuiltins: true,
      browser: true,
      extensions: [".js", ".json"],
    }),
    json(),
    terser(),
  ],
  external: ["@cloudflare/workers-types"],
};
