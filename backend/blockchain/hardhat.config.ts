import { HardhatUserConfig } from "hardhat/config";
import "dotenv/config";

// 1. Import the plugin we installed
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

const ALCHEMY_AMOY_URL = process.env.ALCHEMY_AMOY_URL || "";
const rawPrivateKey = (process.env.PRIVATE_KEY || "").trim();
const PRIVATE_KEY = rawPrivateKey
  ? (rawPrivateKey.startsWith("0x") ? rawPrivateKey : `0x${rawPrivateKey}`)
  : "";
const WALLET_MNEMONIC = process.env.WALLET_MNEMONIC || "";
const hasAmoyUrl = Boolean(ALCHEMY_AMOY_URL.trim());
const hasPrivateKey = Boolean(PRIVATE_KEY.trim());
const hasWalletMnemonic = Boolean(WALLET_MNEMONIC.trim());
const hasWalletConfig = hasPrivateKey || hasWalletMnemonic;
const hasCompleteAmoyConfig = hasAmoyUrl && hasWalletConfig;

if (hasAmoyUrl && !hasWalletConfig) {
  console.warn(
    "Set PRIVATE_KEY (recommended) or WALLET_MNEMONIC to enable Amoy deployment."
  );
}
if (!hasAmoyUrl && hasWalletConfig) {
  console.warn(
    "ALCHEMY_AMOY_URL is not set. Add it to enable Amoy deployment."
  );
}
if (hasPrivateKey && hasWalletMnemonic) {
  console.warn("Both PRIVATE_KEY and WALLET_MNEMONIC are set. PRIVATE_KEY will be used.");
}

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    ...(hasCompleteAmoyConfig && {
      amoy: {
        type: "http",
        url: ALCHEMY_AMOY_URL,
        accounts: hasPrivateKey
          ? [PRIVATE_KEY]
          : {
              mnemonic: WALLET_MNEMONIC,
              path: "m/44'/60'/0'/0",
              initialIndex: 0,
              count: 1,
            },
      },
    }),
  },
  // 2. Add the imported plugin to the plugins array.
  // This is the step that was missing.
  plugins: [hardhatToolboxMochaEthers],
};

export default config;
