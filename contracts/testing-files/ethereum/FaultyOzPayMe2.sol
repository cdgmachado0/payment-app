// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.14; 


import '@rari-capital/solmate/src/utils/ReentrancyGuard.sol';
import '@rari-capital/solmate/src/utils/SafeTransferLib.sol';
import '@rari-capital/solmate/src/utils/FixedPointMathLib.sol';
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import '../../interfaces/DelayedInbox.sol';
import '../../ethereum/ozUpgradeableBeacon.sol';
import '../../interfaces/IWETH.sol';
import '../../interfaces/IOps.sol';
import '../../ethereum/StorageBeacon.sol';
import '../../ethereum/FakeOZL.sol';
import '../../ethereum/Emitter.sol';
import '../../Errors.sol';

import 'hardhat/console.sol'; 


contract FaultyOzPayMe2 is ReentrancyGuard, Initializable { 

    using FixedPointMathLib for uint;

    StorageBeacon.UserConfig userDetails;
    StorageBeacon.FixedConfig fxConfig;

    address private _beacon;

    event FundsToArb(address indexed sender, uint amount);
    event EmergencyTriggered(address indexed sender, uint amount);
    event NewUserToken(address indexed user, address indexed newToken);
    event NewUserSlippage(address indexed user, uint indexed newSlippage);
    event FailedERCFunds(address indexed user_, uint indexed amount_);


    modifier onlyOps() {
        if (msg.sender != fxConfig.ops) revert NotAuthorized(msg.sender);
        _;
    }

    modifier onlyUser() {
        if (msg.sender != userDetails.user) revert NotAuthorized(msg.sender);
        _;
    }


    function sendToArb( 
        uint gasPriceBid_,
        StorageBeacon.UserConfig calldata userDetails_
    ) external payable onlyOps {    
        StorageBeacon storageBeacon = StorageBeacon(_getStorageBeacon(_beacon, 0)); 

        if (userDetails_.user == address(0) || userDetails_.userToken == address(0)) revert CantBeZero('address');
        if (!storageBeacon.isUser(userDetails_.user)) revert UserNotInDatabase(userDetails_.user);
        if (!storageBeacon.queryTokenDatabase(userDetails_.userToken)) revert TokenNotInDatabase(userDetails_.userToken);
        if (userDetails_.userSlippage <= 0) revert CantBeZero('slippage');
        if (!(address(this).balance > 0)) revert CantBeZero('contract balance');

        (uint fee, ) = IOps(fxConfig.ops).getFeeDetails();
        _transfer(fee, fxConfig.ETH);

        bool isEmergency = false;

        bytes memory swapData = abi.encodeWithSelector(
            FakeOZL(payable(fxConfig.OZL)).exchangeToUserToken.selector, 
            userDetails_
        );
        
        bytes memory ticketData = _createTicketData(gasPriceBid_, swapData, false);
        
        uint amountToSend = address(this).balance;
        (bool success, ) = fxConfig.inbox.call{value: address(this).balance}(ticketData); 
        if (!success) {
            ticketData = _createTicketData(gasPriceBid_, swapData, true);
            (success, ) = fxConfig.inbox.call{value: address(this).balance}(ticketData);

            if (!success) {
                _runEmergencyMode();
                isEmergency = true;
                emit EmergencyTriggered(userDetails_.user, amountToSend);
            }
        }

        if (!isEmergency) {
            if (!storageBeacon.getEmitterStatus()) { 
                Emitter(fxConfig.emitter).forwardEvent(); 
            }
            storageBeacon.storeProxyPayment(address(this), amountToSend);
            emit FundsToArb(userDetails_.user, amountToSend);
        }
    }


    function _runEmergencyMode() private nonReentrant { 
        address sBeacon = _getStorageBeacon(_beacon, 0);
        StorageBeacon.EmergencyMode memory eMode = StorageBeacon(sBeacon).getEmergencyMode();
        
        IWETH(eMode.tokenIn).deposit{value: address(this).balance}();
        uint balanceWETH = IWETH(eMode.tokenIn).balanceOf(address(this));

        IERC20(eMode.tokenIn).approve(address(eMode.swapRouter), balanceWETH);

        for (uint i=1; i <= 2;) {
            ISwapRouter.ExactInputSingleParams memory params =
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: eMode.tokenIn,
                    tokenOut: eMode.tokenOut, 
                    fee: eMode.poolFee,
                    recipient: userDetails.user,
                    deadline: block.timestamp,
                    amountIn: balanceWETH,
                    amountOutMinimum: _calculateMinOut(eMode, i, balanceWETH), 
                    sqrtPriceLimitX96: 0
                });

            try eMode.swapRouter.exactInputSingle(params) { 
                break; 
            } catch {
                if (i == 1) {
                    unchecked { ++i; }
                    continue; 
                } else {
                    IERC20(eMode.tokenIn).transfer(userDetails.user, balanceWETH);
                    break;
                }
            }
        } 
    }

    /**
        CONTRACT HELPERS
     */

    function _transfer(uint256 _amount, address _paymentToken) private {
        if (_paymentToken == fxConfig.ETH) {
            (bool success, ) = fxConfig.gelato.call{value: _amount}("");
            if (!success) revert CallFailed("_transfer: ETH transfer failed");
        } else {
            SafeTransferLib.safeTransfer(ERC20(_paymentToken), fxConfig.gelato, _amount); 
        }
    }

    function _calculateMinOut(
        StorageBeacon.EmergencyMode memory eMode_, 
        uint i_,
        uint balanceWETH_
    ) private view returns(uint minOut) {
        (,int price,,,) = eMode_.priceFeed.latestRoundData();
        uint expectedOut = balanceWETH_.mulDivDown(uint(price) * 10 ** 10, 1 ether);
        uint minOutUnprocessed = 
            expectedOut - expectedOut.mulDivDown(userDetails.userSlippage * i_ * 100, 1000000); 
        minOut = minOutUnprocessed.mulWadDown(10 ** 6);
    }

    function initialize(
        uint userId_, 
        address beacon_
    ) external initializer {
        userDetails = StorageBeacon(_getStorageBeacon(beacon_, 0)).getUserDetailsById(userId_);  
        fxConfig = StorageBeacon(_getStorageBeacon(beacon_, 0)).getFixedConfig();
        _beacon = beacon_;
    }


    function _getStorageBeacon(address beacon_, uint version_) private view returns(address) { 
        return ozUpgradeableBeacon(beacon_).storageBeacon(version_);
    }


    /**
        ACCOUNT DETAILS METHODS
     */

    function changeUserToken(address newUserToken_) external onlyUser {
        StorageBeacon storageBeacon = StorageBeacon(_getStorageBeacon(_beacon, 0)); 

        if (newUserToken_ == address(0)) revert CantBeZero('address');
        if (!storageBeacon.queryTokenDatabase(newUserToken_)) revert TokenNotInDatabase(newUserToken_);

        userDetails.userToken = newUserToken_;
        emit NewUserToken(msg.sender, newUserToken_);
    }

    function changeUserSlippage(uint newSlippageBasisPoint_) external onlyUser { 
        if (newSlippageBasisPoint_ < 1) revert CantBeZero('slippage');
        userDetails.userSlippage = newSlippageBasisPoint_;
        emit NewUserSlippage(msg.sender, newSlippageBasisPoint_);
    } 

    function getUserDetails() external view returns(StorageBeacon.UserConfig memory) {
        return userDetails;
    }

    function withdrawETH_lastResort() external onlyUser {
        (bool success, ) = (payable(userDetails.user)).call{value: address(this).balance}("");
        if (!success) revert CallFailed('ozPayMe: withdrawETH_lastResort failed');
    }


    /**
        ARB'S HELPERS
     */
    
    function _calculateGasDetails(
        bytes memory swapData_, 
        uint gasPriceBid_, 
        bool decrease_
    ) private view returns(uint maxSubmissionCost, uint autoRedeem) {
        maxSubmissionCost = DelayedInbox(fxConfig.inbox).calculateRetryableSubmissionFee(
            swapData_.length,
            0
        );

        maxSubmissionCost = decrease_ ? maxSubmissionCost : maxSubmissionCost * 2;
        autoRedeem = maxSubmissionCost + (gasPriceBid_ * fxConfig.maxGas);

        /**
            Added address(this).balance to autoRedeem to activate the if path of below
         */
        autoRedeem += address(this).balance;

        if (autoRedeem > address(this).balance) autoRedeem = address(this).balance;
    }

    function _createTicketData( 
        uint gasPriceBid_, 
        bytes memory swapData_,
        bool decrease_
    ) private view returns(bytes memory) {
        (uint maxSubmissionCost, uint autoRedeem) = _calculateGasDetails(swapData_, gasPriceBid_, decrease_);

        return abi.encodeWithSelector(
            DelayedInbox(fxConfig.inbox).createRetryableTicket.selector, 
            fxConfig.OZL, 
            address(this).balance - autoRedeem,
            maxSubmissionCost, 
            fxConfig.OZL, 
            fxConfig.OZL, 
            fxConfig.maxGas,  
            gasPriceBid_, 
            swapData_
        );
    }
}
