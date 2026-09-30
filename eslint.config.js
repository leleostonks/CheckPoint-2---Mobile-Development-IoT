// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Requisito do trabalho: é proibido utilizar `any`.
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
]);
