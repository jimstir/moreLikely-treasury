// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "../interfaces/ITreasuryPolicy.sol";
import "../interfaces/ITreasuryVault.sol";

contract AssetSwapPolicy is Ownable, ITreasuryPolicy {
    using SafeERC20 for IERC20;

    event SwapExecuted(
        uint256 indexed proposalId,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    address public treasuryVault;
    address public universalRouter;
    address public oracleRouter;

    address[] public heldTokens;
    mapping(address => bool) public isTokenHeld;
    mapping(address => address) public tokenOracleMarkets;
    mapping(uint256 => bool) public executedProposals;

    struct SwapBackRecord {
        uint256 timestamp;
        uint256 proposalId; // Can be 0 if general
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;
    }

    struct ExitRecord {
        uint256 timestamp;
        address token;
        uint256 amount;
    }

    struct LiquidationRecord {
        uint256 timestamp;
        uint256 amount; // Snapshot of getTotalValue() at start of liquidation
    }

    SwapBackRecord[] public swapBackHistory;
    ExitRecord[] public exitHistory;
    LiquidationRecord[] public liquidationHistory;

    uint256[] public proposalIds;

    uint256 public override status; // 1 = Liquidated, 0 = Active
    uint256 public override proposalNum; // Returns latest proposal ID for interface compliance

    constructor(
        address _treasuryVault,
        address _universalRouter,
        address _oracleRouter,
        address _initialOwner
    ) Ownable(_initialOwner) {
        treasuryVault = _treasuryVault;
        universalRouter = _universalRouter;
        oracleRouter = _oracleRouter;
    }

    function getSwapBackHistory()
        external
        view
        returns (SwapBackRecord[] memory)
    {
        return swapBackHistory;
    }

    function getExitHistory() external view returns (ExitRecord[] memory) {
        return exitHistory;
    }

    function getLiquidationHistory()
        external
        view
        returns (LiquidationRecord[] memory)
    {
        return liquidationHistory;
    }

    function getProposalIds() external view returns (uint256[] memory) {
        return proposalIds;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) external pure override returns (bool) {
        return
            interfaceId == type(ITreasuryPolicy).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }

    function setUniversalRouter(address _universalRouter) external onlyOwner {
        universalRouter = _universalRouter;
    }

    function setOracleRouter(address _oracleRouter) external onlyOwner {
        oracleRouter = _oracleRouter;
    }

    function setTokenOracleMarket(
        address token,
        address market
    ) external onlyOwner {
        tokenOracleMarkets[token] = market;
    }

    // Execute swap using Uniswap Router.
    // Expects the vault has already transferred tokenIn to this policy contract.
    function executeSwap(
        uint256 proposalId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata swapCallData
    ) external onlyOwner returns (bool) {
        require(!executedProposals[proposalId], "Proposal already executed");

        // Verify balance
        uint256 balanceBefore = IERC20(tokenIn).balanceOf(address(this));
        require(
            balanceBefore >= amountIn,
            "Insufficient tokenIn balance in policy"
        );

        // Approve router
        IERC20(tokenIn).forceApprove(universalRouter, amountIn);

        // Record balance of output token before swap
        uint256 tokenOutBefore = IERC20(tokenOut).balanceOf(address(this));

        // Execute swap call
        (bool success, ) = universalRouter.call(swapCallData);
        require(success, "Uniswap swap execution failed");

        // Record balance of output token after swap
        uint256 tokenOutAfter = IERC20(tokenOut).balanceOf(address(this));
        uint256 amountOut = tokenOutAfter - tokenOutBefore;
        require(amountOut > 0, "Swap returned zero output tokens");

        if (!isTokenHeld[tokenOut]) {
            heldTokens.push(tokenOut);
            isTokenHeld[tokenOut] = true;
        }

        executedProposals[proposalId] = true;
        proposalIds.push(proposalId);
        proposalNum = proposalId;
        emit SwapExecuted(proposalId, tokenIn, tokenOut, amountIn, amountOut);

        // Tokens are explicitly held by the policy to manage as active funds
        return true;
    }

    function swapBack(
        uint256 proposalId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata swapCallData
    ) external onlyOwner returns (uint256 amountOut) {
        require(
            IERC20(tokenIn).balanceOf(address(this)) >= amountIn,
            "Insufficient balance"
        );
        IERC20(tokenIn).forceApprove(universalRouter, amountIn);

        uint256 balBefore = IERC20(tokenOut).balanceOf(address(this));
        (bool success, ) = universalRouter.call(swapCallData);
        require(success, "Swap failed");
        amountOut = IERC20(tokenOut).balanceOf(address(this)) - balBefore;
        require(amountOut > 0, "Zero output");

        if (!isTokenHeld[tokenOut]) {
            heldTokens.push(tokenOut);
            isTokenHeld[tokenOut] = true;
        }

        swapBackHistory.push(
            SwapBackRecord({
                timestamp: block.timestamp,
                proposalId: proposalId,
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn,
                amountOut: amountOut
            })
        );
    }

    function exit(address token, uint256 amount) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance >= amount, "Insufficient balance");

        IERC20(token).forceApprove(treasuryVault, amount);
        bool ok = ITreasuryVault(treasuryVault).depositTreasury(
            IERC20(token),
            amount,
            false,
            0
        );
        require(ok, "Vault deposit failed");

        exitHistory.push(
            ExitRecord({
                timestamp: block.timestamp,
                token: token,
                amount: amount
            })
        );
    }

    function liquidate() external override onlyOwner {
        status = 1;
        liquidationHistory.push(
            LiquidationRecord({
                timestamp: block.timestamp,
                amount: getTotalValue() // Optional comment: total value at the start of liquidation
            })
        );
    }

    function getTotalValue() public view override returns (uint256) {
        uint256 total = 0;
        for (uint i = 0; i < heldTokens.length; i++) {
            address t = heldTokens[i];
            uint256 bal = IERC20(t).balanceOf(address(this));
            if (bal > 0) {
                address market = tokenOracleMarkets[t];
                if (market != address(0)) {
                    (bool s1, bytes memory d1) = oracleRouter.staticcall(
                        abi.encodeWithSignature("getPrice(address)", market)
                    );
                    if (s1 && d1.length > 0) {
                        uint256 price = abi.decode(d1, (uint256));

                        uint8 decimals = 18;
                        (bool s2, bytes memory d2) = t.staticcall(
                            abi.encodeWithSignature("decimals()")
                        );
                        if (s2 && d2.length > 0) {
                            decimals = abi.decode(d2, (uint8));
                        }

                        uint256 normalizedValue = (bal * price) /
                            (10 ** decimals);
                        total += normalizedValue;
                    }
                }
            }
        }
        return total;
    }

    function liquidateToken(address token) external onlyOwner {
        require(status == 1, "Policy not in liquidated state");
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No balance to liquidate");

        IERC20(token).forceApprove(treasuryVault, balance);
        bool ok = ITreasuryVault(treasuryVault).depositTreasury(
            IERC20(token),
            balance,
            false,
            0
        );
        require(ok, "Liquidation deposit failed");
    }
}
