// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {BillSwipe} from "../BillSwipe.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

/// @dev Invariant handler – every action that can change openBillCount or
///      bill statuses is represented here.  The invariant asserts that
///      openBillCount[requester] always equals the number of bills whose
///      status is Open for that requester.
contract BillSwipeHandler is Test {

    BillSwipe  internal bill;
    MockERC20  internal usdc;

    // tracked requesters
    address[] internal actors;

    // ghost variable: expected open bill count per actor
    mapping(address => uint256) public ghostOpenCount;

    // total bills ever created (mirrors bill.billCount())
    uint256 public ghostBillCount;

    string  internal constant META = "ipfs://QmHandler";
    string  internal constant NOTE = "handler-note";
    uint256 internal constant DEADLINE_OFFSET = 7 days;

    constructor(BillSwipe _bill, MockERC20 _usdc, address[] memory _actors) {
        bill   = _bill;
        usdc   = _usdc;
        actors = _actors;

        for (uint256 i = 0; i < _actors.length; i++) {
            usdc.mint(_actors[i], 1_000_000e6);
            vm.prank(_actors[i]);
            usdc.approve(address(bill), type(uint256).max);
        }
    }

    // ── actions ───────────────────────────────────────────────────────────────

    /// Create a bill for a random actor.
    function createBill(uint256 actorSeed, uint256 amount) external {
        amount = bound(amount, 1, 100_000e6);
        address requester = actors[actorSeed % actors.length];

        // skip if already at cap
        if (bill.openBillCount(requester) >= bill.MAX_OPEN_BILLS()) return;

        usdc.mint(requester, amount + 1);
        vm.prank(requester);
        usdc.approve(address(bill), type(uint256).max);

        vm.prank(requester);
        bill.createBill(amount, META, block.timestamp + DEADLINE_OFFSET, address(0));

        ghostOpenCount[requester] += 1;
        ghostBillCount += 1;
    }

    /// Pay the full remaining amount of bill `idSeed % billCount`.
    function payBill(uint256 idSeed, uint256 payerSeed) external {
        if (bill.billCount() == 0) return;

        uint256 id = (idSeed % bill.billCount()) + 1;
        BillSwipe.Bill memory b = bill.getBill(id);
        if (b.status != BillSwipe.BillStatus.Open) return;

        address payer = actors[payerSeed % actors.length];
        if (payer == b.payoutAddress) return;

        uint256 remaining = b.amount - b.funded;
        uint256 needed    = remaining;
        usdc.mint(payer, needed + 1);
        vm.prank(payer);
        usdc.approve(address(bill), type(uint256).max);

        vm.prank(payer);
        bill.payBill(id, NOTE);

        ghostOpenCount[b.requester] -= 1;
    }

    /// Contribute a partial amount to bill `idSeed % billCount`.
    function contribute(uint256 idSeed, uint256 payerSeed, uint256 amount) external {
        if (bill.billCount() == 0) return;

        uint256 id = (idSeed % bill.billCount()) + 1;
        BillSwipe.Bill memory b = bill.getBill(id);
        if (b.status != BillSwipe.BillStatus.Open) return;

        address payer = actors[payerSeed % actors.length];
        if (payer == b.payoutAddress) return;

        uint256 remaining = b.amount - b.funded;
        if (remaining == 0) return;
        amount = bound(amount, 1, remaining);

        usdc.mint(payer, amount + 1);
        vm.prank(payer);
        usdc.approve(address(bill), type(uint256).max);

        vm.prank(payer);
        bill.contribute(id, amount, NOTE);

        // check if this contribution completed the bill
        BillSwipe.Bill memory after_ = bill.getBill(id);
        if (after_.status == BillSwipe.BillStatus.Paid) {
            ghostOpenCount[b.requester] -= 1;
        }
    }

    /// Cancel bill `idSeed % billCount` as its requester.
    function cancelBill(uint256 idSeed) external {
        if (bill.billCount() == 0) return;

        uint256 id = (idSeed % bill.billCount()) + 1;
        BillSwipe.Bill memory b = bill.getBill(id);
        if (b.status != BillSwipe.BillStatus.Open) return;

        vm.prank(b.requester);
        bill.cancelBill(id);

        ghostOpenCount[b.requester] -= 1;
    }

    /// Mark bill `idSeed % billCount` as expired if the deadline has passed.
    function markExpired(uint256 idSeed, uint256 warpSeconds) external {
        if (bill.billCount() == 0) return;

        uint256 id = (idSeed % bill.billCount()) + 1;
        BillSwipe.Bill memory b = bill.getBill(id);
        if (b.status != BillSwipe.BillStatus.Open) return;

        // warp past deadline
        uint256 target = b.deadline + bound(warpSeconds, 1, 30 days);
        vm.warp(target);

        bill.markExpired(id);

        ghostOpenCount[b.requester] -= 1;
    }

    // ── actor list ────────────────────────────────────────────────────────────
    function actorAt(uint256 i) external view returns (address) {
        return actors[i % actors.length];
    }
}

// ─────────────────────────────────────────────────────────────────────────────

contract BillSwipeInvariantTest is Test {

    BillSwipe        internal bill;
    MockERC20        internal usdc;
    BillSwipeHandler internal handler;

    address internal owner        = makeAddr("inv-owner");
    address internal feeRecipient = makeAddr("inv-feeRecipient");

    address[] internal actors;

    function setUp() public {
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        bill = new BillSwipe(address(usdc), owner, 0, address(0));

        // 4 distinct actors
        actors.push(makeAddr("inv-alice"));
        actors.push(makeAddr("inv-bob"));
        actors.push(makeAddr("inv-carol"));
        actors.push(makeAddr("inv-dave"));

        handler = new BillSwipeHandler(bill, usdc, actors);

        // focus fuzzer on the handler only
        targetContract(address(handler));
    }

    // ── invariant 1: ghost vs. contract openBillCount ─────────────────────────
    /// @dev openBillCount[actor] in the contract must always equal ghostOpenCount.
    function invariant_OpenBillCountMatchesGhost() public view {
        for (uint256 i = 0; i < actors.length; i++) {
            assertEq(
                bill.openBillCount(actors[i]),
                handler.ghostOpenCount(actors[i]),
                "openBillCount mismatch"
            );
        }
    }

    // ── invariant 2: openBillCount never exceeds MAX_OPEN_BILLS ──────────────
    function invariant_OpenBillCountNeverExceedsCap() public view {
        for (uint256 i = 0; i < actors.length; i++) {
            assertLe(
                bill.openBillCount(actors[i]),
                bill.MAX_OPEN_BILLS(),
                "openBillCount exceeded MAX_OPEN_BILLS"
            );
        }
    }

    // ── invariant 3: sum of per-actor openBillCounts == total Open bills ───────
    function invariant_SumOpenCountsMatchOpenBillsInStorage() public view {
        uint256 sumFromMap = 0;
        for (uint256 i = 0; i < actors.length; i++) {
            sumFromMap += bill.openBillCount(actors[i]);
        }

        // count Open bills directly in storage
        uint256 countOpen = 0;
        uint256 total = bill.billCount();
        for (uint256 id = 1; id <= total; id++) {
            (, , , , , , , BillSwipe.BillStatus status, , ,) = _getBillFields(id);
            if (status == BillSwipe.BillStatus.Open) countOpen++;
        }

        assertEq(sumFromMap, countOpen, "sum(openBillCount) != count(Open bills)");
    }

    // ── invariant 4: funded <= amount for every bill ──────────────────────────
    function invariant_FundedNeverExceedsAmount() public view {
        uint256 total = bill.billCount();
        for (uint256 id = 1; id <= total; id++) {
            (, , , uint256 amount, uint256 funded, , , , , ,) = _getBillFields(id);
            assertLe(funded, amount, "funded > amount");
        }
    }

    // ── invariant 5: billCount monotonically increases ────────────────────────
    //  (tracked via ghostBillCount == bill.billCount())
    function invariant_BillCountMatchesGhost() public view {
        assertEq(bill.billCount(), handler.ghostBillCount(), "billCount mismatch");
    }

    // ── helper: unpack public bills() mapping ────────────────────────────────
    function _getBillFields(uint256 id)
        internal
        view
        returns (
            uint256,              // id
            address,              // requester
            address,              // payoutAddress
            uint256,              // amount
            uint256,              // funded
            string memory,        // metadataURI
            uint256,              // deadline
            BillSwipe.BillStatus, // status
            address,              // paidBy
            uint256,              // paidAt
            string memory         // txNote
        )
    {
        return bill.bills(id);
    }
}
