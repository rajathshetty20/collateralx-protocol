// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";

contract CollateralX {

  uint256 public constant COLLATERAL_RATIO = 150;
  uint256 public constant LIQUIDATION_RATIO = 120;
  uint256 public constant INTEREST_RATE = 10;

  address public stableCoinAddress;
  IERC20 public stableCoinInterface;

  constructor(address _stableCoinAddress) {
    stableCoinAddress = _stableCoinAddress;
    stableCoinInterface = IERC20(_stableCoinAddress);
  }

  mapping(address => LoanAccount) public loanAccounts;
  struct LoanAccount {
    uint256 collateralAmount;
    Loan[] loans;
  }  
  struct Loan {
    uint256 principal;
    uint256 timestamp;
  }

  function depositCollateral() external payable {
    uint amount = msg.value;
    require(amount > 0, "Deposit amount should be greater than 0");
    loanAccounts[msg.sender].collateralAmount += amount;

    emit CollateralDeposited(msg.sender, amount);
  }

  function borrowStableCoin(uint256 amount) external {
    LoanAccount storage loanAccount = loanAccounts[msg.sender];

    require(loanAccount.collateralAmount > 0, "No collateral deposited");
    require(amount > 0, "Borrow amount should be greater than 0");

    (uint256 existingPrincipal, uint256 interestOnExistingLoans) = processLoanData(loanAccount.loans);
    uint256 proposedBorrowAmount = amount + existingPrincipal + interestOnExistingLoans;
    uint256 collateralValue = calculateValueOfCollateral(loanAccount.collateralAmount);
    require(collateralValue >= proposedBorrowAmount * COLLATERAL_RATIO / 100, "Collateral is not enough to borrow this amount");
    
    require(stableCoinInterface.transfer(msg.sender, amount), "Transfer failed");
    loanAccount.loans.push(Loan({
      principal: amount,
      timestamp: block.timestamp
    }));

    emit StableCoinBorrowed(msg.sender, amount);
  }

  function repayStableCoin(uint256 amount, uint256[] calldata indexes) external {
    require(amount > 0, "Authorized amount should be greater than 0");
    require(indexes.length > 0, "Must specify at least one loan to repay");
    
    LoanAccount storage loanAccount = loanAccounts[msg.sender];
    
    Loan[] memory loans = new Loan[](indexes.length);
    for(uint256 i = 0; i < indexes.length; i++) {
      require(indexes[i] < loanAccount.loans.length, "Invalid loan index");
      loans[i] = loanAccount.loans[indexes[i]];
    }

    (uint256 principal, uint256 interest) = processLoanData(loans);
    require(amount >= principal + interest, "Authorized amount is not enough to repay these loans");
    require(stableCoinInterface.transferFrom(msg.sender, address(this), principal + interest), "Transfer failed");

    for(uint256 i = 0; i < indexes.length; i++) {
      loanAccount.loans[indexes[i]] = Loan({
        principal: 0,
        timestamp: 0
      });
    }

    emit StableCoinRepaid(msg.sender, principal + interest);
  }

  function withdrawCollateral(uint256 amount) external {
    LoanAccount storage loanAccount = loanAccounts[msg.sender];
    require(amount > 0, "Withdraw amount should be greater than 0");
    require(amount <= loanAccount.collateralAmount, "Withdraw amount should be less than or equal to the collateral amount");

    uint256 proposedCollateralAmount = loanAccount.collateralAmount - amount;
    uint256 proposedCollateralValue = calculateValueOfCollateral(proposedCollateralAmount);
    (uint256 existingPrincipal, uint256 interestOnExistingLoans) = processLoanData(loanAccount.loans);
    uint256 borrowedAmount = existingPrincipal + interestOnExistingLoans;
    require(proposedCollateralValue >= borrowedAmount * COLLATERAL_RATIO / 100, "Collateral wont be enough if you withdraw this amount");
    
    payable(msg.sender).transfer(amount);
    loanAccount.collateralAmount -= amount;

    emit CollateralWithdrawn(msg.sender, amount);
  }

  function liquidate(address user) external {
    LoanAccount storage loanAccount = loanAccounts[user];

    (uint256 existingPrincipal, uint256 interestOnExistingLoans) = processLoanData(loanAccount.loans);
    uint256 borrowedAmount = existingPrincipal + interestOnExistingLoans;
    uint256 collateralValue = calculateValueOfCollateral(loanAccount.collateralAmount);
    require(collateralValue < borrowedAmount * LIQUIDATION_RATIO / 100, "User cannot be liquidated as collateral is enough");

    require(stableCoinInterface.transferFrom(msg.sender, address(this), borrowedAmount), "Transfer failed");
    uint256 collateralToTransfer = loanAccount.collateralAmount;
    payable(msg.sender).transfer(collateralToTransfer);
    loanAccount.collateralAmount = 0;
    delete loanAccount.loans;

    emit CollateralLiquidated(user, collateralToTransfer);
  }

  function processLoanData(Loan[] memory loans) internal view returns (uint256, uint256) {
    uint256 totalPrincipal = 0;
    uint256 totalInterest = 0;
    for(uint256 i = 0; i < loans.length; i++) {
      totalPrincipal += loans[i].principal;
      totalInterest += loans[i].principal * INTEREST_RATE / 100 * (block.timestamp - loans[i].timestamp) / 365 days;
    }
    return (totalPrincipal, totalInterest);
  }

  struct LoanStatus {
    uint256 principal;
    uint256 interest;
  }
  function getLoanStatus(address user) external view returns(LoanStatus[] memory){
    LoanAccount storage loanAccount = loanAccounts[user];
    LoanStatus[] memory loanStatuses = new LoanStatus[](loanAccount.loans.length);
    for(uint256 i = 0; i < loanAccount.loans.length; i++) {
      loanStatuses[i] = LoanStatus({
        principal: loanAccount.loans[i].principal,
        interest: loanAccount.loans[i].principal * INTEREST_RATE / 100 * (block.timestamp - loanAccount.loans[i].timestamp) / 365 days
      });
    }
    return loanStatuses;
  }

  function calculateValueOfCollateral(uint256 collateralAmount) internal pure returns (uint256) {
    return collateralAmount * 1000; //asuming a fixed eth to usd price of 1000
  }

  event CollateralDeposited(address user, uint256 amount);
  event StableCoinBorrowed(address user, uint256 amount);
  event StableCoinRepaid(address user, uint256 amount);
  event CollateralWithdrawn(address user, uint256 amount);
  event CollateralLiquidated(address user, uint256 amount);
}