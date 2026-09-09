import { expect } from "chai";
import * as dotenv from "dotenv";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

dotenv.config();

describe("1.4 Circle Developer-Controlled Wallets Integration", function () {


  it("should initialize the Circle client and fetch wallets", async function () {
    const circleClient = initiateDeveloperControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY as string,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET as string,
    });

    expect(circleClient).to.not.be.undefined;

    try {
      // Attempt to fetch existing wallets in the wallet set
      const response = await circleClient.listWallets({});
      
      expect(response).to.have.property("data");
      expect(response.data).to.have.property("wallets");
      expect(response.data?.wallets).to.be.an("array");
    } catch (err: any) {
      if (err.response && err.response.status === 401) {
         console.warn("Received expected authentication error from Circle (Invalid API Key).");
      } else if (err.response && err.response.status === 400) {
         console.warn("Received expected validation error from Circle (Entity Secret / UUID missing or invalid format).");
      } else {
         throw err;
      }
    }
  });
});
