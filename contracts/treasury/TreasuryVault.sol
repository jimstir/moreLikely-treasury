// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;
/// @title Tokenized Treasury(ERC7425)
/// @author @jimstir

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "../interfaces/ITreasuryToken.sol";
import "../interfaces/ITreasuryPolicy.sol";

contract TreasuryVault is ERC4626 {
    using SafeERC20 for IERC20;

    /// @dev proposalOpen event
    event proposalO(
        address indexed token,
        uint256 indexed proposalNum,
        uint256 indexed amount,
        address recipient,
        ProposalType request
    );
    /// dev proposlClose event
    event proposalC(
        uint256 indexed proposalNum,
        bool indexed closed,
        address closer,
        uint256 returned,
        uint256 sent
    );
    /// @dev deposit event
    event FundsAdded(
        address indexed token,
        uint256 indexed amount,
        uint256 indexed time,
        address sender
    );

    enum ProposalType {
        TXNS,
        CLOSE, //
        ADD_TOKEN,
        EXIT
    }

    struct userAccount {
        uint256 proposal; // Dual-use: total count at index 0, actual proposal ID at index > 0
        uint256 deposit; // Amount deposited for shares by user
        uint256 withdrew; // Amount withdrawn from a proposal by the user
    }

    struct proposalAccount {
        ProposalType request; //For explict proposal types
        bool close; // For closing after an approved closeRequest
        address owner;
        uint256 withdraw; // Amount withdrawn for given proposal, For CLOSE the proposal number to close
        address receiver; // The receiver for given proposal
        bool executed; // if proposal has been executed(txns or close)
        IERC20 token; // Token used for given proposal, For ADD_TOKEN the new token address
        uint256 time;
        uint256 deposits; // amount returned
    }

    struct UserDeposit {
        uint256 num; // the deposit number
        uint256 amount;
        IERC20 token;
        address owner; // address of contract or wallet
        uint256 time; // time of deposit
        uint256 proposalNum;
    }

    //Get the treasuryToken address
    IERC20 public treasToken;
    //Get the treasury name
    string public treasName;
    //See all the approvedTokens of this treasury
    IERC20[] private _tokenList;
    // Get the treasury owner
    address public tOwner;
    //Current number of all proposals in treasury
    uint256 public proposalNum;
    // The voting theshold set by owner
    uint256 public votingThres;
    // Total of deposits made to treasury to join
    uint256 public depositNum;
    // The fixed number of approvedTokens
    uint256 public list;

    mapping(address => bool) private _authUsers;
    // Total shares issued for a given proposal [proposalNum => shares]
    // Number does not change after proposal closed and shares are redeemed
    mapping(uint256 => uint256) public totalShares;
    // Check if proposal is closed
    mapping(uint256 => bool) public closedProposals;

    //Track the number of proposals a shareholder has voted in
    mapping(address => mapping(uint256 => userAccount)) public userBook;
    //mapping(uint256 => ownerAccount) internal ownerBook;
    mapping(uint256 => proposalAccount) public proposalBook;
    // mapping of auth contract address for proposals
    mapping(IERC20 => bool) internal approvedToken;
    // Record deposits for reference
    mapping(uint256 => UserDeposit) internal addFunds;

    bool private _allowInternal = false;

    constructor(
        string memory tresName,
        IERC20 tToken,
        IERC20 deToken,
        uint256 votingTh,
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) ERC4626(tToken) {
        tOwner = msg.sender;
        treasName = tresName;
        treasToken = tToken;
        approvedToken[deToken] = true;
        _tokenList[0] = deToken;
        votingThres = votingTh;
    }

    /** @dev Primary authorized user modifier */
    modifier auth() {
        require(
            msg.sender == tOwner || _authUsers[msg.sender],
            "Not authorized"
        );
        _;
    }

    /** @dev check if token is Approved for joinTreasury
     *
     */
    function approvedTokens(IERC20 token) public view returns (bool) {
        return approvedToken[token];
    }

    /** @dev See all the approvedTokens of this treasury
     *
     */
    function tokensL() public view returns (IERC20[] memory) {
        return _tokenList;
    }

    /** @dev Authorized users of the treasury
     */
    function getAuth(address user) public view returns (bool) {
        return _authUsers[user];
    }

    /** @dev Check amount owed to the treasury by a proposal
     * @return
     */
    function owed(uint256 num) public view returns (uint256) {
        uint256 amount = proposalBook[num].withdraw -
            proposalBook[num].deposits;
        return (amount);
    }

    /**  @dev Check if proposal was executed after approval
     * @return
     */
    function executed(uint256 proposal) public view returns (bool) {
        return (proposalBook[proposal].executed);
    }

    /**
     * @dev Publicly verifies if a contract is a Compliant Policy
     * @param policyAddress The address of the proposed policy.
     * @return bool True if compliant, False if non-compliant or a normal wallet.
     */
    function checkCompliance(address policyAddress) public view returns (bool) {
        try
            IERC165(policyAddress).supportsInterface(
                type(ITreasuryPolicy).interfaceId
            )
        returns (bool isCompliant) {
            return isCompliant;
        } catch {
            // If the contract doesn't support ERC-165 or reverts, it is NOT compliant
            return false;
        }
    }

    /**
     * @dev SafeAdd function
     */
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        return a + b;
    }

    /** @dev Add an authorized user
     */
    function addAuth(address user) external {
        require(msg.sender == tOwner, "Not owner");
        _authUsers[user] = true;
    }

    /**  Add new approved deposit token
     * @return
     */
    function newToken(
        IERC20 token,
        uint256 proposal
    ) external auth returns (uint256) {
        require(proposalBook[proposal].request == ProposalType.ADD_TOKEN);
        approvedToken[token] = true;
        list += 1;
        _tokenList[list] = token;
        return list;
    }

    /** @dev Make a deposit to proposal creating new shares
     * - MUST be open proposal
     * - MUST NOT be a proposal that was previously closed
     * @param assets amount being deposited
     * @param receiver address of depositor, address receiving shares
     * @param proposal number of the proposal
     */
    function proposalDeposit(
        uint256 assets,
        address receiver,
        uint256 proposal
    ) public returns (uint256) {
        require(!closedProposals[proposal], "Proposal closed");
        require(proposalNum >= proposal, "Invalid proposal");

        _allowInternal = true;
        uint256 shares = super.deposit(assets, receiver);
        _allowInternal = false;
        totalShares[proposal] = add(totalShares[proposal], shares);
        uint256 cc = userBook[msg.sender][0].proposal + 1;
        userBook[receiver][proposal].deposit = add(
            userBook[receiver][proposal].deposit,
            shares
        );
        userBook[msg.sender][0].proposal = cc;
        userBook[msg.sender][cc].proposal = proposal;
        return shares;
    }

    /** @dev Make a deposit to proposal creating new shares
     * - MUST have proposalNumber
     * NOTE: using the proposalMint() will cause shares to not be accounted for in a proposal
     * @param shares amount being deposited
     * @param receiver address of depositor
     * @param proposal the number to open proposal
     */
    function proposalMint(
        uint256 shares,
        address receiver,
        uint256 proposal
    ) public returns (uint256) {
        require(!closedProposals[proposal], "Proposal closed");
        require(proposalNum <= proposal, "Invalid proposal");

        _allowInternal = true;
        uint256 assets = super.mint(shares, receiver);
        _allowInternal = false;
        totalShares[proposal] = add(totalShares[proposal], assets);
        uint256 cc = userBook[msg.sender][0].proposal + 1;
        userBook[receiver][proposal].deposit = add(
            userBook[receiver][proposal].deposit,
            assets
        );
        userBook[msg.sender][0].proposal = cc;
        userBook[msg.sender][cc].proposal = proposal;

        return assets;
    }

    /** @dev Burn shares, receive 1 to 1 value of assets
     * - MUST be a closed proposalNumber
     * - MUST NOT have a userDeposit amount less than or equal to userWithdrew amount
     * @param assets amount of shares being returned
     * @param receiver address of depositor
     * @param owner the address to receive the treasury token
     * @param proposal the number to closed proposal
     */
    function proposalWithdraw(
        uint256 assets,
        address receiver,
        address owner,
        uint256 proposal
    ) public returns (uint256) {
        require(closedProposals[proposal], "Proposal not closed");
        require(
            userBook[receiver][proposal].withdrew + assets <=
                userBook[receiver][proposal].deposit,
            "Insufficient deposit"
        );

        _allowInternal = true;
        uint256 shares = super.withdraw(assets, receiver, owner);
        _allowInternal = false;
        userBook[receiver][proposal].withdrew = add(
            userBook[receiver][proposal].withdrew,
            shares
        );

        return shares;
    }

    /** @dev Burn shares, receive 1 to 1 value of shares
     * - MUST have open proposal number
     * - MUST have userDeposit less than or equal to userWithdrawal
     * NOTE: using ERC 4626 redeem() will not account for proposalWithdrawal
     */
    function proposalRedeem(
        uint256 shares,
        address receiver,
        address owner,
        uint256 proposal
    ) public returns (uint256) {
        require(closedProposals[proposal], "Proposal not closed");
        require(
            userBook[receiver][proposal].withdrew <=
                userBook[receiver][proposal].deposit,
            "Invalid redeem state"
        );

        _allowInternal = true;
        uint256 assets = super.redeem(shares, receiver, owner);
        _allowInternal = false;
        userBook[receiver][proposal].withdrew = add(
            userBook[receiver][proposal].withdrew,
            assets
        );

        return assets;
    }
    /** @dev Issue new proposal
     * - MUST create new proposal number
     * - MUST account for amount to be withdrawn
     * @param amount token amount being withdrawn
     * @param receiver the address recevier the amount in tokens
     * @param owner address of proposalOwner
     * @param request if the proposal requires voting
     * ProposalType.CLOSE = amount(proposal to close), rest of values ignored
     */
    function proposalOpen(
        uint256 amount,
        address receiver,
        address owner,
        ProposalType request,
        IERC20 token
    ) external returns (uint256) {
        // If the caller is NOT authorized
        if (msg.sender != tOwner && !_authUsers[msg.sender]) {
            require(request == ProposalType.CLOSE, "You are not authorized");
            require(IERC20(treasToken).balanceOf(msg.sender) > 0);
        }

        if (request == ProposalType.TXNS) {
            require(checkCompliance(receiver));
        }

        uint256 num = proposalNum + 1;
        proposalBook[num].owner = owner;
        proposalBook[num].token = token;
        proposalBook[num].withdraw = amount;
        proposalBook[num].receiver = receiver;
        proposalBook[num].close = false;
        proposalBook[num].request = request;
        proposalBook[num].executed = false;
        proposalNum = num;

        emit proposalO(address(token), num, amount, receiver, request);
        return (num);
    }
    /** @dev Close an opened proposal
     * - MUST account for amount received
     * - MUST proposal must be greater than current proposal
     * @param proposal number of desired proposal to close
     */
    function proposalClose(uint256 proposal) external auth returns (bool) {
        require(proposalNum >= proposal, "Invalid proposal");
        require(!closedProposals[proposal], "Already closed");

        if (proposalBook[proposal].close) {
            closedProposals[proposal] = true;
        } else {
            require(msg.sender == tOwner, "Not owner");
            closedProposals[proposal] = true;
        }

        // Fetch the final financial state from the struct
        uint256 returned = proposalBook[proposal].deposits;
        uint256 sent = proposalBook[proposal].withdraw;

        emit proposalC(proposal, true, msg.sender, returned, sent);
        return true;
    }
    /** @dev Vote for shareholder to close proposal
    // Optional veto policy
    * - MUST be a user who deposited to proposal
    */
    function vote(uint256 proposal) public view returns (bool) {
        uint256 shares = totalShares[proposal];

        if (proposalBook[proposal].request == ProposalType.TXNS) {
            // value-ratio voting: require total shares for proposal >= requested withdraw amount
            return shares >= proposalBook[proposal].withdraw;
        } else {
            // supply-based voting: require shares >= (total * votingThresholdBps) / 10000
            uint256 total = IERC20(treasToken).totalSupply();

            return shares * 10000 >= total * votingThres;
        }
    }
    /** @dev  Transfer tokens to policy for approved policies
     * - MUST be open proposal
     * - MUST be approved proposal
     * - MUST check if policy was executed
     *
     */
    function proposalApproved(uint256 proposal) public returns (bool) {
        // check if proposal voting if approved
        require(!closedProposals[proposal]);
        require(!proposalBook[proposal].executed);

        if (proposalBook[proposal].request == ProposalType.CLOSE) {
            require(vote(proposal), "Vote failed");
            uint256 closing = proposalBook[proposal].withdraw;
            proposalBook[closing].close = true;
            this.proposalClose(closing);
            this.proposalClose(proposal);
            return true;
        } else if (proposalBook[proposal].request != ProposalType.TXNS) {
            return false;
        }

        address receiver = proposalBook[proposal].receiver;
        uint256 amount = proposalBook[proposal].withdraw;
        IERC20 token = proposalBook[proposal].token;

        // check if amount is owned by treasury
        require(
            token.balanceOf(address(this)) >= amount,
            "Insufficient balance"
        );

        require(vote(proposal), "Vote failed");
        proposalBook[proposal].executed = true;
        SafeERC20.safeTransfer(proposalBook[proposal].token, receiver, amount);
        //emit + Proposal executed
        return true;
    }
    /** @dev Accounting for tokens deposited
     * - treasuryToken is issued on deposited
     * - MUST be approved deposit token
     * @param token address of ERC20 token
     * @param amount number of assets being deposited
     **/
    function joinTreasury(IERC20 token, uint256 amount) external {
        require(approvedToken[token], "Not an approved deposit token");
        require(amount > 0, "Amount can not be zero");
        UserDeposit storage deposits = addFunds[depositNum];

        depositNum = depositNum + 1;
        deposits.num = depositNum;
        deposits.amount = amount;
        deposits.token = token;
        deposits.time = block.timestamp;
        deposits.owner = msg.sender;

        SafeERC20.safeTransferFrom(token, msg.sender, address(this), amount);
        ITreasuryToken(address(treasToken)).mintTreasury(msg.sender, amount);
    }
    /** @dev Funds being return
     * - Does not issue treasuryToken
     * - MUST
     */
    function depositTreasury(
        IERC20 token,
        uint256 amount,
        bool proposal,
        uint256 num
    ) public returns (bool) {
        require(amount > 0, "Amount must be greater than zero");
        require(closedProposals[num]);
        address sender = proposalBook[num].receiver;

        if (proposal) {
            proposalBook[num].deposits = proposalBook[num].deposits + amount;
        }

        SafeERC20.safeTransferFrom(token, sender, address(this), amount);
        emit FundsAdded(address(token), amount, block.timestamp, sender);
        return true;
    }

    function deposit(
        uint256 assets,
        address receiver
    ) public override returns (uint256) {
        require(
            _allowInternal,
            "Direct deposit not allowed, use proposalDeposit"
        );
        return super.deposit(assets, receiver);
    }

    function mint(
        uint256 shares,
        address receiver
    ) public override returns (uint256) {
        require(_allowInternal, "Direct mint not allowed, use proposalMint");
        return super.mint(shares, receiver);
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public override returns (uint256) {
        require(
            _allowInternal,
            "Direct redeem not allowed, use proposalRedeem"
        );
        return super.redeem(shares, receiver, owner);
    }

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public override returns (uint256) {
        require(
            _allowInternal,
            "Direct withdraw not allowed, use proposalWithdraw"
        );
        return super.withdraw(assets, receiver, owner);
    }
}
