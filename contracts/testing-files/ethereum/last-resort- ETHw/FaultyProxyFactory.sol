// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.14; 


import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import '@rari-capital/solmate/src/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/utils/Address.sol';
import '../../../ethereum/ozUpgradeableBeacon.sol';
import '../../../interfaces/IOps.sol';
import './FaultyOzBeaconProxy.sol';
import '../../../ethereum/StorageBeacon.sol';
import '../../../Errors.sol';

import 'hardhat/console.sol';



contract FaultyProxyFactory is ReentrancyGuard, Initializable { 

    using Address for address;

    address private beacon;


    function initialize(address beacon_) external initializer {
        beacon = beacon_;
    }

    function createNewProxy(
        StorageBeacon.AccountConfig calldata accountDetails_
    ) external nonReentrant returns(address) {
        if (bytes(accountDetails_.accountName).length == 0) revert CantBeZero('accountName'); 
        if (bytes(accountDetails_.accountName).length > 18) revert NameTooLong();
        if (accountDetails_.user == address(0) || accountDetails_.userToken == address(0)) revert CantBeZero('address');
        if (accountDetails_.userSlippage <= 0) revert CantBeZero('slippage');
        if (!StorageBeacon(_getStorageBeacon(0)).queryTokenDatabase(accountDetails_.userToken)) revert TokenNotInDatabase(accountDetails_.userToken);

        //Replaced with FaultyOzBeaconProxy that doesn't forward txs to the implementation
        FaultyOzBeaconProxy newProxy = new FaultyOzBeaconProxy(
            beacon,
            new bytes(0)
        );

        bytes memory createData = abi.encodeWithSignature(
            'initialize((address,address,uint256,string),address)',
            accountDetails_, beacon
        );
        address(newProxy).functionCall(createData);

        _startTask(address(newProxy));

        StorageBeacon(_getStorageBeacon(0)).saveUserToDetails(address(newProxy), accountDetails_); 

        return address(newProxy);
    }


    function _getStorageBeacon(uint version_) private view returns(address) {
        return ozUpgradeableBeacon(beacon).storageBeacon(version_);
    }


    // *** GELATO TASK ******

    function _startTask(address beaconProxy_) private { 
        StorageBeacon.FixedConfig memory fxConfig = StorageBeacon(_getStorageBeacon(0)).getFixedConfig(); 

        (bytes32 id) = IOps(fxConfig.ops).createTaskNoPrepayment( 
            beaconProxy_,
            bytes4(abi.encodeWithSignature('sendToArb()')),
            beaconProxy_,
            abi.encodeWithSignature('checker()'),
            fxConfig.ETH
        );

        StorageBeacon(_getStorageBeacon(0)).saveTaskId(beaconProxy_, id);
    }
}