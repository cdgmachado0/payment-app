// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.14;


import '../../libraries/LibCommon.sol';
import '../../Errors.sol';
// import '../ozDiamond.sol';
import './ozLoupeFacetV1_1.sol';
import { AccData } from '../AppStorage.sol';
import '../facets/ozLoupeFacet.sol';
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import 'hardhat/console.sol';

contract ozMiddlewareL2 is Initializable {

    using LibCommon for bytes;

    address payable private immutable OZL;

    bytes accData;

    event NewToken(address indexed newToken);
    event NewSlippage(uint16 indexed newSlippage);

    constructor(address payable ozDiamond_) {
        OZL = ozDiamond_;
    }

    //--------
    modifier onlyUser() {
        (address user,,) = accData.extract();
        if (msg.sender != user) revert NotAuthorized(msg.sender);
        _;
    }

    modifier checkToken(address newToken_) {
        if (newToken_ == address(0)) revert CantBeZero('address');
        if (!ozLoupeFacet(OZL).queryTokenDatabase(newToken_)) revert TokenNotInDatabase(newToken_);
        _;
    }

    modifier checkSlippage(uint newSlippage_) {
        if (newSlippage_ < 1 || newSlippage_ > 500) revert CantBeZero('slippage');
        _;
    }

    function initialize(bytes memory accData_) external initializer {
        accData = accData_;
    }
    //----------

    function exchangeToAccountToken(
        bytes memory accData_,
        uint amountToSend_,
        address account_
    ) external payable {
        (address user,,) = LibCommon.extract(accData_);

        if (!_verify(user, msg.sender)) revert NotAccount();

        (address[] memory accounts,) = ozLoupeFacetV1_1(OZL).getAccountsByUser(user);
        assert(accounts.length > 0);

        if (amountToSend_ <= 0) revert CantBeZero('amountToSend');
        if (!(msg.value > 0)) revert CantBeZero('contract balance');

        assert(account_ == msg.sender);

        (bool success,) = OZL.call{value: msg.value}(msg.data);
        require(success);
    }


    function _verify(address user_, address account_) private view returns(bool) {
        bytes memory task_name = ozLoupeFacetV1_1(OZL).getTask_Name(user_, account_);
        return bytes32(task_name) != bytes32(0);
    }


    //-------

    function changeToken(
        address newToken_
    ) external checkToken(newToken_) onlyUser { 
        (address user,,uint16 slippage) = accData.extract();
        accData = bytes.concat(bytes20(user), bytes20(newToken_), bytes2(slippage));
        emit NewToken(newToken_);
    }

    function changeSlippage(
        uint16 newSlippage_
    ) external checkSlippage(newSlippage_) onlyUser { 
        (address user, address token,) = accData.extract();
        accData = bytes.concat(bytes20(user), bytes20(token), bytes2(newSlippage_));
        emit NewSlippage(newSlippage_);
    }

    function changeTokenNSlippage( 
        address newToken_, 
        uint16 newSlippage_
    ) external checkToken(newToken_) checkSlippage(newSlippage_) onlyUser {
        (address user,,) = accData.extract();
        accData = bytes.concat(bytes20(user), bytes20(newToken_), bytes2(newSlippage_));
        emit NewToken(newToken_);
        emit NewSlippage(newSlippage_);
    } 

    function getDetails() external view returns(
        address user, 
        address token, 
        uint16 slippage
    ) {
        (user, token, slippage) = accData.extract();
    }

    function withdrawETH_lastResort() external onlyUser { 
        (bool success, ) = payable(msg.sender).call{value: address(this).balance}('');
        if (!success) revert CallFailed('ozPayMe: withdrawETH_lastResort failed');
    }

}