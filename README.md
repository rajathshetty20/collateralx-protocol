# CollateralX

A lending protocol that allows users to deposit ETH as collateral and borrow stablecoins against it.

## Key Features

- Deposit ETH as collateral
- Borrow stablecoins (150% collateral ratio)
- Multiple loans per collateral
- Flexible loan repayment
- Liquidation (120% threshold)
- 10% annual interest rate

## Contracts

### CollateralX.sol
```solidity
// Main functions
depositCollateral() external payable
borrowStableCoin(uint256 amount) external
repayStableCoin(uint256 amount, uint256[] calldata indexes) external
withdrawCollateral(uint256 amount) external
getLoanStatus(address user) external view
liquidate(address user) external
```

### TestCoin.sol
- ERC20 stablecoin for testing
- Includes faucet function

## Quick Start

```javascript
// 1. Deploy
const stableCoin = await TestCoin.deploy()
const collateralX = await CollateralX.deploy(stableCoin.address)

// 2. Deposit ETH (1 ETH)
await collateralX.depositCollateral({ 
    value: parseEther("1.0") 
})

// 3. Borrow (1000 stablecoins)
const borrowAmount = parseUnits("1000", 18)
await collateralX.borrowStableCoin(borrowAmount)

// 4. Repay (requires approval first)
const repayAmount = parseUnits("1000", 18)
await stableCoin.approve(collateralX.address, repayAmount)
await collateralX.repayStableCoin(repayAmount, [0])  // repay first loan

// 5. Liquidate undercollateralized position (requires approval)
const userToLiquidate = "0x..."
const loanStatus = await collateralX.getLoanStatus(userToLiquidate)
const totalDebt = loanStatus.reduce((acc, loan) => acc + loan.principal + loan.interest, 0)
await stableCoin.approve(collateralX.address, totalDebt)
await collateralX.liquidate(userToLiquidate)
```

## Security Notes

- Maintain >150% collateral ratio
- Positions below 120% can be liquidated
- Interest accumulates over time

## License

MIT