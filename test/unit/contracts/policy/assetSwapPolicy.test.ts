import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";

describe("AssetSwapPolicy - Slippage & Deadline Enforcement Suite", function () {
    let owner: Signer;
    let ownerAddress: string;

    let usdc: any;
    let weth: any;
    let initToken: any;
    let treasuryToken: any;
    let treasuryVault: any;
    let router: any;
    let swapPolicy: any;

    beforeEach(async function () {
        [owner] = await ethers.getSigners();
        ownerAddress = await owner.getAddress();

        // 1. Deploy Tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        usdc = await MockERC20.deploy("USD Coin", "USDC");
        await usdc.waitForDeployment();
        weth = await MockERC20.deploy("Wrapped Ether", "WETH");
        await weth.waitForDeployment();
        initToken = await MockERC20.deploy("Init Token", "INIT");
        await initToken.waitForDeployment();

        // 2. Deploy TreasuryToken and TreasuryVault
        const TreasuryToken = await ethers.getContractFactory("TreasuryToken");
        treasuryToken = await TreasuryToken.deploy("Treasury Shares", "TRES", ownerAddress);
        await treasuryToken.waitForDeployment();

        const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
        treasuryVault = await TreasuryVault.deploy(
            "moreLikely Treasury",
            await treasuryToken.getAddress(),
            await initToken.getAddress(),
            100,
            "Vault Shares",
            "VSHARE"
        );
        await treasuryVault.waitForDeployment();
        await (await treasuryToken.setVault(await treasuryVault.getAddress())).wait();

        // 3. Deploy MockTwoWayRouter
        const MockTwoWayRouter = await ethers.getContractFactory("MockTwoWayRouter");
        router = await MockTwoWayRouter.deploy(await usdc.getAddress(), await weth.getAddress());
        await router.waitForDeployment();

        // Fund router with WETH and USDC to facilitate 1:1 swaps
        await (await weth.mint(await router.getAddress(), ethers.parseEther("10000"))).wait();
        await (await usdc.mint(await router.getAddress(), ethers.parseEther("10000"))).wait();

        // 4. Deploy AssetSwapPolicy
        const AssetSwapPolicy = await ethers.getContractFactory("AssetSwapPolicy");
        swapPolicy = await AssetSwapPolicy.deploy(
            await treasuryVault.getAddress(),
            await router.getAddress(),
            ownerAddress
        );
        await swapPolicy.waitForDeployment();

        // Fund policy with USDC to simulate funded proposal
        await (await usdc.mint(await swapPolicy.getAddress(), ethers.parseEther("1000"))).wait();
    });

    /**
     * @audit pashov-ai-audit-report-1.md - Finding #21
     * @description Slippage tolerance (minAmountOut) and deadline expiration enforcement in executeSwap and swapBack.
     */
    describe("[Finding #21] Slippage & Deadline Enforcement", function () {
        const mockSwapData = "0x1234";

        it("executeSwap should revert with 'Transaction expired' if block.timestamp > deadline", async function () {
            const block = await ethers.provider.getBlock("latest");
            const expiredDeadline = (block ? block.timestamp : Math.floor(Date.now() / 1000)) - 100;

            await expect(
                swapPolicy.executeSwap(
                    1,
                    await usdc.getAddress(),
                    await weth.getAddress(),
                    ethers.parseEther("50"),
                    0,
                    expiredDeadline,
                    mockSwapData
                )
            ).to.be.revertedWith("Transaction expired");
        });

        it("executeSwap should revert with 'Insufficient output amount / Slippage exceeded' if amountOut < minAmountOut", async function () {
            const block = await ethers.provider.getBlock("latest");
            const validDeadline = (block ? block.timestamp : Math.floor(Date.now() / 1000)) + 3600;

            // Swapping 50 USDC will return 50 WETH. Setting minAmountOut to 51 WETH must revert.
            await expect(
                swapPolicy.executeSwap(
                    1,
                    await usdc.getAddress(),
                    await weth.getAddress(),
                    ethers.parseEther("50"),
                    ethers.parseEther("51"),
                    validDeadline,
                    mockSwapData
                )
            ).to.be.revertedWith("Insufficient output amount / Slippage exceeded");
        });

        it("executeSwap should succeed when within deadline and minAmountOut satisfied, emitting SwapExecuted", async function () {
            const block = await ethers.provider.getBlock("latest");
            const validDeadline = (block ? block.timestamp : Math.floor(Date.now() / 1000)) + 3600;

            const swapAmount = ethers.parseEther("50");
            await expect(
                swapPolicy.executeSwap(
                    1,
                    await usdc.getAddress(),
                    await weth.getAddress(),
                    swapAmount,
                    swapAmount, // minAmountOut == 50
                    validDeadline,
                    mockSwapData
                )
            ).to.emit(swapPolicy, "SwapExecuted")
              .withArgs(1, await usdc.getAddress(), await weth.getAddress(), swapAmount, swapAmount);

            expect(await weth.balanceOf(await swapPolicy.getAddress())).to.equal(swapAmount);
        });

        it("swapBack should revert with 'Transaction expired' if block.timestamp > deadline", async function () {
            // First execute forward swap to hold WETH
            const block = await ethers.provider.getBlock("latest");
            const validDeadline = (block ? block.timestamp : Math.floor(Date.now() / 1000)) + 3600;
            await swapPolicy.executeSwap(
                1,
                await usdc.getAddress(),
                await weth.getAddress(),
                ethers.parseEther("50"),
                0,
                validDeadline,
                mockSwapData
            );

            // Attempt swapBack with expired deadline
            const expiredDeadline = (block ? block.timestamp : Math.floor(Date.now() / 1000)) - 50;
            await expect(
                swapPolicy.swapBack(
                    1,
                    await weth.getAddress(),
                    await usdc.getAddress(),
                    ethers.parseEther("20"),
                    0,
                    expiredDeadline,
                    mockSwapData
                )
            ).to.be.revertedWith("Transaction expired");
        });

        it("swapBack should revert with 'Insufficient output amount / Slippage exceeded' if amountOut < minAmountOut", async function () {
            const block = await ethers.provider.getBlock("latest");
            const validDeadline = (block ? block.timestamp : Math.floor(Date.now() / 1000)) + 3600;
            await swapPolicy.executeSwap(
                1,
                await usdc.getAddress(),
                await weth.getAddress(),
                ethers.parseEther("50"),
                0,
                validDeadline,
                mockSwapData
            );

            // Swapping 20 WETH back returns 20 USDC. Setting minAmountOut to 21 USDC must revert.
            await expect(
                swapPolicy.swapBack(
                    1,
                    await weth.getAddress(),
                    await usdc.getAddress(),
                    ethers.parseEther("20"),
                    ethers.parseEther("21"),
                    validDeadline,
                    mockSwapData
                )
            ).to.be.revertedWith("Insufficient output amount / Slippage exceeded");
        });

        it("swapBack should succeed when within deadline and minAmountOut satisfied, appending to swapBackHistory", async function () {
            const block = await ethers.provider.getBlock("latest");
            const validDeadline = (block ? block.timestamp : Math.floor(Date.now() / 1000)) + 3600;
            await swapPolicy.executeSwap(
                1,
                await usdc.getAddress(),
                await weth.getAddress(),
                ethers.parseEther("50"),
                0,
                validDeadline,
                mockSwapData
            );

            const swapBackAmount = ethers.parseEther("20");
            await expect(
                swapPolicy.swapBack(
                    1,
                    await weth.getAddress(),
                    await usdc.getAddress(),
                    swapBackAmount,
                    swapBackAmount,
                    validDeadline,
                    mockSwapData
                )
            ).to.not.be.reverted;

            const history = await swapPolicy.getSwapBackHistory();
            expect(history.length).to.equal(1);
            expect(history[0].amountIn).to.equal(swapBackAmount);
            expect(history[0].amountOut).to.equal(swapBackAmount);
            expect(history[0].tokenIn).to.equal(await weth.getAddress());
            expect(history[0].tokenOut).to.equal(await usdc.getAddress());
        });
    });
});
