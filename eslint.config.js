import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: ["dist/**", "node_modules/**"]
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            globals: globals.browser,
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/no-unused-vars": ["warn", { args: "none" }],

            "arrow-body-style": ["error", "as-needed"],
            "block-scoped-var": "error",
            "brace-style": ["error", "1tbs"],
            "curly": "error",
            "default-case-last": "error",
            "eol-last": ["error", "always"],
            "eqeqeq": "error",
            "indent": ["error", 4, { SwitchCase: 1 }],
            "keyword-spacing": "error",
            "no-labels": "error",
            "no-multi-assign": "error",
            "no-multi-spaces": ["error", { ignoreEOLComments: true }],
            "no-multi-str": "error",
            "no-new": "error",
            "no-new-wrappers": "error",
            "no-self-compare": "error",
            "no-sequences": "error",
            "no-trailing-spaces": ["error", { ignoreComments: true }],
            "no-unneeded-ternary": ["error", { defaultAssignment: false }],
            "no-whitespace-before-property": "error",
            "operator-linebreak": ["error", "after", { overrides: { "?": "before", ":": "before" } }],
            "quotes": ["error", "double"],
            "semi": ["error", "always"]
        }
    },
    {
        files: ["*.js"],
        languageOptions: {
            globals: globals.node
        }
    }
);
