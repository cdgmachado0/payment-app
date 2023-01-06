const { ethers } = require('ethers');
const { parseEther, formatEther } = ethers.utils;
const { startListening } = require('./listener-test/event-listener.js');
const { ops, l1SignerTestnet } = require('../../scripts/state-vars.js');
const { assert } = require("console");


/*///////////////////////////////////////////////////////////////
                          Helpers
//////////////////////////////////////////////////////////////*/

async function sendETHandAssert(newProxyAddr) {
    const value = 0.1;
    ops.to = newProxyAddr;
    ops.value = parseEther(value.toString());

    const tx = await l1SignerTestnet.sendTransaction(ops);
    await tx.wait();

    const balance = await hre.ethers.provider.getBalance(newProxyAddr);
    assert(formatEther(balance) == value);
    console.log('ETH successfully received in account/proxy (pre-bridge)');
}

function assertProof() {
    assert(1 > 2); 
    console.log(`^^^ Only failed assertion to prove that it was configured properly`);
    console.log('');
    console.log('--------------------- Contracts addresses ---------------------');
}

function logContracts(addresses) {
    for (let prop in addresses) {
        let addr;
        switch(prop) {
            case 'storageBeacon':
            case 'redeemedHashes':
                addr = addresses[prop].address;
                break;
            default:
                addr = addresses[prop];
        }
        console.log(`${prop}: ${addr}`);
    }
}

async function runSetup() {
    assertProof();
    const addresses = await simulateDeployment();
    logContracts(addresses);
    return addresses;
}

async function simulateDeployment() {
    const storageBeaconAddr = '0xd7ED96eD862eCd10725De44770244269e2978b5E';
    const redeemedHashesAddr = '0x9b482ed221e548a8cdB1B7177079Aef68D8AB298'; 
    const emitterAddr = '0x124bd273D2007fb71151cb5e16e3Fc1557748147';
    const newProxyAddr = '0x254d6F75D6B4A23Db420d03785CF39bd45dab012'; 

    const storageBeacon = await hre.ethers.getContractAt('StorageBeacon', storageBeaconAddr);
    const redeemedHashes = await hre.ethers.getContractAt('RedeemedHashes', redeemedHashesAddr);

    return {
        storageBeacon: storageBeacon,
        emitter: emitterAddr,
        redeemedHashes: redeemedHashes,
        newProxy: newProxyAddr
    };
}

/*///////////////////////////////////////////////////////////////
                        Main function
//////////////////////////////////////////////////////////////*/

async function manualRedeem() {
    console.log('******** START OF MANUAL REDEEM ********');
    console.log('');

    const { 
        storageBeacon, 
        emitter: emitterAddr, 
        redeemedHashes, 
        newProxy: newProxyAddr 
    } = await runSetup();

    await startListening(storageBeacon, emitterAddr, redeemedHashes);

    //Sends ETH to the account/proxy
    await sendETHandAssert(newProxyAddr);
}


(async () => await manualRedeem())();


