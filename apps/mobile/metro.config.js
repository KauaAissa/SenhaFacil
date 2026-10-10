const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.cacheVersion = 'senha-facil-protection-v2-cooperative-kdf';

module.exports = config;