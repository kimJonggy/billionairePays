// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract BillSwipe is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    enum BillStatus {
        Open,
        Paid,
        Cancelled,
        Expired
    }

    struct Bill {
        uint256 id;
        address requester;
        address payoutAddress;
        uint256 amount;
        uint256 funded;
        string metadataURI;
        uint256 deadline;
        BillStatus status;
        address paidBy;
        uint256 paidAt;
        string txNote;
    }

    mapping(uint256 => Bill) public bills;
    uint256 public billCount;
    mapping(address => uint256) public openBillCount;

    uint256 public constant MAX_OPEN_BILLS = 5;
    uint256 public constant MAX_FEE_BPS = 200;

    uint256 public feeBps;
    address public feeRecipient;
    IERC20 public immutable usdc;

    error BillNotFound(uint256 id);
    error BillNotOpen(uint256 id);
    error NotRequester(uint256 id);
    error TooManyOpenBills(address requester);
    error AmountIsZero();
    error DeadlineMustBeFuture();
    error SelfPayNotAllowed();
    error OverpayNotAllowed(uint256 remaining);
    error FeeTooHigh(uint256 feeBps);
    error InvalidFeeRecipient();
    error ZeroAddress();
    error MetadataURIEmpty();

    event BillCreated(
        uint256 indexed id,
        address indexed requester,
        address payoutAddress,
        uint256 amount,
        string metadataURI,
        uint256 deadline
    );
    event BillPaid(
        uint256 indexed id,
        address indexed payer,
        address indexed requester,
        uint256 amount,
        string txNote,
        uint256 timestamp
    );
    event BillContribution(uint256 indexed id, address indexed contributor, uint256 amount, uint256 funded, uint256 total);
    event BillPassed(uint256 indexed id, address indexed passer, uint256 timestamp);
    event BillCancelled(uint256 indexed id, address indexed requester);
    event BillExpired(uint256 indexed id);
    event FeeUpdated(uint256 feeBps, address feeRecipient);

    /// @notice Creates a new BillSwipe contract.
    /// @param _usdc The USDC token address used for bill payments.
    /// @param _owner The owner address for administrative controls.
    /// @param _feeBps The protocol fee in basis points.
    /// @param _feeRecipient The address that receives protocol fees when enabled.
    constructor(address _usdc, address _owner, uint256 _feeBps, address _feeRecipient) Ownable(_owner) {
        if (_usdc == address(0)) revert ZeroAddress();
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh(_feeBps);
        if (_feeBps > 0 && _feeRecipient == address(0)) revert InvalidFeeRecipient();

        usdc = IERC20(_usdc);
        feeBps = _feeBps;
        feeRecipient = _feeRecipient;
    }

    /// @notice Creates a new bill request.
    /// @param amount The requested gross amount in USDC smallest units.
    /// @param metadataURI The metadata URI (for example, IPFS URI).
    /// @param deadline The UNIX timestamp after which bill can be expired.
    /// @return billId The newly created bill id.
    function createBill(
        uint256 amount,
        string calldata metadataURI,
        uint256 deadline,
        address payoutAddress
    ) external whenNotPaused returns (uint256 billId) {
        if (amount == 0) revert AmountIsZero();
        if (bytes(metadataURI).length == 0) revert MetadataURIEmpty();
        if (deadline <= block.timestamp) revert DeadlineMustBeFuture();
        if (openBillCount[msg.sender] >= MAX_OPEN_BILLS) revert TooManyOpenBills(msg.sender);
        if (payoutAddress == address(0)) payoutAddress = msg.sender;

        billId = ++billCount;
        bills[billId] = Bill({
            id: billId,
            requester: msg.sender,
            payoutAddress: payoutAddress,
            amount: amount,
            funded: 0,
            metadataURI: metadataURI,
            deadline: deadline,
            status: BillStatus.Open,
            paidBy: address(0),
            paidAt: 0,
            txNote: ""
        });

        openBillCount[msg.sender] += 1;

        emit BillCreated(billId, msg.sender, payoutAddress, amount, metadataURI, deadline);
    }

    /// @notice Pays the remaining amount of an open bill in one transaction.
    /// @param id The bill id.
    /// @param txNote An optional note attached to the payment.
    function payBill(uint256 id, string calldata txNote) external nonReentrant whenNotPaused {
        Bill storage bill = _requireOpenBill(id);

        if (msg.sender == bill.payoutAddress) revert SelfPayNotAllowed();

        uint256 remaining = bill.amount - bill.funded;
        uint256 fee = (remaining * feeBps) / 10_000;

        _collectPayment(msg.sender, bill.payoutAddress, remaining, fee);

        bill.funded = bill.amount;
        bill.status = BillStatus.Paid;
        bill.paidBy = msg.sender;
        bill.paidAt = block.timestamp;
        bill.txNote = txNote;

        _decrementOpenBillCount(bill.requester);

        emit BillPaid(id, msg.sender, bill.requester, bill.amount, txNote, block.timestamp);
    }

    /// @notice Contributes a partial or full remaining amount to an open bill.
    /// @param id The bill id.
    /// @param amount The contribution amount in USDC smallest units.
    /// @param txNote An optional note stored if this contribution completes the bill.
    function contribute(uint256 id, uint256 amount, string calldata txNote) external nonReentrant whenNotPaused {
        Bill storage bill = _requireOpenBill(id);

        if (msg.sender == bill.payoutAddress) revert SelfPayNotAllowed();
        if (amount == 0) revert AmountIsZero();

        uint256 remaining = bill.amount - bill.funded;
        if (amount > remaining) revert OverpayNotAllowed(remaining);

        uint256 fee = (amount * feeBps) / 10_000;
        _collectPayment(msg.sender, bill.payoutAddress, amount, fee);

        bill.funded += amount;

        emit BillContribution(id, msg.sender, amount, bill.funded, bill.amount);

        if (bill.funded >= bill.amount) {
            bill.status = BillStatus.Paid;
            bill.paidBy = msg.sender;
            bill.paidAt = block.timestamp;
            bill.txNote = txNote;

            _decrementOpenBillCount(bill.requester);

            emit BillPaid(id, msg.sender, bill.requester, bill.amount, txNote, block.timestamp);
        }
    }

    /// @notice Emits an event to indicate a bill was passed to another user.
    /// @param id The bill id.
    function passBill(uint256 id) external {
        _requireBillExists(id);
        emit BillPassed(id, msg.sender, block.timestamp);
    }

    /// @notice Cancels an open bill. Callable only by the bill requester.
    /// @param id The bill id.
    function cancelBill(uint256 id) external {
        Bill storage bill = _requireOpenBill(id);
        if (msg.sender != bill.requester) revert NotRequester(id);

        bill.status = BillStatus.Cancelled;
        _decrementOpenBillCount(bill.requester);

        emit BillCancelled(id, bill.requester);
    }

    /// @notice Marks an open bill as expired if its deadline has passed.
    /// @param id The bill id.
    function markExpired(uint256 id) external {
        Bill storage bill = _requireOpenBill(id);
        if (block.timestamp <= bill.deadline) revert DeadlineMustBeFuture();

        bill.status = BillStatus.Expired;
        _decrementOpenBillCount(bill.requester);

        emit BillExpired(id);
    }

    /// @notice Updates protocol fee settings.
    /// @param newFeeBps The new fee in basis points.
    /// @param newFeeRecipient The new fee recipient address.
    function setFee(uint256 newFeeBps, address newFeeRecipient) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh(newFeeBps);
        if (newFeeBps > 0 && newFeeRecipient == address(0)) revert InvalidFeeRecipient();

        feeBps = newFeeBps;
        feeRecipient = newFeeRecipient;

        emit FeeUpdated(newFeeBps, newFeeRecipient);
    }

    /// @notice Pauses create and payment operations.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpauses create and payment operations.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Blocks ownership renunciation while the contract is paused to prevent permanent bricking.
    function renounceOwnership() public override onlyOwner {
        if (paused()) revert("BillSwipe: renounce blocked while paused");
        super.renounceOwnership();
    }

    /// @notice Returns a bill by id.
    /// @param id The bill id.
    /// @return The full Bill struct.
    function getBill(uint256 id) external view returns (Bill memory) {
        _requireBillExists(id);
        return bills[id];
    }

    /// @notice Returns the number of currently open bills for a user.
    /// @param user The user wallet address.
    /// @return The user's open bill count.
    function getOpenBillCount(address user) external view returns (uint256) {
        return openBillCount[user];
    }

    function _requireBillExists(uint256 id) internal view {
        if (id == 0 || id > billCount) revert BillNotFound(id);
    }

    function _requireOpenBill(uint256 id) internal view returns (Bill storage bill) {
        _requireBillExists(id);
        bill = bills[id];
        if (bill.status != BillStatus.Open) revert BillNotOpen(id);
    }

    function _decrementOpenBillCount(address requester) internal {
        uint256 current = openBillCount[requester];
        if (current > 0) {
            openBillCount[requester] = current - 1;
        }
    }

    function _collectPayment(address payer, address payoutAddress, uint256 grossAmount, uint256 fee) internal {
        if (fee == 0) {
            usdc.safeTransferFrom(payer, payoutAddress, grossAmount);
            return;
        }

        uint256 netAmount = grossAmount - fee;

        if (feeRecipient == payoutAddress) {
            usdc.safeTransferFrom(payer, payoutAddress, grossAmount);
            return;
        }

        usdc.safeTransferFrom(payer, payoutAddress, netAmount);
        usdc.safeTransferFrom(payer, feeRecipient, fee);
    }
}
