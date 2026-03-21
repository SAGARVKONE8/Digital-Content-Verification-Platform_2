import { HardhatUserConfig } from "hardhat/config";
import "dotenv/config";

// 1. Import the plugin we installed
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

const ALCHEMY_AMOY_URL = process.env.ALCHEMY_AMOY_URL || "";
const WALLET_MNEMONIC = process.env.WALLET_MNEMONIC || "";
const hasAmoyUrl = Boolean(ALCHEMY_AMOY_URL.trim());
const hasWalletMnemonic = Boolean(WALLET_MNEMONIC.trim());
const hasCompleteAmoyConfig = hasAmoyUrl && hasWalletMnemonic;

if (hasAmoyUrl && !hasWalletMnemonic) {
  console.warn(
    "WALLET_MNEMONIC is not set. Add it to enable Amoy deployment."
  );
}
if (!hasAmoyUrl && hasWalletMnemonic) {
  console.warn(
    "ALCHEMY_AMOY_URL is not set. Add it to enable Amoy deployment."
  );
}

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    ...(hasCompleteAmoyConfig && {
      amoy: {
        type: "http",
        url: ALCHEMY_AMOY_URL,
        accounts: {
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
