const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying CollateralX contracts...");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // Deploy TestCoin
  console.log("\n1. Deploying TestCoin...");
  const TestCoin = await ethers.getContractFactory("TestCoin");
  const testCoin = await TestCoin.deploy();
  await testCoin.waitForDeployment();
  console.log("TestCoin deployed to:", await testCoin.getAddress());

  // Deploy TestPriceFeed for ETH/USD price feed
  console.log("\n2. Deploying TestPriceFeed...");
  const TestPriceFeed = await ethers.getContractFactory("TestPriceFeed");
  const initialPrice = ethers.parseUnits("1000", 8);
  const testPriceFeed = await TestPriceFeed.deploy(initialPrice);
  await testPriceFeed.waitForDeployment();
  console.log("TestPriceFeed deployed to:", await testPriceFeed.getAddress());

  // Deploy CollateralX
  console.log("\n3. Deploying CollateralX...");
  const CollateralX = await ethers.getContractFactory("CollateralX");
  const collateralX = await CollateralX.deploy(
    await testCoin.getAddress(),
    await testPriceFeed.getAddress()
  );
  await collateralX.waitForDeployment();
  console.log("CollateralX deployed to:", await collateralX.getAddress());

  // Faucet tokens to CollateralX for lending operations
  console.log("\n4. Funding CollateralX with tokens...");
  const faucetAmount = ethers.parseEther("1000000");
  await testCoin.faucet(await collateralX.getAddress(), faucetAmount);
  console.log("Fauceted 1,000,000 TestCoins to CollateralX");

  console.log("\n✅ Deployment completed!");
  console.log("=".repeat(50));
  console.log("TestCoin address:       ", await testCoin.getAddress());
  console.log("TestPriceFeed address:  ", await testPriceFeed.getAddress());
  console.log("CollateralX address:    ", await collateralX.getAddress());
  console.log("=".repeat(50));
}

main();
