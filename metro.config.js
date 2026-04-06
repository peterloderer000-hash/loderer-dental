const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Na Windows musia byť cesty v blockList s escaped backslashmi
// alebo použijeme forward slashes cez regex alternativu
config.resolver.blockList = [
  // Starý app/node_modules - duplikát, Metro ho nesmie skenovať
  /.*[/\\]app[/\\]node_modules[/\\].*/,
  // Príkladový kód - nie je súčasťou appky
  /.*[/\\]app[/\\]app-example[/\\].*/,
  // Starý vnorený app/app/ priečinok - routes sú priamo v app/
  /.*[/\\]app[/\\]app[/\\].*/,
  // ESLint config súbory nesmú byť bundlované (používajú Node.js path/fs)
  /.*eslint\.config\.js$/,
  /.*[/\\]eslint-config-expo[/\\].*/,
  /.*[/\\]eslint-plugin-.*/,
];

// Obmedzíme paralelné spracovanie kvôli Windows EMFILE limitu
config.maxWorkers = 2;

module.exports = config;
