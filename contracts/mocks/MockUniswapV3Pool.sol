// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockUniswapV3Pool {
    address public token0;
    address public token1;
    int56 public tickCumulative0;
    int56 public tickCumulative1;

    constructor(address _token0, address _token1) {
        token0 = _token0;
        token1 = _token1;
    }

    function setTickCumulatives(int56 _c0, int56 _c1) external {
        tickCumulative0 = _c0;
        tickCumulative1 = _c1;
    }

    function observe(uint32[] calldata) external view returns (
        int56[] memory tickCumulatives,
        uint160[] memory secondsPerLiquidityCumulativeX128s
    ) {
        tickCumulatives = new int56[](2);
        tickCumulatives[0] = tickCumulative0;
        tickCumulatives[1] = tickCumulative1;
        secondsPerLiquidityCumulativeX128s = new uint160[](2);
    }
}
