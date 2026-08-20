import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("VoterPool - Off-Chain Voting", function () {
    let voterPool: Contract;
    let treasuryToken: Contract;
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        // Deploy a mock ERC20 to act as the treasuryToken
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        // Note: Assuming a mock ERC20 is available or will be created. 
        // For compilation to pass without mocks, you might need to adjust the setup.

        // TODO: Deploy VoterPool with correct parameters
        // voterPool = await ethers.deployContract("VoterPool", [treasuryVaultAddress, treasuryTokenAddress, owner.address]);
    });

    // add this case
    it("should revert if a user tries to transfer their vToken receipt (Soulbound enforcement)", async function () {
        // Setup: user1 deposits into VoterPool and receives vTokens
        // await treasuryToken.connect(user1).approve(await voterPool.getAddress(), ethers.parseUnits("100", 18));
        // await voterPool.connect(user1).depositTokens(ethers.parseUnits("100", 18));
        
        // Assert they received the vTokens
        // const balance = await voterPool.balanceOf(user1.address);
        // expect(balance).to.equal(ethers.parseUnits("100", 18));

        // Action & Assertion: user1 tries to transfer vTokens to user2, which must revert
        /*
        await expect(
            voterPool.connect(user1).transfer(user2.address, ethers.parseUnits("50", 18))
        ).to.be.revertedWith("VoterPool: vTokens are non-transferable");
        */
    });
});
