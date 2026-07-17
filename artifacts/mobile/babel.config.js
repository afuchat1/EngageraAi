module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    // react-native-reanimated/plugin MUST be last. Without it, worklet
    // functions are not transformed at build time and any animated component
    // (ChatBubble, ImageGenIndicator, Sidebar, TypingDots) will crash in a
    // production APK/AAB build.
    plugins: ['react-native-reanimated/plugin'],
  };
};
