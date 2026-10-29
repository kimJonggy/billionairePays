// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BillSwipeTestBase} from "./BillSwipe.Base.t.sol";
import {BillSwipe} from "../BillSwipe.sol";

contract BillSwipeFuzzTest is BillSwipeTestBase {

    // ── createBill: arbitrary valid amounts ───────────────────────────────────

    /// @dev Any nonzero amount up to 1 B USDC should create a bill correctly.
    function testFuzz_CreateBill_AnyAmount(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000_000e6);
        usdc.mint(alice, amount);

        vm.prank(alice);
        uint256 id = bill.createBill(amount, META, block.timestamp + DEADLINE_OFFSET, address(0));

        BillSwipe.Bill memory b = bill.getBill(id);
        assertEq(b.amount, amount);
        assertEq(b.requester, alice);
        assertEq(uint8(b.status), uint8(BillSwipe.BillStatus.Open));
    }

    /// @dev deadline must be strictly > block.timestamp; any future ts works.
    function testFuzz_CreateBill_FutureDeadline(uint256 offset) public {
        offset = bound(offset, 1, 365 days);
        vm.prank(alice);
        uint256 id = bill.createBill(100e6, META, block.timestamp + offset, address(0));
        BillSwipe.Bill memory b = bill.getBill(id);
        assertGt(b.deadline, block.timestamp);
    }

    // ── payBill: fee arithmetic ────────────────────────────────────────────────

    /// @dev For any feeBps in [0, 200] and any amount in [1, 1 M USDC],
    ///      the requester receives exactly amount - fee and feeRecipient receives fee.
    function testFuzz_PayBill_FeeArithmetic(uint256 feeBps_, uint256 amount) public {
        feeBps_ = bound(feeBps_, 0, 200);
        amount  = bound(amount, 1, 1_000_000e6);

        // deploy a fresh instance with the fuzzed fee
        address fRecipient = feeBps_ > 0 ? feeRecipient : address(0);
        BillSwipe fBill = new BillSwipe(address(usdc), owner, feeBps_, fRecipient);

        usdc.mint(alice, amount);
        usdc.mint(bob,   amount);
        vm.prank(alice);
        usdc.approve(address(fBill), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(fBill), type(uint256).max);

        vm.prank(alice);
        uint256 id = fBill.createBill(amount, META, block.timestamp + DEADLINE_OFFSET, address(0));

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 feeBefore   = usdc.balanceOf(fRecipient);
        uint256 bobBefore   = usdc.balanceOf(bob);

        vm.prank(bob);
        fBill.payBill(id, NOTE);

        uint256 fee = (amount * feeBps_) / 10_000;
        uint256 net = amount - fee;

        // bob paid exactly `amount`
        assertEq(usdc.balanceOf(bob), bobBefore - amount);

        if (feeBps_ == 0) {
            // zero fee: full amount to requester
            assertEq(usdc.balanceOf(alice), aliceBefore + amount);
        } else if (fRecipient == alice) {
            // fee recipient == requester: full amount to requester (no split)
            assertEq(usdc.balanceOf(alice), aliceBefore + amount);
        } else {
            assertEq(usdc.balanceOf(alice),    aliceBefore + net);
            assertEq(usdc.balanceOf(fRecipient), feeBefore + fee);
        }
    }

    // ── contribute: partial amounts add up correctly ───────────────────────────

    /// @dev Two fuzzed contributions that together equal the bill amount
    ///      should mark the bill as Paid exactly.
    function testFuzz_Contribute_TwoPartsSumToBill(uint256 total, uint256 first) public {
        total = bound(total, 2, 1_000_000e6);
        first = bound(first, 1, total - 1);
        uint256 second = total - first;

        usdc.mint(alice, total);
        usdc.mint(bob,   total);
        usdc.mint(carol, total);

        uint256 id = _aliceCreatesBill(total);

        vm.prank(bob);
        bill.contribute(id, first, "");

        BillSwipe.Bill memory after1 = bill.getBill(id);
        assertEq(after1.funded, first);
        assertEq(uint8(after1.status), uint8(BillSwipe.BillStatus.Open));

        vm.prank(carol);
        bill.contribute(id, second, NOTE);

        BillSwipe.Bill memory after2 = bill.getBill(id);
        assertEq(after2.funded, total);
        assertEq(uint8(after2.status), uint8(BillSwipe.BillStatus.Paid));
    }

    /// @dev Single contribution for the exact remaining amount completes the bill.
    function testFuzz_Contribute_ExactRemaining(uint256 total) public {
        total = bound(total, 1, 1_000_000e6);
        usdc.mint(alice, total);
        usdc.mint(bob,   total);

        uint256 id = _aliceCreatesBill(total);

        vm.prank(bob);
        bill.contribute(id, total, NOTE);

        BillSwipe.Bill memory b = bill.getBill(id);
        assertEq(uint8(b.status), uint8(BillSwipe.BillStatus.Paid));
    }

    // ── contribute: overpay always reverts ────────────────────────────────────

    function testFuzz_Contribute_OverpayReverts(uint256 total, uint256 excess) public {
        total  = bound(total, 1, 1_000_000e6);
        excess = bound(excess, 1, 1_000_000e6);

        usdc.mint(alice, total);
        usdc.mint(bob,   total + excess + 1);

        uint256 id = _aliceCreatesBill(total);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(BillSwipe.OverpayNotAllowed.selector, total));
        bill.contribute(id, total + excess, "");
    }

    // ── setFee: boundary arithmetic ───────────────────────────────────────────

    /// @dev Any feeBps in [0, 200] with a nonzero recipient should be accepted.
    function testFuzz_SetFee_ValidRange(uint256 feeBps_) public {
        feeBps_ = bound(feeBps_, 1, 200);
        vm.prank(owner);
        bill.setFee(feeBps_, feeRecipient);
        assertEq(bill.feeBps(), feeBps_);
        assertEq(bill.feeRecipient(), feeRecipient);
    }

    /// @dev Any feeBps above 200 should revert.
    function testFuzz_SetFee_TooHighReverts(uint256 feeBps_) public {
        feeBps_ = bound(feeBps_, 201, type(uint256).max);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(BillSwipe.FeeTooHigh.selector, feeBps_));
        bill.setFee(feeBps_, feeRecipient);
    }

    // ── createBill: deadline at or before current timestamp always reverts ─────

    function testFuzz_CreateBill_PastDeadlineReverts(uint256 offset) public {
        vm.warp(100_000);
        offset = bound(offset, 0, block.timestamp);
        uint256 deadline = block.timestamp - offset;

        vm.prank(alice);
        vm.expectRevert(BillSwipe.DeadlineMustBeFuture.selector);
        bill.createBill(100e6, META, deadline, address(0));
    }
}
