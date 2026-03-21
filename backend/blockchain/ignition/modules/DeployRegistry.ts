import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// This is an "Ignition Module," the new way to deploy.
// It defines *what* to deploy.
const GenesisRegistryModule = buildModule("GenesisRegistryModule", (m) => {
  // This line tells Ignition to deploy our "GenesisRegistry" contract
  const registry = m.contract("GenesisRegistry");

  // We return the deployed contract
  return { registry };
});

export default GenesisRegistryModule;