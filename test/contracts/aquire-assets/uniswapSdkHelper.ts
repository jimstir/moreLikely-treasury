import { ethers } from 'hardhat';

// Universally builds the calldata for a V3_SWAP_EXACT_IN swap on the SwapRouter02
export async function buildUniversalRouterSwapData(
    tokenInAddress: string,
    tokenOutAddress: string,
    amountInStr: string,
    recipientAddress: string,
    feeTier: number = 3000
): Promise<{calldata: string, expectedAmountOutRaw: string}> {
    
    // Path encoding for V3 (tokenIn + fee + tokenOut)
    const path = ethers.solidityPacked(
        ["address", "uint24", "address"],
        [tokenInAddress, feeTier, tokenOutAddress]
    );

    // SwapRouter02 exactInput(ExactInputParams params)
    // struct ExactInputParams { bytes path; address recipient; uint256 amountIn; uint256 amountOutMinimum; }
    
    // We encode the ExactInputParams struct as a tuple
    const routerABI = ["function exactInput(tuple(bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum) params) external payable returns (uint256 amountOut)"];
    const routerInterface = new ethers.Interface(routerABI);

    const calldata = routerInterface.encodeFunctionData("exactInput", [{
        path: path,
        recipient: recipientAddress,
        amountIn: amountInStr,
        amountOutMinimum: 0 // 100% slippage tolerance for tests
    }]);

    const expectedAmountOutRaw = "1000"; // Dummy

    return { calldata, expectedAmountOutRaw };
}
