"use strict";

const candidates = [
  platformPackageName(process.platform, process.arch),
  "./index.node",
].filter(Boolean);

for (const candidate of candidates) {
  try {
    module.exports = require(candidate);
    return;
  } catch (error) {
    if (candidate === "./index.node") {
      throw error;
    }
  }
}

function platformPackageName(platform, arch) {
  if (platform === "linux" && arch === "x64") {
    return "@modular-react/app-router-native-linux-x64-gnu";
  }

  if (platform === "darwin" && arch === "arm64") {
    return "@modular-react/app-router-native-darwin-arm64";
  }

  if (platform === "win32" && arch === "x64") {
    return "@modular-react/app-router-native-win32-x64-msvc";
  }

  return undefined;
}
