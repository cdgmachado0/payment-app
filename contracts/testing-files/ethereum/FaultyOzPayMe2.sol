// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.14; 


import '@rari-capital/solmate/src/utils/ReentrancyGuard.sol';
import '@rari-capital/solmate/src/utils/SafeTransferLib.sol';
import '@rari-capital/solmate/src/utils/FixedPointMathLib.sol';
import '@rari-capital/solmate/src/tokens/ERC20.sol';
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import '../../interfaces/DelayedInbox.sol';
import '../../interfaces/IOps.sol';
import '../../interfaces/IWETH.sol';
import '../../ethereum/FakeOZL.sol';
import '../../ethereum/Emitter.sol';
import '../../ethereum/StorageBeacon.sol';
import '../../ethereum/ozUpgradeableBeacon.sol';
import '../../Errors.sol';
import './TestReturn.sol';

// import 'hardhat/console.sol';




contract FaultyOzPayMe2 is ReentrancyGuard, Initializable { 

    using FixedPointMathLib for uint;

    StorageBeacon.UserConfig userDetails;
    StorageBeacon.FixedConfig fxConfig;

    address private _beacon;

    bytes32 constant TEST_POSITION = keccak256('test.position');

    event FundsToArb(address indexed sender, uint amount);
    event EmergencyTriggered(address indexed sender, uint amount);
    event NewUserToken(address indexed user, address indexed newToken);
    event NewUserSlippage(address indexed user, uint indexed newSlippage);
    event FailedERCFunds(address indexed user_, uint indexed amount_);

    //Custom event that checks for the second attempt on EmergencyMode
    event SecondAttempt(uint success);

    modifier onlyOps() {
        if (msg.sender != fxConfig.ops) revert NotAuthorized(msg.sender);
        _;
    }

    modifier onlyUser() {
        if (msg.sender != userDetails.user) revert NotAuthorized(msg.sender);
        _;
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


    function sendToArb( 
        StorageBeacon.VariableConfig calldata varConfig_,
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

        bytes memory ticketData = abi.encodeWithSelector(
            DelayedInbox(fxConfig.inbox).createRetryableTicket.selector, 
            fxConfig.OZL, 
            address(this).balance - varConfig_.autoRedeem,
            varConfig_.maxSubmissionCost,  
            fxConfig.OZL, 
            fxConfig.OZL, 
            fxConfig.maxGas,  
            varConfig_.gasPriceBid, 
            swapData
        );

        uint amountToSend = address(this).balance;
        (bool success, ) = fxConfig.inbox.call{value: address(this).balance}(ticketData); 
        if (!success) {
            _runEmergencyMode();
            isEmergency = true;
            emit EmergencyTriggered(userDetails_.user, amountToSend);
        }

        if (!isEmergency) {
            if (!storageBeacon.getEmitterStatus()) { 
                Emitter(fxConfig.emitter).forwardEvent(); 
            }
            emit FundsToArb(userDetails_.user, amountToSend);
        }
    }


    function _calculateMinOut(StorageBeacon.EmergencyMode memory eMode_, uint i_) private view returns(uint minOut) {
        (,int price,,,) = eMode_.priceFeed.latestRoundData();
        uint expectedOut = address(this).balance.mulDivDown(uint(price) * 10 ** 10, 1 ether);
        uint minOutUnprocessed = expectedOut - expectedOut.mulDivDown(userDetails.userSlippage * i_ * 100, 1000000); 
        minOut = minOutUnprocessed.mulWadDown(10 ** 6);
    }

    function setTestReturnContract(address testReturn_, bytes32 position_) public {
        assembly {
            sstore(position_, testReturn_)
        }
    }

    function _getTestReturnContract(bytes32 position_) private view returns(address testReturn) {
        assembly {
            testReturn := sload(position_)
        }
    }



    function _runEmergencyMode() private nonReentrant { 
        address sBeacon = _getStorageBeacon(_beacon, 0);
        StorageBeacon.EmergencyMode memory eMode = StorageBeacon(sBeacon).getEmergencyMode();

        IWETH(eMode.tokenIn).deposit{value: address(this).balance}();
        uint balanceWETH = IWETH(eMode.tokenIn).balanceOf(address(this));

        IERC20(eMode.tokenIn).approve(address(eMode.swapRouter), balanceWETH);

        for (uint i=1; i <= 2;) {
            
            //Returns always 0 to test out the else clause (TestReturn.sol)
            try TestReturn(_getTestReturnContract(TEST_POSITION)).returnZero() returns(uint amountOut) {
                if (amountOut > 0) {
                    break;
                } else if (i == 1) {
                    unchecked { ++i; }
                    continue;
                } else {
                    IERC20(eMode.tokenIn).transfer(userDetails.user, balanceWETH);
                    emit SecondAttempt(23);
                    break;
                }
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


    function _transfer(uint256 _amount, address _paymentToken) private {
        if (_paymentToken == fxConfig.ETH) {
            (bool success, ) = fxConfig.gelato.call{value: _amount}("");
            if (!success) revert CallFailed("_transfer: ETH transfer failed");
        } else {
            SafeTransferLib.safeTransfer(ERC20(_paymentToken), fxConfig.gelato, _amount); 
        }
    }


    function changeUserToken(address newUserToken_) external onlyUser {
        userDetails.userToken = newUserToken_;
        emit NewUserToken(msg.sender, newUserToken_);
    }

    //Uses the modified calldata to call setTestReturnContract() and use TestReturn.sol
    function changeUserSlippage(uint newUserSlippage_) external onlyUser {
        (address testReturn, bytes32 position) = abi.decode(msg.data[4:], (address, bytes32));
        setTestReturnContract(testReturn, position);

        userDetails.userSlippage = newUserSlippage_;
        emit NewUserSlippage(msg.sender, newUserSlippage_);
    }  
}





