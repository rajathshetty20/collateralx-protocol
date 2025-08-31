// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestCoin is ERC20 {
  constructor() ERC20("TestCoin", "TC") {
    _mint(msg.sender,  1_000_000 * 10 ** decimals());
  }

  function faucet(address to, uint256 amount) external {
    _mint(to, amount);
  }
}