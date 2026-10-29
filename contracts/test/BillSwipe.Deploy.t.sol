// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BillSwipeTestBase} from "./BillSwipe.Base.t.sol";
import {BillSwipe} from "../BillSwipe.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract BillSwipeDeployTest is BillSwipeTestBase {

    // ── constructor: happy paths ───────────────────────────────────────────────

    function test_Deploy_StoresUSDC() public view {
        assertEq(address(bill.usdc()), address(usdc));
    }

    function test_Deploy_StoresOwner() public view {
        assertEq(bill.owner(), owner);
    }

    function test_Deploy_ZeroFeeByDefault() public view {
        assertEq(bill.feeBps(), 0);
    }

    function test_Deploy_ZeroFeeRecipientByDefault() public view {
        assertEq(bill.feeRecipient(), address(0));
    }

    function test_Deploy_WithFeeAndRecipient() public {
        BillSwipe b = new BillSwipe(address(usdc), owner, 100, feeRecipient);
        assertEq(b.feeBps(), 100);
        assertEq(b.feeRecipient(), feeRecipient);
    }

    function test_Deploy_BillCountZero() public view {
        assertEq(bill.billCount(), 0);
    }

    function test_Deploy_NotPaused() public view {
        assertFalse(bill.paused());
    }

    // ── constructor: revert paths ─────────────────────────────────────────────

    function test_Deploy_RevertZeroUSDC() public {
        vm.expectRevert(BillSwipe.ZeroAddress.selector);
        new BillSwipe(address(0), owner, 0, address(0));
    }

    /// @dev The contract's ZeroAddress check for _owner is unreachable because
    ///      Ownable(_owner) fires OwnableInvalidOwner first when owner==address(0).
    ///      Test asserts the ACTUAL revert (OwnableInvalidOwner) and is flagged as
    ///      a CONTRACT BUG in the report.
    function test_Deploy_RevertZeroOwner() public {
        bytes memory expectedErr = abi.encodeWithSelector(
            Ownable.OwnableInvalidOwner.selector,
            address(0)
        );
        vm.expectRevert(expectedErr);
        new BillSwipe(address(usdc), address(0), 0, address(0));
    }

    function test_Deploy_RevertFeeTooHigh() public {
        vm.expectRevert(abi.encodeWithSelector(BillSwipe.FeeTooHigh.selector, 201));
        new BillSwipe(address(usdc), owner, 201, feeRecipient);
    }

    function test_Deploy_RevertFeeWithZeroRecipient() public {
        vm.expectRevert(BillSwipe.InvalidFeeRecipient.selector);
        new BillSwipe(address(usdc), owner, 50, address(0));
    }
}
