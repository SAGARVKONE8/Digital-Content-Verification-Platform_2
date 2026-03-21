import hre from "hardhat"; // <-- 1. This is the correct import

async function main() {
  console.log("Deploying GenesisRegistry contract...");

  // 2. Get 'ethers' from the 'hre' object
  const { ethers } = hre;

  // 3. This line will now work
  const GenesisRegistryFactory = await ethers.getContractFactory("GenesisRegistry");

  // Start the deployment
  const genesisRegistry = await GenesisRegistryFactory.deploy();

  // Wait for the deployment transaction to be mined and confirmed
  await genesisRegistry.waitForDeployment();

  // Get the address the contract was deployed to
  const contractAddress = await genesisRegistry.getAddress();

  console.log("-----------------------------------------");
  console.log("GenesisRegistry deployed to:", contractAddress);
  console.log("-----------------------------------------");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});