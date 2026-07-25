// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockUniversalRouter {
    address public tokenIn;
    address public tokenOut;
    uint256 public rate; // Rate: amount of tokenOut returned per 1 tokenIn (scaled by 1e18)

    constructor(address _tokenIn, address _tokenOut, uint256 _rate) {
        tokenIn = _tokenIn;
        tokenOut = _tokenOut;
        rate = _rate;
    }

    fallback() external payable {
        // Perform a mock swap:
        // 1. Pull the tokenIn from msg.sender (which has approved this router)
        uint256 allowance = IERC20(tokenIn).allowance(msg.sender, address(this));
        if (allowance > 0) {
            IERC20(tokenIn).transferFrom(msg.sender, address(this), allowance);
            // 2. Mint/transfer tokenOut back to msg.sender
            uint256 amountOut = (allowance * rate) / 1e18;
            require(IERC20(tokenOut).balanceOf(address(this)) >= amountOut, "MockRouter: Insufficient out balance");
            IERC20(tokenOut).transfer(msg.sender, amountOut);
        }
    }
}
