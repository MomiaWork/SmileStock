const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite 的 web 版本透過 wa-sqlite (wasm) 執行，需要讓 Metro 認得 .wasm 資源
// https://docs.expo.dev/versions/latest/sdk/sqlite/#web-setup
config.resolver.assetExts.push('wasm');

// wa-sqlite 用 SharedArrayBuffer 溝通 worker，瀏覽器要求頁面是
// cross-origin isolated 才能使用，開發伺服器需附上這兩個 header
const originalEnhanceMiddleware = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, metroServer) => {
  const withCoiHeaders = (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
  };
  const next = originalEnhanceMiddleware
    ? originalEnhanceMiddleware(middleware, metroServer)
    : middleware;
  return (req, res, nextFn) => withCoiHeaders(req, res, () => next(req, res, nextFn));
};

module.exports = config;
