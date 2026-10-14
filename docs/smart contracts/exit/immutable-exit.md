# Open Treasury: Immutable Exit Specification and Architecture

This document defines the architecture and compliance specification for the `ImmutableExit.sol` contract (Type 2A Exit Policy).

---

## 1. Overview & Purpose

`ImmutableExit.sol` represents a non-redeemable or locked exit configuration:
* **Policy Type**: Type 2A Exit Policy.
* **Use Case**: Deployed when a treasury vault is configured with permanent lockups or when governance explicitly forbids shareholder redemptions / voluntary exits at the contract layer.
* **Interface Compatibility**: Implements `IExitPolicy` and `IERC165` so that the `TreasuryVault` and governance routing logic can interface with standard exit getters without special-case logic.
* **Operation**: All invocation of `claimExit` intentionally and unconditionally reverts.

---

## 2. Core Architecture & State Variables

`ImmutableExit` satisfies the `IExitPolicy` interface with fixed, immutable defaults:

| Variable / Function | Return Type | Value | Description |
|---|---|---|---|
| `treasuryVault` | `address` | Set at deployment | Address of the associated `TreasuryVault`. |
| `proposalNum` | `uint256` | Set at deployment | Proposal ID that deployed or configured this policy. |
| `swapRatio` | `uint256` | `0` | No conversion ratio is provided. |
| `exitWindowEnd` | `uint256` | `0` | Unbounded / inactive exit window. |

### Constructor Initialization
```solidity
constructor(
    address _treasuryVault,
    uint256 _proposalNum
) {
    treasuryVault = _treasuryVault;
    proposalNum = _proposalNum;
    swapRatio = 0;
    exitWindowEnd = 0;
}
```

---

## 3. Token Return Behavior

Because Type 2A exit policies do not support token redemptions:
* **Token In**: None.
* **Token Out**: None.
* **Revert Execution**:
  ```solidity
  function claimExit(uint256 /* amount */) external pure override {
      revert ExitNotSupported();
  }
  ```
  Any shareholder attempting to claim an exit receives an immediate `ExitNotSupported()` revert. No shares are burned, and no treasury assets are dispensed.

---

## 4. ERC-165 Interface Support

`ImmutableExit` advertises support for `IExitPolicy` and `IERC165`:
```solidity
function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
    return interfaceId == type(IExitPolicy).interfaceId || interfaceId == type(IERC165).interfaceId;
}
```
This enables upstream governance tools to safely identify the contract as an exit policy while inspecting `swapRatio() == 0` to verify that redemptions are locked.
