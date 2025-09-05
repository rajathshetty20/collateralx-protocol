# CollateralX

A lending protocol that allows users to deposit ETH as collateral and borrow stablecoins against it.

## Key Features

- Deposit ETH as collateral
- Borrow stablecoins (150% collateral ratio)
- Multiple loans per collateral
- Flexible loan repayment
- Liquidation (120% threshold)
- 10% annual interest rate
- Real-time ETH/USD price feeds via Chainlink

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

### TestPriceFeed.sol
- Implements AggregatorV3Interface for ETH/USD price feed
- Allows price updates for testing scenarios

## Contract Interactions

```javascript
// 1. Deploy contracts
const stableCoin = await TestCoin.deploy()
const testPriceFeed = await TestPriceFeed.deploy(ethers.parseUnits("1000", 8)) // $1000/ETH
const collateralX = await CollateralX.deploy(stableCoin.address, testPriceFeed.address)

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

## Setup

```bash
npm install          # Install dependencies
npm test             # Run tests
```

## Deployment

### Environment Setup
Create a `.env` file in the root directory:
```
PRIVATE_KEY=your_deployer_account_private_key
SEPOLIA_RPC_URL=your_sepolia_rpc_url
ETHERSCAN_API_KEY=your_etherscan_api_key
CHAINLINK_ETH_USD_FEED=0x694AA1769357215DE4FAC081bf1f309aDC325306
```

### Local Deployment
```bash
# Terminal 1
npm run compile
npm run node

# Terminal 2
npm run deploy:localhost
```

The local network:
- RPC URL: `http://127.0.0.1:8545`
- Chain ID: 31337
- Pre-funded accounts with 10,000 ETH each

The deployment script will:
- Deploy TestCoin contract
- Deploy TestPriceFeed contract
- Deploy CollateralX contract
- Fund CollateralX with 1,000,000 TestCoins for lending
- Display contract addresses

### Sepolia Deployment
```bash
npm run compile
npm run deploy:sepolia
```

## Security Notes

- Maintain >150% collateral ratio
- Positions below 120% can be liquidated
- Interest accumulates over time
- Uses Chainlink's trusted price feeds for accurate ETH valuation

## License

MIT