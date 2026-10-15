import { expect } from "chai";
import { ethers } from "ethers";
import { SmartWalletTools } from "../../../agent/tools/SmartWalletTools";
import { TreasuryVaultTools } from "../../../agent/tools/TreasuryVaultTools";

describe("SmartWalletTools & Forwarding Integration (Unit)", function () {
    const mockSmartWallet = "0x1111111111111111111111111111111111111111";
    const mockVault = "0x2222222222222222222222222222222222222222";
    const mockPolicy = "0x3333333333333333333333333333333333333333";
    const mockTokenIn = "0x4444444444444444444444444444444444444444";
    const mockTokenOut = "0x5555555555555555555555555555555555555555";

    it("should format forwardProposal payload correctly", function () {
        const payload = SmartWalletTools.forwardProposal(
            mockSmartWallet,
            mockVault,
            mockPolicy,
            mockTokenIn,
            "10.5"
        );

        expect(payload.targetContract).to.equal(mockSmartWallet);
        expect(payload.functionSignature).to.equal("forwardProposal(uint256,address,address,uint8,address)");
        expect(payload.abiParameters[0]).to.equal(ethers.parseUnits("10.5", 18).toString());
        expect(payload.abiParameters[1]).to.equal(mockPolicy);
        expect(payload.abiParameters[2]).to.equal(mockVault);
        expect(payload.abiParameters[3]).to.equal("0");
        expect(payload.abiParameters[4]).to.equal(mockTokenIn);
    });

    it("should format forwardExecution payload correctly", function () {
        const payload = SmartWalletTools.forwardExecution(
            mockSmartWallet,
            mockPolicy,
            "42",
            "0xdeadbeef"
        );

        expect(payload.targetContract).to.equal(mockSmartWallet);
        expect(payload.functionSignature).to.equal("forwardExecution(address,uint256,bytes)");
        expect(payload.abiParameters).to.deep.equal([mockPolicy, "42", "0xdeadbeef"]);
    });

    it("should format forwardClose payload correctly", function () {
        const payload = SmartWalletTools.forwardClose(
            mockSmartWallet,
            "42"
        );

        expect(payload.targetContract).to.equal(mockSmartWallet);
        expect(payload.functionSignature).to.equal("forwardClose(uint256)");
        expect(payload.abiParameters).to.deep.equal(["42"]);
    });

    it("should encode wrapSwapExecution and package into forwardExecution", function () {
        const payload = SmartWalletTools.wrapSwapExecution(
            mockSmartWallet,
            mockPolicy,
            "1",
            mockTokenIn,
            mockTokenOut,
            "1000",
            "990",
            "1700000000",
            "0x1234"
        );

        expect(payload.targetContract).to.equal(mockSmartWallet);
        expect(payload.functionSignature).to.equal("forwardExecution(address,uint256,bytes)");
        expect(payload.abiParameters[0]).to.equal(mockPolicy);
        expect(payload.abiParameters[1]).to.equal("1");

        // Decode the encoded calldata and verify executeSwap arguments
        const iface = new ethers.Interface([
            "function executeSwap(uint256 proposal, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 deadline, bytes calldata swapCallData)"
        ]);
        const decoded = iface.decodeFunctionData("executeSwap", payload.abiParameters[2]);
        expect(decoded[0]).to.equal(1n);
        expect(decoded[1].toLowerCase()).to.equal(mockTokenIn.toLowerCase());
        expect(decoded[2].toLowerCase()).to.equal(mockTokenOut.toLowerCase());
        expect(decoded[3]).to.equal(1000n);
        expect(decoded[4]).to.equal(990n);
        expect(decoded[5]).to.equal(1700000000n);
        expect(decoded[6]).to.equal("0x1234");
    });

    it("should encode wrapSetTokenOracleMarket into forwardExecution", function () {
        const payload = SmartWalletTools.wrapSetTokenOracleMarket(
            mockSmartWallet,
            mockPolicy,
            "5",
            mockTokenOut
        );

        expect(payload.targetContract).to.equal(mockSmartWallet);
        expect(payload.functionSignature).to.equal("forwardExecution(address,uint256,bytes)");
        expect(payload.abiParameters[0]).to.equal(mockPolicy);
        expect(payload.abiParameters[1]).to.equal("5");

        const iface = new ethers.Interface([
            "function setTokenOracleMarket(uint256 proposal, address tokenOut)"
        ]);
        const decoded = iface.decodeFunctionData("setTokenOracleMarket", payload.abiParameters[2]);
        expect(decoded[0]).to.equal(5n);
        expect(decoded[1].toLowerCase()).to.equal(mockTokenOut.toLowerCase());
    });

    it("should route TreasuryVaultTools.proposalOpen through SmartWallet if smartWalletAddress is passed", function () {
        const payload = TreasuryVaultTools.proposalOpen(
            mockVault,
            mockPolicy,
            mockTokenIn,
            "5.0",
            mockSmartWallet
        );

        expect(payload.targetContract).to.equal(mockSmartWallet);
        expect(payload.functionSignature).to.equal("forwardProposal(uint256,address,address,uint8,address)");
        expect(payload.abiParameters[0]).to.equal(ethers.parseUnits("5.0", 18).toString());
    });

    it("should route TreasuryVaultTools.proposalOpen directly to vault if smartWalletAddress is omitted", function () {
        const payload = TreasuryVaultTools.proposalOpen(
            mockVault,
            mockPolicy,
            mockTokenIn,
            "5.0"
        );

        expect(payload.targetContract).to.equal(mockVault);
        expect(payload.functionSignature).to.equal("proposalOpen(uint256,address,address,uint8,address)");
    });
});
