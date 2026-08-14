// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPriceOracle {
    /**
     * @dev Returns the price of a token from a registered market.
     * @param market The address of the registered Uniswap Pool or Chainlink Aggregator.
     * @return price The price scaled to 1e18.
     */
    function getPrice(address market) external view returns (uint256);
}
