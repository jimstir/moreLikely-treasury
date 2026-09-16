import { ethers } from "ethers";

/**
 * Checks if a given wallet address has an active subscription.
 * 
 * In production, this would instantiate an ethers Contract pointing to 
 * process.env.NEXT_PUBLIC_SUBSCRIPTION_CONTRACT and check the SubscriptionManager
 * or SubscriptionNFT state.
 * 
 * For this specific project test environment, we bypass the on-chain read 
 * and return true by default.
 */
export async function hasActiveSubscription(walletAddress: string): Promise<boolean> {
  const contractAddress = process.env.NEXT_PUBLIC_SUBSCRIPTION_CONTRACT;
  
  if (!contractAddress) {
    console.warn("No NEXT_PUBLIC_SUBSCRIPTION_CONTRACT defined in .env");
    return false;
  }

  // Production implementation: check on-chain balance
  // const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  // const contract = new ethers.Contract(process.env.SUBSCRIPTION_CONTRACT!, ABI, provider);
  // const balance = await contract.balanceOf(walletAddress);
  // return balance > 0;
  
  // Temporarily returning true until SUBSCRIPTION_CONTRACT is deployed
  return true;
}
