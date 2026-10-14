// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockTwoWayRouter {
    address public tokenA;
    address public tokenB;

    constructor(address _tokenA, address _tokenB) {
        tokenA = _tokenA;
        tokenB = _tokenB;
    }

    receive() external payable {}

    fallback() external payable {
        uint256 allowA = IERC20(tokenA).allowance(msg.sender, address(this));
        if (allowA > 0) {
            IERC20(tokenA).transferFrom(msg.sender, address(this), allowA);
            IERC20(tokenB).transfer(msg.sender, allowA);
            return;
        }

        uint256 allowB = IERC20(tokenB).allowance(msg.sender, address(this));
        if (allowB > 0) {
            IERC20(tokenB).transferFrom(msg.sender, address(this), allowB);
            IERC20(tokenA).transfer(msg.sender, allowB);
            return;
        }
    }
}
