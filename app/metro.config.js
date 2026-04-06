const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  // Expo demo kód
  /.*[/\\]app-example[/\\].*/,
];

config.maxWorkers = 2;

module.exports = config;
