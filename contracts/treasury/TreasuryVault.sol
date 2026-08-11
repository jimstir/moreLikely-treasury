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
        address closer
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
        ADD_TOKEN
    }

    struct userAccount {
        uint256 proposal;
        uint256 deposit;
        uint256 withdrew;
    }

    struct proposalAccount {
        ProposalType request; //For explict proposal types
        bool close; // For closing after an approved closeRequest
        address owner;
        uint256 withdraw; // amount being withdrawn from treasury
        address receiver; // the receiving address/contract
        bool vote; // true = value-ratio, false = 75% supply)
        bool executed; // if proposal has been executed(txns or close)
        IERC20 token; // For ADD_TOKEN proposalType, this holds the new token address
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

    address private _tOwner;
    //number of opened proposals
    uint256 private _proposalNum;
    uint256 private _depositNum;
    uint256 public votingThres;

    string private _name;
    uint256 private _list;
    IERC20 private _treasuryToken;
    IERC20[] private _tokenList;

    mapping(address => bool) private _authUsers;
    mapping(uint256 => uint256) private _totalShares;
    mapping(uint256 => bool) private _closedProposals;

    //Track the number of proposals a shareholder has voted in
    mapping(address => mapping(uint256 => userAccount)) internal userBook;
    //mapping(uint256 => ownerAccount) internal ownerBook;
    mapping(uint256 => proposalAccount) internal proposalBook;
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
        _tOwner = msg.sender;
        _name = tresName;
        _treasuryToken = tToken;
        approvedToken[deToken] = true;
        _tokenList[0] = deToken;
        votingThres = votingTh;
    }

    /** @dev Primary authorized user modifier */
    modifier auth() {
        require(
            msg.sender == _tOwner || _authUsers[msg.sender],
            "Not authorized"
        );
        _;
    }

    /** @dev Get the treasury name
     *
     */
    function treasuryName() public view returns (string memory) {
        return _name;
    }
    /** @dev Get the treasury token address
     *
     */
    function treasuryToken() public view returns (address) {
        return address(_treasuryToken);
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

    /**
     * @dev Get the treasury owner
     *
     */
    function whosOwner() public view returns (address) {
        return _tOwner;
    }

    /** @dev Check current total number of opened proposals
     * @return uint256
     */
    function proposalCheck() public view returns (uint256) {
        return _proposalNum;
    }

    /** @dev Authorized users of the treasury
     */
    function getAuth(address user) public view returns (bool) {
        return _authUsers[user];
    }

    /** @dev Amount deposited for shareToken by user
     * - MUST be an ERC20 address
     * @param user address of user
     * @param proposal number of the proposal the user deposited
     */
    function userDeposit(
        address user,
        uint256 proposal
    ) public view returns (uint256) {
        return userBook[user][proposal].deposit;
    }

    /** @dev Amount withdrawn from given proposal by the user
     * @param user address of user
     * @param proposal number of the proposal the user withdrew
     */
    function userWithdrew(
        address user,
        uint256 proposal
    ) public view returns (uint256) {
        return userBook[user][proposal].withdrew;
    }

    /** @dev The total number of proposals joined by the user
     * @param user address of user
     */
    function userNumOfProposal(address user) public view returns (uint256) {
        return userBook[user][0].proposal;
    }

    /** @dev The proposal number from the specific proposal joined by the user
     * @param user address of user
     * @param proposal the number the user was apart of
     * MUST NOT be zero
     */
    function userProposal(
        address user,
        uint256 proposal
    ) public view returns (uint256) {
        return userBook[user][proposal].proposal;
    }

    /** @dev Token used for given proposal
     * - MUST be ERC20 address
     * @param proposal number for requested token
     * @return token address
     */
    function proposalToken(uint256 proposal) external view returns (address) {
        return address(proposalBook[proposal].token);
    }

    /** @dev Amount withdrawn for given proposal
     */
    function getProposalWithdrawAmount(
        uint256 proposal
    ) external view returns (uint256) {
        return proposalBook[proposal].withdraw;
    }

    /** @dev The receiver for given proposal
     */
    function proposalReceiver(
        uint256 proposal
    ) external view returns (address) {
        return proposalBook[proposal].receiver;
    }

    /** @dev Total shares issued for a given proposal
     * NOTE: Number does not change after proposal closed and shares are redeemed
     */
    function totalShares(uint256 proposal) public view returns (uint256) {
        return _totalShares[proposal];
    }

    /** @dev Check if proposal is closed
     * @return true if closed
     */
    function closedProposal(uint256 proposal) public view returns (bool) {
        return _closedProposals[proposal];
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
        require(msg.sender == _tOwner, "Not owner");
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
        _list += 1;
        _tokenList[_list] = token;
        return _list;
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
        require(!closedProposal(proposal), "Proposal closed");
        require(proposalCheck() >= proposal, "Invalid proposal");

        _allowInternal = true;
        uint256 shares = super.deposit(assets, receiver);
        _allowInternal = false;
        _totalShares[proposal] = add(totalShares(proposal), shares);
        uint256 cc = userNumOfProposal(msg.sender) + 1;
        userBook[receiver][proposal].deposit = add(
            userDeposit(receiver, proposal),
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
        require(!closedProposal(proposal), "Proposal closed");
        require(proposalCheck() <= proposal, "Invalid proposal");

        _allowInternal = true;
        uint256 assets = super.mint(shares, receiver);
        _allowInternal = false;
        _totalShares[proposal] = add(totalShares(proposal), assets);
        uint256 cc = userNumOfProposal(msg.sender) + 1;
        userBook[receiver][proposal].deposit = add(
            userDeposit(receiver, proposal),
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
        require(closedProposal(proposal), "Proposal not closed");
        require(
            userWithdrew(receiver, proposal) + assets <=
                userDeposit(receiver, proposal),
            "Insufficient deposit"
        );

        _allowInternal = true;
        uint256 shares = super.withdraw(assets, receiver, owner);
        _allowInternal = false;
        userBook[receiver][proposal].withdrew = add(
            userWithdrew(receiver, proposal),
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
        require(closedProposal(proposal), "Proposal not closed");
        require(
            userWithdrew(receiver, proposal) <= userDeposit(receiver, proposal),
            "Invalid redeem state"
        );

        _allowInternal = true;
        uint256 assets = super.redeem(shares, receiver, owner);
        _allowInternal = false;
        userBook[receiver][proposal].withdrew = add(
            userWithdrew(receiver, proposal),
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
     * @param rate value ratio(true) or total supply 75%(false)
     * @param request if the proposal requires voting
     */
    function proposalOpen(
        uint256 amount,
        address receiver,
        address owner,
        bool rate,
        ProposalType request,
        IERC20 token
    ) external returns (uint256) {
        // If the caller is NOT authorized
        if (msg.sender != _tOwner && !_authUsers[msg.sender]) {
            require(request == ProposalType.CLOSE, "You are not authorized");
            require(IERC20(_treasuryToken).balanceOf(msg.sender) > 0);
        }

        if (request == ProposalType.TXNS) {
            require(checkCompliance(receiver));
        }

        uint256 num = proposalCheck() + 1;
        proposalBook[num].owner = owner;
        proposalBook[num].token = token;
        proposalBook[num].withdraw = amount;
        proposalBook[num].receiver = receiver;
        proposalBook[num].vote = rate;
        proposalBook[num].close = false;
        proposalBook[num].request = request;
        proposalBook[num].executed = false;
        _proposalNum = num;

        emit proposalO(address(token), num, amount, receiver, request);
        return (num);
    }
    /** @dev Close an opened proposal
     * - MUST account for amount received
     * - MUST proposal must be greater than current proposal
     * @param proposal number of desired proposal to close
     */
    function proposalClose(uint256 proposal) external auth returns (bool) {
        require(proposalCheck() >= proposal, "Invalid proposal");
        require(!closedProposal(proposal), "Already closed");

        if (proposalBook[proposal].close) {
            _closedProposals[proposal] = true;
        } else {
            require(msg.sender == _tOwner, "Not owner");
            _closedProposals[proposal] = true;
        }

        // Fetch the final financial state from the struct
        uint256 returned = proposalBook[proposal].deposits;
        uint256 sent = proposalBook[proposal].withdraw;

        emit proposalC(proposal, true, msg.sender);
        return true;
    }
    /** @dev Vote for shareholder to close proposal
    // Optional veto policy
    * - MUST be a user who deposited to proposal
    */
    function vote(uint256 proposal) public view returns (bool) {
        uint256 shares = _totalShares[proposal];

        if (proposalBook[proposal].vote) {
            // value-ratio voting: require total shares for proposal >= requested withdraw amount
            return shares >= proposalBook[proposal].withdraw;
        } else {
            // supply-based voting: require shares >= (total * votingThresholdBps) / 10000
            uint256 total = IERC20(_treasuryToken).totalSupply();
            // shares >= 75% * total
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
        require(!closedProposal(proposal));
        require(!proposalBook[proposal].executed);

        if (proposalBook[proposal].request == ProposalType.CLOSE) {
            require(vote(proposal), "Vote failed");
            proposalBook[proposal].close = true;
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
        UserDeposit storage deposits = addFunds[_depositNum];

        _depositNum = _depositNum + 1;
        deposits.num = _depositNum;
        deposits.amount = amount;
        deposits.token = token;
        deposits.time = block.timestamp;
        deposits.owner = msg.sender;

        SafeERC20.safeTransferFrom(token, msg.sender, address(this), amount);
        ITreasuryToken(address(_treasuryToken)).mintTreasury(
            msg.sender,
            amount
        );
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
        require(closedProposal(num));
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
