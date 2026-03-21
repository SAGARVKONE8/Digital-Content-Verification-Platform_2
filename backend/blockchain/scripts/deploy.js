import { network } from "hardhat";

async function main() {
  console.log("Deploying GenesisRegistry contract...");

  const { ethers } = await network.connect();
  const GenesisRegistryFactory = await ethers.getContractFactory("GenesisRegistry");
  const genesisRegistry = await GenesisRegistryFactory.deploy();
  await genesisRegistry.waitForDeployment();

  const contractAddress = await genesisRegistry.getAddress();

  console.log("-----------------------------------------");
  console.log("Contract deployed to:", contractAddress);
  console.log("-----------------------------------------");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
