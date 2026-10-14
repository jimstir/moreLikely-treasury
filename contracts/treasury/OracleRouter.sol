// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "../interfaces/IPriceOracle.sol";
import "../uniswap/TickMath.sol";

/**
 * @title OracleRouter
 * @dev The unified pricing engine contract for Open Treasury policy contracts,
 * implementing the IPriceOracle interface. Keyed by market aggregator/pool address.
 */
contract OracleRouter is Ownable, IPriceOracle, IERC165 {
    enum MarketType {
        UNREGISTERED,
        CHAINLINK,
        UNISWAP
    }

    event ChainlinkFeedRegistered(address indexed aggregator);
    event UniswapPoolRegistered(
        address indexed pool,
        address indexed pricedToken,
        uint32 twapPeriod
    );
    event TwapPeriodUpdated(
        address indexed pool,
        uint32 oldPeriod,
        uint32 newPeriod
    );

    mapping(address => MarketType) public marketTypes;
    mapping(address => address) public pricedTokens;
    mapping(address => uint32) public twapPeriods;

    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @dev Register a Chainlink feed market. Uses Registry Reuse to save gas.
     * @param aggregator The address of the Chainlink Aggregator contract.
     */
    function registerChainlinkFeed(address aggregator) external onlyOwner {
        require(aggregator != address(0), "Invalid aggregator address");

        // Registry Reuse: If already registered, return early to save gas.
        if (marketTypes[aggregator] == MarketType.CHAINLINK) {
            return;
        }

        marketTypes[aggregator] = MarketType.CHAINLINK;
        emit ChainlinkFeedRegistered(aggregator);
    }

    /**
     * @dev Register a Uniswap V3 Pool market. Uses Registry Reuse to save gas.
     * @param pool The address of the Uniswap V3 Pool contract.
     * @param pricedToken The address of the token inside the pool to be priced.
     * @param twapPeriod The window in seconds to calculate TWAP.
     */
    function registerUniswapPool(
        address pool,
        address pricedToken,
        uint32 twapPeriod
    ) external onlyOwner {
        require(pool != address(0), "Invalid pool address");
        require(pricedToken != address(0), "Invalid priced token address");
        require(twapPeriod > 0, "TWAP period must be > 0");

        // Registry Reuse: If already registered, return early to save gas.
        if (marketTypes[pool] == MarketType.UNISWAP) {
            return;
        }

        address token0 = IUniswapV3Pool(pool).token0();
        address token1 = IUniswapV3Pool(pool).token1();
        require(
            pricedToken == token0 || pricedToken == token1,
            "Token not in pool"
        );

        marketTypes[pool] = MarketType.UNISWAP;
        pricedTokens[pool] = pricedToken;
        twapPeriods[pool] = twapPeriod;

        emit UniswapPoolRegistered(pool, pricedToken, twapPeriod);
    }

    /**
     * @dev Updates the TWAP period for a registered Uniswap V3 Pool market.
     * @param pool The Uniswap V3 Pool address.
     * @param twapPeriod The new TWAP window in seconds.
     */
    function setTwapPeriod(address pool, uint32 twapPeriod) external onlyOwner {
        require(
            marketTypes[pool] == MarketType.UNISWAP,
            "Market not registered as Uniswap V3"
        );
        require(twapPeriod > 0, "TWAP period must be > 0");

        uint32 oldPeriod = twapPeriods[pool];
        twapPeriods[pool] = twapPeriod;

        emit TwapPeriodUpdated(pool, oldPeriod, twapPeriod);
    }

    /**
     * @dev Fetches price with a caller-specified staleness threshold (heartbeat).
     * @param market The address of the Uniswap Pool or Chainlink Aggregator.
     * @param maxAge Maximum allowed age of the price in seconds (0 = skip age check).
     */
    function getPrice(address market, uint256 maxAge) public view returns (uint256) {
        MarketType mType = marketTypes[market];
        if (mType == MarketType.CHAINLINK) {
            return getChainlinkPrice(market, maxAge);
        } else if (mType == MarketType.UNISWAP) {
            return getUniswapTwapPrice(market);
        } else {
            revert("Market not registered");
        }
    }

    /**
     * @dev Standard interface (backwards-compatible with IPriceOracle).
     */
    function getPrice(address market) external view override returns (uint256) {
        return getPrice(market, 0); // 0 performs round checks without a fixed timeout
    }

    function getChainlinkPrice(
        address aggregator,
        uint256 maxAge
    ) internal view returns (uint256) {
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = AggregatorV3Interface(aggregator).latestRoundData();

        // 1. Mandatory round integrity checks
        require(answer > 0, "Invalid oracle price");
        require(updatedAt != 0, "Incomplete round");
        require(answeredInRound >= roundId, "Stale price round");
        require(block.timestamp >= updatedAt, "Future price timestamp");

        // 2. Caller-specified staleness enforcement
        if (maxAge > 0) {
            require(block.timestamp - updatedAt <= maxAge, "Price is stale");
        }

        // 3. Decimal normalization to 1e18
        uint8 decimals = AggregatorV3Interface(aggregator).decimals();

        if (decimals < 18) {
            return uint256(answer) * (10 ** (18 - decimals));
        } else if (decimals > 18) {
            return uint256(answer) / (10 ** (decimals - 18));
        } else {
            return uint256(answer);
        }
    }

    function getUniswapTwapPrice(address pool) internal view returns (uint256) {
        uint32 twapPeriod = twapPeriods[pool];
        require(twapPeriod > 0, "TWAP period not set");

        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = twapPeriod;
        secondsAgos[1] = 0;

        (int56[] memory tickCumulatives, ) = IUniswapV3Pool(pool).observe(
            secondsAgos
        );

        int56 tickCumulativesDelta = tickCumulatives[1] - tickCumulatives[0];
        int56 delta = tickCumulativesDelta / int56(uint56(twapPeriod));
        if (
            tickCumulativesDelta < 0 &&
            (tickCumulativesDelta % int56(uint56(twapPeriod)) != 0)
        ) {
            delta--;
        }

        require(
            delta >= int56(TickMath.MIN_TICK) && delta <= int56(TickMath.MAX_TICK),
            "TWAP tick out of bounds"
        );

        int24 timeWeightedAverageTick = int24(delta);
        uint160 sqrtRatioX96 = TickMath.getSqrtRatioAtTick(timeWeightedAverageTick);
        address pricedToken = pricedTokens[pool];
        address token0 = IUniswapV3Pool(pool).token0();

        uint256 ratioX192 = uint256(sqrtRatioX96) * sqrtRatioX96;

        if (pricedToken == token0) {
            // Price of token0 in terms of token1
            return (ratioX192 * 1e18) >> 192;
        } else {
            // Price of token1 in terms of token0
            return (1e18 << 192) / ratioX192;
        }
    }

    function supportsInterface(
        bytes4 interfaceId
    ) external pure override returns (bool) {
        return
            interfaceId == type(IPriceOracle).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }
}
