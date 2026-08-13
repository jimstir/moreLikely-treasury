// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IExitPolicy.sol";

/**
 * @title ImmutableExit
 * @dev Type 2A Exit Policy. Immutable, no exit policy is deployed at the time of 
 * treasury contract deployment. Supports the exit interface but does not allow 
 * any treasuryToken swap (claimExit always reverts).
 */
contract ImmutableExit is IExitPolicy {
    error ExitNotSupported();

    address public override treasuryVault;
    uint256 public override proposalNum;
    uint256 public override swapRatio;
    uint256 public override exitWindowEnd;

    constructor(
        address _treasuryVault,
        uint256 _proposalNum
    ) {
        treasuryVault = _treasuryVault;
        proposalNum = _proposalNum;
        swapRatio = 0;
        exitWindowEnd = 0;
    }

    function claimExit(uint256 /* amount */) external pure override {
        revert ExitNotSupported();
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IExitPolicy).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
