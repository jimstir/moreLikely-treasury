import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";

describe("SmartWallet Unit Tests", function () {
    let owner: Signer;
    let aiAgent: Signer;
    let unauthorized: Signer;

    let ownerAddress: string;
    let aiAgentAddress: string;
    let unauthorizedAddress: string;

    let initToken: any;
    let treasuryToken: any;
    let treasuryVault: any;
    let smartWallet: any;
    let mockPolicy: any;

    const RATE_LIMIT = 86400; // 24 hours
    const MAX_GAS_PRICE = ethers.parseUnits("50", "gwei");

    beforeEach(async function () {
        [owner, aiAgent, unauthorized] = await ethers.getSigners();
        ownerAddress = await owner.getAddress();
        aiAgentAddress = await aiAgent.getAddress();
        unauthorizedAddress = await unauthorized.getAddress();

        // 1. Deploy Mock Tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        initToken = await MockERC20.deploy("Init Token", "INIT");
        await initToken.waitForDeployment();

        // 2. Deploy TreasuryToken
        const TreasuryToken = await ethers.getContractFactory("TreasuryToken");
        treasuryToken = await TreasuryToken.deploy(
            "Treasury Shares",
            "TRES",
            ownerAddress
        );
        await treasuryToken.waitForDeployment();

        // 3. Deploy TreasuryVault
        const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
        treasuryVault = await TreasuryVault.deploy(
            "Test Treasury",
            await treasuryToken.getAddress(),
            await initToken.getAddress(),
            100, // 1%
            "Vault Shares",
            "VSHARE"
        );
        await treasuryVault.waitForDeployment();
        await treasuryToken.setVault(await treasuryVault.getAddress());

        // 4. Deploy SmartWallet
        const SmartWallet = await ethers.getContractFactory("SmartWallet");
        smartWallet = await SmartWallet.deploy(
            aiAgentAddress,
            await treasuryVault.getAddress(),
            RATE_LIMIT,
            MAX_GAS_PRICE
        );
        await smartWallet.waitForDeployment();

        // Authorize SmartWallet on Vault so it can call proposalOpen
        await treasuryVault.addAuth(await smartWallet.getAddress());

        // Fund SmartWallet with ETH for gas refunds
        await owner.sendTransaction({
            to: await smartWallet.getAddress(),
            value: ethers.parseEther("5.0")
        });

        // 5. Deploy AssetSwapPolicy (as a compliant recipient for proposals)
        const AssetSwapPolicy = await ethers.getContractFactory("AssetSwapPolicy");
        mockPolicy = await AssetSwapPolicy.deploy(
            await treasuryVault.getAddress(),
            ethers.ZeroAddress,
            ethers.ZeroAddress
        );
        await mockPolicy.waitForDeployment();
    });

    describe("Deployment & Configuration", function () {
        it("should initialize with correct parameters", async function () {
            expect(await smartWallet.owner()).to.equal(ownerAddress);
            expect(await smartWallet.executionWallet()).to.equal(aiAgentAddress);
            expect(await smartWallet.vault()).to.equal(await treasuryVault.getAddress());
            expect(await smartWallet.proposalRateLimit()).to.equal(RATE_LIMIT);
            expect(await smartWallet.maxGasPrice()).to.equal(MAX_GAS_PRICE);
        });

        it("should allow owner to update configuration", async function () {
            await smartWallet.updateExecutionWallet(unauthorizedAddress);
            expect(await smartWallet.executionWallet()).to.equal(unauthorizedAddress);

            await smartWallet.updateRateLimit(3600);
            expect(await smartWallet.proposalRateLimit()).to.equal(3600);

            await smartWallet.updateMaxGasPrice(ethers.parseUnits("100", "gwei"));
            expect(await smartWallet.maxGasPrice()).to.equal(ethers.parseUnits("100", "gwei"));
        });

        it("should revert if non-owner tries to update configuration", async function () {
            await expect(
                smartWallet.connect(unauthorized).updateExecutionWallet(unauthorizedAddress)
            ).to.be.revertedWith("Not owner");
        });

        it("should allow owner to withdraw ETH gas balance", async function () {
            await smartWallet.withdrawAll();
            const contractBalance = await ethers.provider.getBalance(await smartWallet.getAddress());
            expect(contractBalance).to.equal(0n);
        });
    });

    describe("forwardProposal", function () {
        it("should forward proposalOpen and refund gas to executionWallet", async function () {
            const tx = await smartWallet.connect(aiAgent).forwardProposal(
                0,
                await mockPolicy.getAddress(),
                ownerAddress,
                0, // ProposalType.TXNS
                await initToken.getAddress()
            );
            await tx.wait();

            expect(await treasuryVault.proposalNum()).to.equal(1n);

            // Verify GasRefunded event was emitted
            await expect(tx).to.emit(smartWallet, "GasRefunded");
        });

        it("should enforce rate limit between proposals", async function () {
            await smartWallet.connect(aiAgent).forwardProposal(
                0,
                await mockPolicy.getAddress(),
                ownerAddress,
                0,
                await initToken.getAddress()
            );

            // Attempt immediate second proposal
            await expect(
                smartWallet.connect(aiAgent).forwardProposal(
                    0,
                    await mockPolicy.getAddress(),
                    ownerAddress,
                    0,
                    await initToken.getAddress()
                )
            ).to.be.revertedWith("Rate limited");

            // Advance time past rate limit
            await ethers.provider.send("evm_increaseTime", [RATE_LIMIT + 1]);
            await ethers.provider.send("evm_mine", []);

            // Now proposal succeeds
            await expect(
                smartWallet.connect(aiAgent).forwardProposal(
                    0,
                    await mockPolicy.getAddress(),
                    ownerAddress,
                    0,
                    await initToken.getAddress()
                )
            ).to.not.be.reverted;
        });

        it("should reject forwardProposal from non-execution wallet", async function () {
            await expect(
                smartWallet.connect(unauthorized).forwardProposal(
                    0,
                    await mockPolicy.getAddress(),
                    ownerAddress,
                    0,
                    await initToken.getAddress()
                )
            ).to.be.revertedWith("Not execution wallet");
        });
    });

    describe("forwardExecution & Recipient Verification", function () {
        let proposalId: bigint;

        beforeEach(async function () {
            // Open a proposal
            await smartWallet.connect(aiAgent).forwardProposal(
                0,
                await mockPolicy.getAddress(),
                ownerAddress,
                0,
                await initToken.getAddress()
            );
            proposalId = await treasuryVault.proposalNum();
        });

        it("should reject forwardExecution if target does not match proposal receiver or vault", async function () {
            const randomTarget = unauthorizedAddress;

            await expect(
                smartWallet.connect(aiAgent).forwardExecution(
                    randomTarget,
                    proposalId,
                    "0x"
                )
            ).to.be.revertedWith("Target not authorized by proposal");
        });

        it("should reject forwardExecution if proposal has not passed vote", async function () {
            // Advance time and open proposal requesting tokens without shareholder votes
            await ethers.provider.send("evm_increaseTime", [RATE_LIMIT + 1]);
            await ethers.provider.send("evm_mine", []);

            await smartWallet.connect(aiAgent).forwardProposal(
                ethers.parseEther("100"),
                await mockPolicy.getAddress(),
                ownerAddress,
                0,
                await initToken.getAddress()
            );
            const unapprovedId = await treasuryVault.proposalNum();

            await expect(
                smartWallet.connect(aiAgent).forwardExecution(
                    await mockPolicy.getAddress(),
                    unapprovedId,
                    "0x"
                )
            ).to.be.revertedWith("Proposal not approved");
        });

        it("should reject forwardExecution if proposal is closed", async function () {
            await treasuryVault.proposalClose(proposalId);

            await expect(
                smartWallet.connect(aiAgent).forwardExecution(
                    await mockPolicy.getAddress(),
                    proposalId,
                    "0x"
                )
            ).to.be.revertedWith("Proposal closed");
        });
    });

    describe("forwardClose", function () {
        it("should reject forwardClose from non-execution wallet", async function () {
            await expect(
                smartWallet.connect(unauthorized).forwardClose(1)
            ).to.be.revertedWith("Not execution wallet");
        });

        it("should revert if proposal is not marked for close and caller is not vault owner", async function () {
            await ethers.provider.send("evm_increaseTime", [RATE_LIMIT + 1]);
            await ethers.provider.send("evm_mine", []);

            await smartWallet.connect(aiAgent).forwardProposal(
                0,
                await mockPolicy.getAddress(),
                ownerAddress,
                0,
                await initToken.getAddress()
            );
            const proposalId = await treasuryVault.proposalNum();

            await expect(
                smartWallet.connect(aiAgent).forwardClose(proposalId)
            ).to.be.revertedWith("Not owner");
        });
    });
});
