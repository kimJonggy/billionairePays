// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {BillSwipe} from "../BillSwipe.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

/// @dev Abstract base – shared actors, setUp, and helpers.
///      No test_* / testFuzz_* / invariant_* functions here.
abstract contract BillSwipeTestBase is Test {
    // ── actors ────────────────────────────────────────────────────────────────
    address internal owner        = makeAddr("owner");
    address internal alice        = makeAddr("alice");   // typical requester
    address internal bob          = makeAddr("bob");     // typical payer
    address internal carol        = makeAddr("carol");   // second payer / contributor
    address internal feeRecipient = makeAddr("feeRecipient");

    // ── contract handles ──────────────────────────────────────────────────────
    MockERC20  internal usdc;
    BillSwipe  internal bill;

    // ── constants ─────────────────────────────────────────────────────────────
    uint256 internal constant INITIAL_BALANCE = 1_000_000e6;  // 1 M USDC
    uint256 internal constant DEADLINE_OFFSET = 7 days;
    string  internal constant META = "ipfs://QmTest";
    string  internal constant NOTE = "thanks!";

    // ── setUp ─────────────────────────────────────────────────────────────────
    function setUp() public virtual {
        // deploy mock USDC (6 decimals, no hardcoded address needed)
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);

        // deploy BillSwipe with zero fee by default
        bill = new BillSwipe(address(usdc), owner, 0, address(0));

        // fund actors
        usdc.mint(alice,  INITIAL_BALANCE);
        usdc.mint(bob,    INITIAL_BALANCE);
        usdc.mint(carol,  INITIAL_BALANCE);

        // pre-approve BillSwipe for payers
        vm.prank(bob);
        usdc.approve(address(bill), type(uint256).max);
        vm.prank(carol);
        usdc.approve(address(bill), type(uint256).max);
        vm.prank(alice);
        usdc.approve(address(bill), type(uint256).max);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    /// @dev Creates a bill from `alice` and returns its id.
    ///      payoutAddress defaults to alice (address(0) → msg.sender in contract).
    function _aliceCreatesBill(uint256 amount) internal returns (uint256) {
        vm.prank(alice);
        return bill.createBill(amount, META, block.timestamp + DEADLINE_OFFSET, address(0));
    }

    /// @dev Creates a bill and returns id; caller specifies requester via prank.
    function _createBillAs(address requester, uint256 amount) internal returns (uint256) {
        usdc.mint(requester, INITIAL_BALANCE);
        vm.prank(requester, requester);
        usdc.approve(address(bill), type(uint256).max);
        vm.prank(requester);
        return bill.createBill(amount, META, block.timestamp + DEADLINE_OFFSET, address(0));
    }
}
