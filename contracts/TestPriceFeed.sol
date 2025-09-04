// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract TestPriceFeed is AggregatorV3Interface {
    uint8 public constant decimals = 8;
    string public constant description = "ETH / USD";
    uint256 public constant version = 4;

    int256 public price;
    uint256 public timestamp;
    uint256 public startedAt;
    uint256 public updatedAt;
    uint80 public answeredInRound;

    constructor(int256 _initialPrice) {
        price = _initialPrice;
        timestamp = block.timestamp;
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
        answeredInRound = 1;
    }

    function getRoundData(uint80 _roundId) external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt_,
        uint256 updatedAt_,
        uint80 answeredInRound_
    )
    {
        return (_roundId, price, startedAt, updatedAt, answeredInRound);
    }

    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt_,
        uint256 updatedAt_,
        uint80 answeredInRound_
    )
    {
        return (answeredInRound, price, startedAt, updatedAt, answeredInRound);
    }

    function updatePrice(int256 _price) external {
        price = _price;
        timestamp = block.timestamp;
        updatedAt = block.timestamp;
        answeredInRound++;
    }
}
