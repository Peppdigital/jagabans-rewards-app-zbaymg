
// Hermes static compiler (hermesc) cannot compile import(variable) — only import('literal').
// This plugin replaces variable-based dynamic imports that carry bundler-ignore comments
// (webpackIgnore / turbopackIgnore / @vite-ignore) with Promise.resolve(null), which is
// the correct runtime behaviour since those packages are optional / never installed in RN.
function hermesCompatDynamicImport({ types: t }) {
  return {
    name: "hermes-compat-dynamic-import",
    visitor: {
      CallExpression(path) {
        if (
          path.node.callee.type === "Import" &&
          path.node.arguments.length > 0 &&
          !t.isStringLiteral(path.node.arguments[0])
        ) {
          const arg = path.node.arguments[0];
          const comments = [
            ...(arg.leadingComments || []),
            ...(arg.innerComments || []),
          ];
          const hasBundlerIgnore = comments.some(
            (c) =>
              c.value.includes("webpackIgnore") ||
              c.value.includes("turbopackIgnore") ||
              c.value.includes("vite-ignore")
          );
          if (hasBundlerIgnore) {
            path.replaceWith(
              t.callExpression(
                t.memberExpression(
                  t.identifier("Promise"),
                  t.identifier("resolve")
                ),
                [t.nullLiteral()]
              )
            );
          }
        }
      },
    },
  };
}

module.exports = function (api) {
  api.cache(true);

  const EDITABLE_COMPONENTS =
    process.env.EXPO_PUBLIC_ENABLE_EDIT_MODE === "TRUE" &&
    process.env.NODE_ENV === "development"
      ? [
          ["./babel-plugins/editable-elements.js", {}],
          ["./babel-plugins/inject-source-location.js", {}],
        ]
      : [];

  return {
    presets: ["babel-preset-expo"],
    plugins: [
      hermesCompatDynamicImport,
      [
        "module-resolver",
        {
          root: ["./"],
          extensions: [
            ".ios.tsx",
            ".android.tsx",
            ".native.tsx",
            ".web.tsx",
            ".ios.ts",
            ".android.ts",
            ".native.ts",
            ".web.ts",
            ".tsx",
            ".ts",
            ".ios.jsx",
            ".android.jsx",
            ".native.jsx",
            ".web.jsx",
            ".jsx",
            ".ios.js",
            ".android.js",
            ".native.js",
            ".web.js",
            ".js",
            ".mjs",
            ".cjs",
            ".json",
          ],
          alias: {
            "@": "./",
            "@components": "./components",
            "@style": "./style",
            "@hooks": "./hooks",
            "@types": "./types",
            "@contexts": "./contexts",
            "@services": "./services",
            "@utils": "./utils",
            "@data": "./data",
            "@app": "./app",
          },
        },
      ],
      ...EDITABLE_COMPONENTS,
      "@babel/plugin-proposal-export-namespace-from",
      "react-native-worklets/plugin", // react-native-worklets/plugin must be listed last!
    ],
  };
};
