// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BillSwipeTestBase} from "./BillSwipe.Base.t.sol";
import {BillSwipe} from "../BillSwipe.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract BillSwipeRevertTest is BillSwipeTestBase {

    // ── createBill ────────────────────────────────────────────────────────────

    function test_Revert_CreateBill_AmountZero() public {
        vm.prank(alice);
        vm.expectRevert(BillSwipe.AmountIsZero.selector);
        bill.createBill(0, META, block.timestamp + DEADLINE_OFFSET, address(0));
    }

    function test_Revert_CreateBill_EmptyMetadata() public {
        vm.prank(alice);
        vm.expectRevert(BillSwipe.MetadataURIEmpty.selector);
        bill.createBill(100e6, "", block.timestamp + DEADLINE_OFFSET, address(0));
    }

    function test_Revert_CreateBill_DeadlineInPast() public {
        vm.prank(alice);
        vm.expectRevert(BillSwipe.DeadlineMustBeFuture.selector);
        bill.createBill(100e6, META, block.timestamp, address(0));
    }

    function test_Revert_CreateBill_DeadlineBeforeNow() public {
        vm.warp(1_000_000);
        vm.prank(alice);
        vm.expectRevert(BillSwipe.DeadlineMustBeFuture.selector);
        bill.createBill(100e6, META, block.timestamp - 1, address(0));
    }

    function test_Revert_CreateBill_TooManyOpenBills() public {
        // create MAX_OPEN_BILLS (5) bills for alice
        for (uint256 i = 0; i < 5; i++) {
            _aliceCreatesBill(100e6 + i);
        }
        // 6th should revert
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BillSwipe.TooManyOpenBills.selector, alice));
        bill.createBill(100e6, META, block.timestamp + DEADLINE_OFFSET, address(0));
    }

    function test_Revert_CreateBill_WhenPaused() public {
        vm.prank(owner);
        bill.pause();

        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        bill.createBill(100e6, META, block.timestamp + DEADLINE_OFFSET, address(0));
    }

    // ── payBill ───────────────────────────────────────────────────────────────

    function test_Revert_PayBill_NotFound_IdZero() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(BillSwipe.BillNotFound.selector, 0));
        bill.payBill(0, NOTE);
    }

    function test_Revert_PayBill_NotFound_IdTooHigh() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(BillSwipe.BillNotFound.selector, 99));
        bill.payBill(99, NOTE);
    }

    function test_Revert_PayBill_NotOpen_AfterPaid() public {
        uint256 id = _aliceCreatesBill(100e6);
        vm.prank(bob);
        bill.payBill(id, NOTE);

        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(BillSwipe.BillNotOpen.selector, id));
        bill.payBill(id, "");
    }

    function test_Revert_PayBill_NotOpen_AfterCancelled() public {
        uint256 id = _aliceCreatesBill(100e6);
        vm.prank(alice);
        bill.cancelBill(id);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(BillSwipe.BillNotOpen.selector, id));
        bill.payBill(id, "");
    }

    function test_Revert_PayBill_SelfPay() public {
        uint256 id = _aliceCreatesBill(100e6);
        vm.prank(alice);
        vm.expectRevert(BillSwipe.SelfPayNotAllowed.selector);
        bill.payBill(id, NOTE);
    }

    function test_Revert_PayBill_WhenPaused() public {
        uint256 id = _aliceCreatesBill(100e6);
        vm.prank(owner);
        bill.pause();

        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        bill.payBill(id, NOTE);
    }

    // ── contribute ────────────────────────────────────────────────────────────

    function test_Revert_Contribute_BillNotFound() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(BillSwipe.BillNotFound.selector, 1));
        bill.contribute(1, 50e6, "");
    }

    function test_Revert_Contribute_BillNotOpen() public {
        uint256 id = _aliceCreatesBill(100e6);
        vm.prank(bob);
        bill.payBill(id, NOTE);

        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(BillSwipe.BillNotOpen.selector, id));
        bill.contribute(id, 50e6, "");
    }

    function test_Revert_Contribute_SelfPay() public {
        uint256 id = _aliceCreatesBill(100e6);
        vm.prank(alice);
        vm.expectRevert(BillSwipe.SelfPayNotAllowed.selector);
        bill.contribute(id, 50e6, "");
    }

    function test_Revert_Contribute_AmountZero() public {
        uint256 id = _aliceCreatesBill(100e6);
        vm.prank(bob);
        vm.expectRevert(BillSwipe.AmountIsZero.selector);
        bill.contribute(id, 0, "");
    }

    function test_Revert_Contribute_Overpay() public {
        uint256 total = 100e6;
        uint256 id = _aliceCreatesBill(total);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(BillSwipe.OverpayNotAllowed.selector, total));
        bill.contribute(id, total + 1, "");
    }

    function test_Revert_Contribute_OverpayAfterPartial() public {
        uint256 total   = 100e6;
        uint256 firstPay = 40e6;
        uint256 id = _aliceCreatesBill(total);

        vm.prank(bob);
        bill.contribute(id, firstPay, "");

        uint256 remaining = total - firstPay;
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(BillSwipe.OverpayNotAllowed.selector, remaining));
        bill.contribute(id, remaining + 1, "");
    }

    function test_Revert_Contribute_WhenPaused() public {
        uint256 id = _aliceCreatesBill(100e6);
        vm.prank(owner);
        bill.pause();

        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        bill.contribute(id, 50e6, "");
    }

    // ── passBill ──────────────────────────────────────────────────────────────

    function test_Revert_PassBill_BillNotFound_Zero() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(BillSwipe.BillNotFound.selector, 0));
        bill.passBill(0);
    }

    function test_Revert_PassBill_BillNotFound_TooHigh() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(BillSwipe.BillNotFound.selector, 42));
        bill.passBill(42);
    }

    // ── cancelBill ────────────────────────────────────────────────────────────

    function test_Revert_CancelBill_NotFound() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BillSwipe.BillNotFound.selector, 1));
        bill.cancelBill(1);
    }

    function test_Revert_CancelBill_NotOpen() public {
        uint256 id = _aliceCreatesBill(100e6);
        vm.prank(alice);
        bill.cancelBill(id);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BillSwipe.BillNotOpen.selector, id));
        bill.cancelBill(id);
    }

    function test_Revert_CancelBill_NotRequester() public {
        uint256 id = _aliceCreatesBill(100e6);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(BillSwipe.NotRequester.selector, id));
        bill.cancelBill(id);
    }

    // ── markExpired ───────────────────────────────────────────────────────────

    function test_Revert_MarkExpired_BillNotFound() public {
        vm.expectRevert(abi.encodeWithSelector(BillSwipe.BillNotFound.selector, 1));
        bill.markExpired(1);
    }

    function test_Revert_MarkExpired_BillNotOpen() public {
        uint256 id = _aliceCreatesBill(100e6);
        vm.prank(alice);
        bill.cancelBill(id);

        vm.expectRevert(abi.encodeWithSelector(BillSwipe.BillNotOpen.selector, id));
        bill.markExpired(id);
    }

    function test_Revert_MarkExpired_DeadlineNotReached_AtExact() public {
        uint256 id = _aliceCreatesBill(100e6);
        BillSwipe.Bill memory b = bill.getBill(id);
        // at exactly deadline timestamp, strict > requires timestamp > deadline → still reverts
        vm.warp(b.deadline);
        vm.expectRevert(BillSwipe.DeadlineMustBeFuture.selector);
        bill.markExpired(id);
    }

    function test_Revert_MarkExpired_DeadlineNotReached_Before() public {
        uint256 id = _aliceCreatesBill(100e6);
        BillSwipe.Bill memory b = bill.getBill(id);
        vm.warp(b.deadline - 1);
        vm.expectRevert(BillSwipe.DeadlineMustBeFuture.selector);
        bill.markExpired(id);
    }

    // ── setFee ────────────────────────────────────────────────────────────────

    function test_Revert_SetFee_NonOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        bill.setFee(100, feeRecipient);
    }

    function test_Revert_SetFee_TooHigh() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(BillSwipe.FeeTooHigh.selector, 201));
        bill.setFee(201, feeRecipient);
    }

    function test_Revert_SetFee_InvalidRecipient() public {
        vm.prank(owner);
        vm.expectRevert(BillSwipe.InvalidFeeRecipient.selector);
        bill.setFee(50, address(0));
    }

    // ── pause / unpause ───────────────────────────────────────────────────────

    function test_Revert_Pause_NonOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        bill.pause();
    }

    function test_Revert_Unpause_NonOwner() public {
        vm.prank(owner);
        bill.pause();

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        bill.unpause();
    }

    // ── renounceOwnership while paused ────────────────────────────────────────

    function test_Revert_RenounceOwnership_WhilePaused() public {
        vm.prank(owner);
        bill.pause();

        vm.prank(owner);
        vm.expectRevert(bytes("BillSwipe: renounce blocked while paused"));
        bill.renounceOwnership();
    }

    function test_Revert_RenounceOwnership_NonOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        bill.renounceOwnership();
    }
}
