// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITreasuryToken is IERC20 {
    function mintTreasury(address to, uint256 amount) external;
    function burnTreasury(address from, uint256 amount) external;
}
