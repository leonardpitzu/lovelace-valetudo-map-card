import typescript from "rollup-plugin-typescript2";
import commonjs from "rollup-plugin-commonjs";
import nodeResolve from "rollup-plugin-node-resolve";
import babel from "rollup-plugin-babel";
import { terser } from "rollup-plugin-terser";
import json from "@rollup/plugin-json";
import { execSync } from "child_process";

// Build identifier (UTC timestamp + parent git SHA) injected into the console
// banner so the exact loaded build is identifiable at a glance — a newer stamp
// after a HACS update proves the fresh build actually loaded (defeats stale cache).
const buildId = (() => {
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    let sha = "";
    try {
        sha = " " + execSync("git rev-parse --short HEAD").toString().trim();
    } catch (e) {
        sha = "";
    }
    return `${stamp}Z${sha}`;
})();

const injectBuildSha = {
    name: "inject-build-id",
    transform(code) {
        if (code.includes("__BUILD_SHA__")) {
            return { code: code.replace(/__BUILD_SHA__/g, buildId), map: null };
        }
        return null;
    },
};

const plugins = [
    injectBuildSha,
    nodeResolve({}),
    commonjs(),
    typescript(),
    json(),
    babel({
        exclude: "node_modules/**",
        plugins: [
            ["inline-json-import", {}]
        ]
    }),
    terser(),
];

export default [
    {
        input: "src/valetudo-map-card.ts",
        output: {
            dir: "dist",
            format: "es",
        },
        plugins: [...plugins],
    },
];
