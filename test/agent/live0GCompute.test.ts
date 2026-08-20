import { expect } from "chai";
import { ethers } from "hardhat";
import { AIOwnerAgent } from "../../agent/aiAgent";

describe("Live 0G Compute Network Test Suite", function () {
    let mockUsdc: any;
    let mockWeth: any;
    let agent: AIOwnerAgent;
    let owner: any;

    beforeEach(async function () {
        [owner] = await ethers.getSigners();

        const MockUSDC = await ethers.getContractFactory("MockERC20");
        mockUsdc = await MockUSDC.deploy("Mock USDC", "USDC");
        await mockUsdc.waitForDeployment();

        const MockWETH = await ethers.getContractFactory("MockERC20");
        mockWeth = await MockWETH.deploy("Mock WETH", "WETH");
        await mockWeth.waitForDeployment();

        const agentPrivateKey = "0x5de4111afa73d9b5c2f207f136e1c9e30a5f8c00224d080f4f9f74053e1a18bc";

        agent = new AIOwnerAgent(
            ethers.provider,
            agentPrivateKey,
            process.env.ZEROG_COMPUTE_API_KEY,
            process.env.ZEROG_COMPUTE_BASE_URL,
            "glm-5.2"
        );
    });

    it("should successfully query the 0G Compute Network live testnet for a trade recommendation", async function () {
        const apiKey = process.env.ZEROG_COMPUTE_API_KEY;
        expect(apiKey, "ZEROG_COMPUTE_API_KEY must be configured in your .env file to run live 0G compute tests").to.not.be.undefined;
        expect(apiKey, "ZEROG_COMPUTE_API_KEY cannot be empty").to.not.equal("");

        const state = {
            assets: [await mockUsdc.getAddress()],
            balances: {
                [await mockUsdc.getAddress()]: "100.0"
            }
        };

        const marketData = {
            prices: {
                [await mockUsdc.getAddress()]: 1.0,
                [await mockWeth.getAddress()]: 3000.0
            },
            liquidity: {}
        };

        const recommendation = await agent.evaluateTrade(state, marketData);
        expect(recommendation).to.have.property("recommendTrade");
        expect(recommendation).to.have.property("rationale");
        console.log(`          [SUCCESS] 0G Compute Recommendation Rationale: ${recommendation.rationale}`);
    });
});
