const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("CollateralX", function () {
  let collateralX;
  let testCoin;
  let testPriceFeed;
  let owner;
  let user1;
  let user2;
  let liquidator;

  const COLLATERAL_RATIO = 150;
  const LIQUIDATION_RATIO = 120;
  const INTEREST_RATE = 10;
  const INITIAL_ETH_PRICE = 1000; // $1000 per ETH

  beforeEach(async function () {
    [owner, user1, user2, liquidator] = await ethers.getSigners();

    // Deploy TestCoin
    const TestCoin = await ethers.getContractFactory("TestCoin");
    testCoin = await TestCoin.deploy();
    await testCoin.waitForDeployment();

    // Deploy TestPriceFeed
    const TestPriceFeed = await ethers.getContractFactory("TestPriceFeed");
    testPriceFeed = await TestPriceFeed.deploy(ethers.parseUnits(INITIAL_ETH_PRICE.toString(), 8));
    await testPriceFeed.waitForDeployment();

    // Deploy CollateralX
    const CollateralX = await ethers.getContractFactory("CollateralX");
    collateralX = await CollateralX.deploy(
      await testCoin.getAddress(),
      await testPriceFeed.getAddress()
    );
    await collateralX.waitForDeployment();

    // Mint some tokens to the contract for lending
    await testCoin.faucet(await collateralX.getAddress(), ethers.parseEther("1000000"));
    
    // Mint tokens to users for repayment testing
    await testCoin.faucet(user1.address, ethers.parseEther("10000"));
    await testCoin.faucet(user2.address, ethers.parseEther("10000"));
    await testCoin.faucet(liquidator.address, ethers.parseEther("10000"));
  });

  describe("Deployment", function () {
    it("Should set the correct stablecoin and price feed addresses", async function () {
      expect(await collateralX.stableCoinAddress()).to.equal(await testCoin.getAddress());
      expect(await collateralX.priceFeedAddress()).to.equal(await testPriceFeed.getAddress());
    });

    it("Should have correct constants", async function () {
      expect(await collateralX.COLLATERAL_RATIO()).to.equal(COLLATERAL_RATIO);
      expect(await collateralX.LIQUIDATION_RATIO()).to.equal(LIQUIDATION_RATIO);
      expect(await collateralX.INTEREST_RATE()).to.equal(INTEREST_RATE);
    });
  });

  describe("Collateral Deposit", function () {
    it("Should allow users to deposit ETH as collateral", async function () {
      const depositAmount = ethers.parseEther("1");
      
      await expect(collateralX.connect(user1).depositCollateral({ value: depositAmount }))
        .to.emit(collateralX, "CollateralDeposited")
        .withArgs(user1.address, depositAmount);

      const collateralAmount = await collateralX.loanAccounts(user1.address);
      expect(collateralAmount).to.equal(depositAmount);
    });

    it("Should accumulate multiple deposits", async function () {
      const firstDeposit = ethers.parseEther("1");
      const secondDeposit = ethers.parseEther("0.5");
      
      await collateralX.connect(user1).depositCollateral({ value: firstDeposit });
      await collateralX.connect(user1).depositCollateral({ value: secondDeposit });

      const collateralAmount = await collateralX.loanAccounts(user1.address);
      expect(collateralAmount).to.equal(firstDeposit + secondDeposit);
    });

    it("Should revert if deposit amount is zero", async function () {
      await expect(collateralX.connect(user1).depositCollateral({ value: 0 }))
        .to.be.revertedWith("Deposit amount should be greater than 0");
    });
  });

  describe("Stablecoin Borrowing", function () {
    beforeEach(async function () {
      // Deposit collateral for testing
      // 2 ETH at $1000/ETH = $2000 collateral value
      // Max borrow = 2000 * 100 / 150 = $1333
      await collateralX.connect(user1).depositCollateral({ value: ethers.parseEther("2") });
    });

    it("Should allow borrowing within collateral limits", async function () {
      const borrowAmount = ethers.parseEther("1300");
      
      await expect(collateralX.connect(user1).borrowStableCoin(borrowAmount))
        .to.emit(collateralX, "StableCoinBorrowed")
        .withArgs(user1.address, borrowAmount);

      const balance = await testCoin.balanceOf(user1.address);
      expect(balance).to.be.gte(borrowAmount);
    });

    it("Should revert if borrowing exceeds collateral ratio", async function () {
      const collateralValue = ethers.parseEther("2000");

      await expect(collateralX.connect(user1).borrowStableCoin(collateralValue))
        .to.be.revertedWith("Collateral is not enough to borrow this amount");
    });

    it("Should adjust borrowing limits when ETH price changes", async function () {
      // Update price to $2000/ETH
      await testPriceFeed.updatePrice(ethers.parseUnits("2000", 8));

      const borrowAmount = ethers.parseEther("1800");
      
      await expect(collateralX.connect(user1).borrowStableCoin(borrowAmount))
        .to.emit(collateralX, "StableCoinBorrowed")
        .withArgs(user1.address, borrowAmount);

      const balance = await testCoin.balanceOf(user1.address);
      expect(balance).to.be.gte(borrowAmount);
    });

    it("Should revert if no collateral deposited", async function () {
      await expect(collateralX.connect(user2).borrowStableCoin(ethers.parseEther("100")))
        .to.be.revertedWith("No collateral deposited");
    });

    it("Should revert if borrow amount is zero", async function () {
      await expect(collateralX.connect(user1).borrowStableCoin(0))
        .to.be.revertedWith("Borrow amount should be greater than 0");
    });

    it("Should track multiple loans correctly", async function () {
      await collateralX.connect(user1).borrowStableCoin(ethers.parseEther("500"));
      await collateralX.connect(user1).borrowStableCoin(ethers.parseEther("300"));

      const loanStatus = await collateralX.getLoanStatus(user1.address);
      expect(loanStatus.length).to.equal(2);
      expect(loanStatus[0].principal).to.equal(ethers.parseEther("500"));
      expect(loanStatus[1].principal).to.equal(ethers.parseEther("300"));
    });
  });

  describe("Interest Calculation", function () {
    beforeEach(async function () {
      await collateralX.connect(user1).depositCollateral({ value: ethers.parseEther("2") });
      await collateralX.connect(user1).borrowStableCoin(ethers.parseEther("1000"));
    });

    it("Should calculate interest correctly for different time periods", async function () {
      // Check interest for 6 months
      await time.increase(182 * 24 * 60 * 60);
      let loanStatus = await collateralX.getLoanStatus(user1.address);
      let expectedInterest = ethers.parseEther("1000") * BigInt(INTEREST_RATE) / BigInt(100) / BigInt(2);
      expect(loanStatus[0].interest).to.be.closeTo(expectedInterest, ethers.parseEther("10"));

      // Check interest for full year (additional 6 months)
      await time.increase(183 * 24 * 60 * 60);
      loanStatus = await collateralX.getLoanStatus(user1.address);
      expectedInterest = ethers.parseEther("1000") * BigInt(INTEREST_RATE) / BigInt(100);
      expect(loanStatus[0].interest).to.be.closeTo(expectedInterest, ethers.parseEther("10"));
    });
  });

  describe("Loan Repayment", function () {
    const approveAmount = ethers.parseEther("10000");
    
    beforeEach(async function () {
      await collateralX.connect(user1).depositCollateral({ value: ethers.parseEther("2") });
      await collateralX.connect(user1).borrowStableCoin(ethers.parseEther("1000"));
      
      // Approve contract to spend user's tokens
      await testCoin.connect(user1).approve(await collateralX.getAddress(), approveAmount);
    });

    it("Should allow full repayment of a loan", async function () {      
      await expect(collateralX.connect(user1).repayStableCoin(approveAmount, [0]))
        .to.emit(collateralX, "StableCoinRepaid");

      const loanStatusAfter = await collateralX.getLoanStatus(user1.address);
      expect(loanStatusAfter[0].principal).to.equal(0);
    });

    it("Should repay multiple loans", async function () {
      // Add more collateral to support second loan
      await collateralX.connect(user1).depositCollateral({ value: ethers.parseEther("1") });
      await collateralX.connect(user1).borrowStableCoin(ethers.parseEther("500"));
            
      await collateralX.connect(user1).repayStableCoin(approveAmount, [0, 1]);

      const loanStatus = await collateralX.getLoanStatus(user1.address);
      expect(loanStatus[0].principal).to.equal(0);
      expect(loanStatus[1].principal).to.equal(0);
    });

    it("Should revert if repayment amount is insufficient", async function () {
      const insufficientAmount = ethers.parseEther("500");
      
      await expect(collateralX.connect(user1).repayStableCoin(insufficientAmount, [0]))
        .to.be.revertedWith("Authorized amount is not enough to repay these loans");
    });

    it("Should revert with invalid loan index", async function () {
      await expect(collateralX.connect(user1).repayStableCoin(approveAmount, [5]))
        .to.be.revertedWith("Invalid loan index");
    });

    it("Should revert if no loans specified", async function () {
      await expect(collateralX.connect(user1).repayStableCoin(ethers.parseEther("1100"), []))
        .to.be.revertedWith("Must specify at least one loan to repay");
    });
  });

  describe("Collateral Withdrawal", function () {
    beforeEach(async function () {
      await collateralX.connect(user1).depositCollateral({ value: ethers.parseEther("3") });
      await collateralX.connect(user1).borrowStableCoin(ethers.parseEther("1000"));
    });

    it("Should allow partial collateral withdrawal", async function () {
      const withdrawAmount = ethers.parseEther("0.5");
      
      await expect(collateralX.connect(user1).withdrawCollateral(withdrawAmount))
        .to.emit(collateralX, "CollateralWithdrawn")
        .withArgs(user1.address, withdrawAmount);

      const collateralAmount = await collateralX.loanAccounts(user1.address);
      expect(collateralAmount).to.equal(ethers.parseEther("2.5"));
    });

    it("Should revert if withdrawal would make position under-collateralized", async function () {
      const excessiveWithdraw = ethers.parseEther("2"); // Would leave only 1 ETH = $1000, ratio would be 100%
      
      await expect(collateralX.connect(user1).withdrawCollateral(excessiveWithdraw))
        .to.be.revertedWith("Collateral wont be enough if you withdraw this amount");
    });

    it("Should revert if withdrawal amount exceeds deposited collateral", async function () {
      const excessiveWithdraw = ethers.parseEther("5");
      
      await expect(collateralX.connect(user1).withdrawCollateral(excessiveWithdraw))
        .to.be.revertedWith("Withdraw amount should be less than or equal to the collateral amount");
    });

    it("Should revert if withdrawal amount is zero", async function () {
      await expect(collateralX.connect(user1).withdrawCollateral(0))
        .to.be.revertedWith("Withdraw amount should be greater than 0");
    });
  });

  describe("Liquidation", function () {
    const approveAmount = ethers.parseEther("10000");

    beforeEach(async function () {
      await collateralX.connect(user1).depositCollateral({ value: ethers.parseEther("2") });
      await collateralX.connect(user1).borrowStableCoin(ethers.parseEther("1330")); // Close to max borrow to enable liquidation with interest
      
      // Approve liquidator to spend tokens
      await testCoin.connect(liquidator).approve(await collateralX.getAddress(), approveAmount);
    });

    it("Should allow liquidation when position is under-collateralized", async function () {
      // Advance time to accumulate interest and make position liquidatable
      await time.increase(3 * 365 * 24 * 60 * 60);
            
      const initialLiquidatorBalance = await ethers.provider.getBalance(liquidator.address);
      
      await expect(collateralX.connect(liquidator).liquidate(user1.address))
        .to.emit(collateralX, "CollateralLiquidated");

      // Check that liquidator received the collateral
      const finalLiquidatorBalance = await ethers.provider.getBalance(liquidator.address);
      expect(finalLiquidatorBalance).to.be.gt(initialLiquidatorBalance);

      // Check that user's position is cleared
      const collateralAmount = await collateralX.loanAccounts(user1.address);
      expect(collateralAmount).to.equal(0);
    });

    it("Should revert liquidation when position is still safe", async function () {
      await expect(collateralX.connect(liquidator).liquidate(user1.address))
        .to.be.revertedWith("User cannot be liquidated as collateral is enough");
    });
  });

  describe("Edge Cases and Error Conditions", function () {
    it("Should handle getLoanStatus for user with no loans", async function () {
      const loanStatus = await collateralX.getLoanStatus(user1.address);
      expect(loanStatus.length).to.equal(0);
    });

    it("Should maintain loan state correctly after partial repayments", async function () {
      await collateralX.connect(user1).depositCollateral({ value: ethers.parseEther("3") });
      await collateralX.connect(user1).borrowStableCoin(ethers.parseEther("1000"));
      await collateralX.connect(user1).borrowStableCoin(ethers.parseEther("500"));
      
      await testCoin.connect(user1).approve(await collateralX.getAddress(), ethers.parseEther("10000"));
      
      // Repay only the first loan
      await collateralX.connect(user1).repayStableCoin(ethers.parseEther("1100"), [0]);
      
      const loanStatus = await collateralX.getLoanStatus(user1.address);
      expect(loanStatus[0].principal).to.equal(0);
      expect(loanStatus[1].principal).to.equal(ethers.parseEther("500"));
    });
  });


});
