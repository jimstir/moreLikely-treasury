// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ITreasuryToken.sol";

contract TreasuryToken is ERC20, Ownable, ITreasuryToken {
    address public vault;

    constructor(
        string memory name,
        string memory symbol,
        address initialOwner
    ) ERC20(name, symbol) Ownable(initialOwner) {}

    modifier onlyVault() {
        require(msg.sender == vault, "Only vault allowed");
        _;
    }

    function setVault(address _vault) external onlyOwner {
        require(vault == address(0), "Vault already set");
        require(_vault != address(0), "Invalid vault address");
        vault = _vault;
    }

    function mintTreasury(address to, uint256 amount) external override onlyVault {
        _mint(to, amount);
    }

    function burnTreasury(address from, uint256 amount) external override onlyVault {
        _burn(from, amount);
    }
}
