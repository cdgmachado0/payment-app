// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.14; 


import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import '@openzeppelin/contracts/access/Ownable.sol';
import './StorageBeacon.sol';
import '../Errors.sol';

import 'hardhat/console.sol';
/**
 * @title Forwarding contract for manual redeems.
 * @notice Forwards the address of the account that received a transfer, for a check-up
 * of the tx in case it needs a manual redeem
 */
contract Emitter is Initializable, Ownable {
    address private _beacon;
    address ram;

    event ShowTicket(address indexed proxy);

    /// @dev Stores the beacon (ozUpgradableBeacon)
    function storeBeacon(address beacon_, address random_) external initializer {
        _beacon = beacon_;
        ram = random_;
    }

    /// @dev Gets the first version of the Storage Beacon
    function _getStorageBeacon() private view returns(StorageBeacon) {
        return StorageBeacon(ozUpgradeableBeacon(_beacon).storageBeacon(0));
    }

    struct AccData {
        address[] accounts;
        mapping(bytes32 => bytes) acc_userToTask_name;
    }

    /**
     * @dev Forwards the account/proxy to the offchain script that checks for 
     * manual redeems.
     */
    function forwardEvent(address user_) external { 
        console.log('hi*****');
        // address[] memory pointers = _getStorageBeacon().getBytes(user_);
        // if (pointers.length == 0) revert NotAccount();
        // emit ShowTicket(msg.sender);

        //----
        // bytes[] memory data = _getStorageBeacon().getBytes(user_);
        // uint length = data.length;

        // for (uint i=0; i < length;) {
        //     if (bytes20(data[i]) == bytes20(msg.sender)) {
        //         emit ShowTicket(msg.sender);
        //         return;
        //     }
        //     unchecked { ++i; }
        // }
        // revert NotAccount();

        //--------
        // AccData storage data = _getStorageBeacon().getBytesData(user_);
        bytes20 account = bytes20(msg.sender);
        bytes12 userFirst12 = bytes12(bytes20(user_));
        bytes32 acc_user = bytes32(bytes.concat(account, userFirst12));
        if (!_getStorageBeacon().verify(user_, acc_user)) revert NotAccount();

        // if (data.acc_userToTask_name[acc_user] == bytes(0)) revert NotAccount();
        emit ShowTicket(msg.sender);
    }
}



        



