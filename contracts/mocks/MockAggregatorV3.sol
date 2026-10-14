// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract MockAggregatorV3 is AggregatorV3Interface {
    uint8 public override decimals;
    string public override description = "Mock Aggregator";
    uint256 public override version = 1;

    uint80 public roundId;
    int256 public answer;
    uint256 public startedAt;
    uint256 public updatedAt;
    uint80 public answeredInRound;

    constructor(uint8 _decimals, int256 _initialAnswer) {
        decimals = _decimals;
        answer = _initialAnswer;
        roundId = 1;
        answeredInRound = 1;
        updatedAt = block.timestamp;
        startedAt = block.timestamp;
    }

    function setRoundData(
        uint80 _roundId,
        int256 _answer,
        uint256 _updatedAt,
        uint80 _answeredInRound
    ) external {
        roundId = _roundId;
        answer = _answer;
        updatedAt = _updatedAt;
        answeredInRound = _answeredInRound;
    }

    function getRoundData(uint80 _roundId) external view override returns (
        uint80, int256, uint256, uint256, uint80
    ) {
        return (_roundId, answer, startedAt, updatedAt, answeredInRound);
    }

    function latestRoundData() external view override returns (
        uint80, int256, uint256, uint256, uint80
    ) {
        return (roundId, answer, startedAt, updatedAt, answeredInRound);
    }
}
