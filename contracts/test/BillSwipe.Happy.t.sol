// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BillSwipeTestBase} from "./BillSwipe.Base.t.sol";
import {BillSwipe} from "../BillSwipe.sol";

contract BillSwipeHappyTest is BillSwipeTestBase {

    // ── createBill ────────────────────────────────────────────────────────────

    function test_CreateBill_IncrementsBillCount() public {
        _aliceCreatesBill(100e6);
        assertEq(bill.billCount(), 1);
    }

    function test_CreateBill_ReturnsCorrectId() public {
        uint256 id = _aliceCreatesBill(100e6);
        assertEq(id, 1);
        uint256 id2 = _aliceCreatesBill(200e6);
        assertEq(id2, 2);
    }

    function test_CreateBill_StoresFields() public {
        uint256 deadline = block.timestamp + 3 days;
        vm.prank(alice);
        uint256 id = bill.createBill(500e6, META, deadline, address(0));

        BillSwipe.Bill memory b = bill.getBill(id);
        assertEq(b.id,            id);
        assertEq(b.requester,     alice);
        assertEq(b.payoutAddress, alice);  // defaults to msg.sender
        assertEq(b.amount,        500e6);
        assertEq(b.funded,        0);
        assertEq(b.deadline,      deadline);
        assertEq(b.metadataURI,   META);
        assertEq(uint8(b.status), uint8(BillSwipe.BillStatus.Open));
        assertEq(b.paidBy,        address(0));
        assertEq(b.paidAt,        0);
    }

    function test_CreateBill_ExplicitPayoutAddress() public {
        address payout = makeAddr("payout");
        uint256 deadline = block.timestamp + 3 days;
        vm.prank(alice);
        uint256 id = bill.createBill(100e6, META, deadline, payout);

        BillSwipe.Bill memory b = bill.getBill(id);
        assertEq(b.requester,     alice);
        assertEq(b.payoutAddress, payout);
    }

    function test_PayBill_TransfersToPayoutAddress() public {
        address payout = makeAddr("payout");
        uint256 amount = 200e6;
        vm.prank(alice);
        uint256 id = bill.createBill(amount, META, block.timestamp + DEADLINE_OFFSET, payout);

        uint256 payoutBefore = usdc.balanceOf(payout);
        vm.prank(bob);
        bill.payBill(id, NOTE);

        assertEq(usdc.balanceOf(payout), payoutBefore + amount);
    }

    function test_CreateBill_IncrementsOpenBillCount() public {
        _aliceCreatesBill(100e6);
        assertEq(bill.openBillCount(alice), 1);
    }

    function test_CreateBill_EmitsBillCreated() public {
        uint256 deadline = block.timestamp + DEADLINE_OFFSET;
        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(bill));
        emit BillSwipe.BillCreated(1, alice, alice, 100e6, META, deadline);
        bill.createBill(100e6, META, deadline, address(0));
    }

    // ── payBill ───────────────────────────────────────────────────────────────

    function test_PayBill_TransfersFullAmountToRequester() public {
        uint256 amount = 200e6;
        uint256 id = _aliceCreatesBill(amount);

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore   = usdc.balanceOf(bob);

        vm.prank(bob);
        bill.payBill(id, NOTE);

        assertEq(usdc.balanceOf(alice), aliceBefore + amount);
        assertEq(usdc.balanceOf(bob),   bobBefore - amount);
    }

    function test_PayBill_SetsStatusPaid() public {
        uint256 id = _aliceCreatesBill(100e6);
        vm.prank(bob);
        bill.payBill(id, NOTE);

        BillSwipe.Bill memory b = bill.getBill(id);
        assertEq(uint8(b.status), uint8(BillSwipe.BillStatus.Paid));
    }

    function test_PayBill_SetsPaidByAndTimestamp() public {
        uint256 id = _aliceCreatesBill(100e6);
        uint256 ts = block.timestamp;
        vm.prank(bob);
        bill.payBill(id, NOTE);

        BillSwipe.Bill memory b = bill.getBill(id);
        assertEq(b.paidBy, bob);
        assertEq(b.paidAt, ts);
        assertEq(b.txNote, NOTE);
    }

    function test_PayBill_DecrementsOpenBillCount() public {
        uint256 id = _aliceCreatesBill(100e6);
        vm.prank(bob);
        bill.payBill(id, NOTE);
        assertEq(bill.openBillCount(alice), 0);
    }

    function test_PayBill_EmitsBillPaid() public {
        uint256 amount = 100e6;
        uint256 id = _aliceCreatesBill(amount);
        uint256 ts = block.timestamp;

        vm.prank(bob);
        vm.expectEmit(true, true, true, true, address(bill));
        emit BillSwipe.BillPaid(id, bob, alice, amount, NOTE, ts);
        bill.payBill(id, NOTE);
    }

    function test_PayBill_WithFee_SplitsPayment() public {
        // deploy a new instance with 100 bps (1%) fee
        BillSwipe fBill = new BillSwipe(address(usdc), owner, 100, feeRecipient);

        vm.prank(alice);
        usdc.approve(address(fBill), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(fBill), type(uint256).max);

        uint256 amount = 1_000e6;
        vm.prank(alice);
        uint256 id = fBill.createBill(amount, META, block.timestamp + DEADLINE_OFFSET, address(0));

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 feeBefore   = usdc.balanceOf(feeRecipient);

        vm.prank(bob);
        fBill.payBill(id, NOTE);

        uint256 fee    = (amount * 100) / 10_000;   // 10 USDC
        uint256 net    = amount - fee;

        assertEq(usdc.balanceOf(alice),        aliceBefore + net);
        assertEq(usdc.balanceOf(feeRecipient), feeBefore + fee);
    }

    // ── contribute ────────────────────────────────────────────────────────────

    function test_Contribute_PartialUpdatesState() public {
        uint256 total  = 300e6;
        uint256 part   = 100e6;
        uint256 id = _aliceCreatesBill(total);

        vm.prank(bob);
        bill.contribute(id, part, "");

        BillSwipe.Bill memory b = bill.getBill(id);
        assertEq(b.funded, part);
        assertEq(uint8(b.status), uint8(BillSwipe.BillStatus.Open)); // still open
    }

    function test_Contribute_PartialEmitsContribution() public {
        uint256 total  = 300e6;
        uint256 part   = 100e6;
        uint256 id = _aliceCreatesBill(total);

        vm.prank(bob);
        vm.expectEmit(true, true, false, true, address(bill));
        emit BillSwipe.BillContribution(id, bob, part, part, total);
        bill.contribute(id, part, "");
    }

    function test_Contribute_FullAmountMarksPaid() public {
        uint256 total = 200e6;
        uint256 id = _aliceCreatesBill(total);

        vm.prank(bob);
        bill.contribute(id, total, NOTE);

        BillSwipe.Bill memory b = bill.getBill(id);
        assertEq(uint8(b.status), uint8(BillSwipe.BillStatus.Paid));
        assertEq(b.paidBy, bob);
        assertEq(b.txNote, NOTE);
    }

    function test_Contribute_FullAmountEmitsBothEvents() public {
        uint256 total = 200e6;
        uint256 id = _aliceCreatesBill(total);
        uint256 ts = block.timestamp;

        vm.prank(bob);
        vm.expectEmit(true, true, false, true, address(bill));
        emit BillSwipe.BillContribution(id, bob, total, total, total);
        vm.expectEmit(true, true, true, true, address(bill));
        emit BillSwipe.BillPaid(id, bob, alice, total, NOTE, ts);
        bill.contribute(id, total, NOTE);
    }

    function test_Contribute_TwoContributors() public {
        uint256 total = 300e6;
        uint256 id = _aliceCreatesBill(total);

        vm.prank(bob);
        bill.contribute(id, 100e6, "");

        vm.prank(carol);
        bill.contribute(id, 200e6, NOTE);

        BillSwipe.Bill memory b = bill.getBill(id);
        assertEq(uint8(b.status), uint8(BillSwipe.BillStatus.Paid));
        assertEq(b.funded, total);
    }

    function test_Contribute_DecrementsOpenCountOnCompletion() public {
        uint256 id = _aliceCreatesBill(100e6);
        vm.prank(bob);
        bill.contribute(id, 100e6, "");
        assertEq(bill.openBillCount(alice), 0);
    }

    // ── passBill ──────────────────────────────────────────────────────────────

    function test_PassBill_EmitsEventForOpenBill() public {
        uint256 id = _aliceCreatesBill(100e6);
        uint256 ts = block.timestamp;

        vm.prank(bob);
        vm.expectEmit(true, true, false, true, address(bill));
        emit BillSwipe.BillPassed(id, bob, ts);
        bill.passBill(id);
    }

    function test_PassBill_EmitsEventForPaidBill() public {
        uint256 id = _aliceCreatesBill(100e6);
        vm.prank(bob);
        bill.payBill(id, NOTE);

        uint256 ts = block.timestamp;
        vm.prank(carol);
        vm.expectEmit(true, true, false, true, address(bill));
        emit BillSwipe.BillPassed(id, carol, ts);
        bill.passBill(id);  // any status is fine, bill must just exist
    }

    function test_PassBill_EmitsEventForCancelledBill() public {
        uint256 id = _aliceCreatesBill(100e6);
        vm.prank(alice);
        bill.cancelBill(id);

        uint256 ts = block.timestamp;
        vm.prank(bob);
        vm.expectEmit(true, true, false, true, address(bill));
        emit BillSwipe.BillPassed(id, bob, ts);
        bill.passBill(id);
    }

    // ── cancelBill ────────────────────────────────────────────────────────────

    function test_CancelBill_SetsStatusCancelled() public {
        uint256 id = _aliceCreatesBill(100e6);
        vm.prank(alice);
        bill.cancelBill(id);

        BillSwipe.Bill memory b = bill.getBill(id);
        assertEq(uint8(b.status), uint8(BillSwipe.BillStatus.Cancelled));
    }

    function test_CancelBill_DecrementsOpenBillCount() public {
        uint256 id = _aliceCreatesBill(100e6);
        vm.prank(alice);
        bill.cancelBill(id);
        assertEq(bill.openBillCount(alice), 0);
    }

    function test_CancelBill_EmitsBillCancelled() public {
        uint256 id = _aliceCreatesBill(100e6);
        vm.prank(alice);
        vm.expectEmit(true, true, false, false, address(bill));
        emit BillSwipe.BillCancelled(id, alice);
        bill.cancelBill(id);
    }

    // ── markExpired ───────────────────────────────────────────────────────────

    function test_MarkExpired_SetsStatusExpired() public {
        uint256 id = _aliceCreatesBill(100e6);
        BillSwipe.Bill memory b = bill.getBill(id);
        vm.warp(b.deadline + 1);

        bill.markExpired(id);
        BillSwipe.Bill memory after_ = bill.getBill(id);
        assertEq(uint8(after_.status), uint8(BillSwipe.BillStatus.Expired));
    }

    function test_MarkExpired_DecrementsOpenBillCount() public {
        uint256 id = _aliceCreatesBill(100e6);
        BillSwipe.Bill memory b = bill.getBill(id);
        vm.warp(b.deadline + 1);

        bill.markExpired(id);
        assertEq(bill.openBillCount(alice), 0);
    }

    function test_MarkExpired_EmitsBillExpired() public {
        uint256 id = _aliceCreatesBill(100e6);
        BillSwipe.Bill memory b = bill.getBill(id);
        vm.warp(b.deadline + 1);

        vm.expectEmit(true, false, false, false, address(bill));
        emit BillSwipe.BillExpired(id);
        bill.markExpired(id);
    }

    // ── setFee ────────────────────────────────────────────────────────────────

    function test_SetFee_UpdatesState() public {
        vm.prank(owner);
        bill.setFee(150, feeRecipient);
        assertEq(bill.feeBps(), 150);
        assertEq(bill.feeRecipient(), feeRecipient);
    }

    function test_SetFee_ToZeroClearsRecipient() public {
        vm.prank(owner);
        bill.setFee(100, feeRecipient);
        vm.prank(owner);
        bill.setFee(0, address(0));
        assertEq(bill.feeBps(), 0);
        assertEq(bill.feeRecipient(), address(0));
    }

    function test_SetFee_EmitsFeeUpdated() public {
        vm.prank(owner);
        vm.expectEmit(false, false, false, true, address(bill));
        emit BillSwipe.FeeUpdated(100, feeRecipient);
        bill.setFee(100, feeRecipient);
    }

    // ── pause / unpause ───────────────────────────────────────────────────────

    function test_Pause_SetsPausedTrue() public {
        vm.prank(owner);
        bill.pause();
        assertTrue(bill.paused());
    }

    function test_Unpause_SetsPausedFalse() public {
        vm.prank(owner);
        bill.pause();
        vm.prank(owner);
        bill.unpause();
        assertFalse(bill.paused());
    }

    // ── renounceOwnership ─────────────────────────────────────────────────────

    function test_RenounceOwnership_WhenNotPaused() public {
        vm.prank(owner);
        bill.renounceOwnership();
        assertEq(bill.owner(), address(0));
    }
}
