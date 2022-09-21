const { ethers, Wallet } = require("ethers");
const { defaultAbiCoder: abiCoder } = ethers.utils;
const axios = require('axios').default;
const { L1TransactionReceipt, L1ToL2MessageStatus } = require('@arbitrum/sdk');
const { assert } = require('console');

const {
    l1ProviderTestnet,
    l2ProviderTestnet,
    network,
    signerTestnet,
    testnetReceiver,
    ops
} = require('../../scripts/state-vars.js');


const l2Wallet = new Wallet(process.env.PK_TESTNET, l2ProviderTestnet);
const tasks = {};
const URL = `https://api.thegraph.com/subgraphs/name/gelatodigital/poke-me-${network}`;
const query = (taskId) => {
    return {
        query: `
            {
                tasks(where: {id: "${taskId}"}) {
                    id
                    taskExecutions {
                        id,
                        success
                    }
                }
            }
        `
    }
};
// let newProxyAddr;

 

async function startListening(storageBeaconAddr, newProxyAddr, redeemedHashesAddr, manualRedeem = false) {
    const storageBeacon = await hre.ethers.getContractAt('StorageBeacon', storageBeaconAddr);

    const filter = {
        address: newProxyAddr, 
        topics: [
            ethers.utils.id("FundsToArb(address,address,uint256)") 
        ]
    };

    console.log('Listening for the bridge transaction from Mainnet to Arbitrum...');

    await hre.ethers.provider.once(filter, async (encodedData) => {
        let codedProxy = encodedData.topics[1];
        let [ proxy ] = abiCoder.decode(['address'], codedProxy);
        let taskId = await storageBeacon.getTaskID(proxy);

        //ETH has been sent out from the proxy by the Gelato call
        const balance = await hre.ethers.provider.getBalance(proxy);
        assert(Number(balance) === 0);
        console.log('ETH left Mainnet contract (aka proxy) to Arbitrum');

        if (!tasks[taskId]) {
            tasks[taskId] = {};
            tasks[taskId].alreadyCheckedHashes = [];
        }

        //Waits to query Gelato's subgraph for the tx hashes
        setTimeout(continueExecution, 120000);
        console.log('Wait 2 minutes to query Gelato subgraph for L1 transaction hashes...');

        async function continueExecution() {
            let result = await axios.post(URL, query(taskId));
            let executions =  result.data.data.tasks[0].taskExecutions;
            console.log('Executions: ', executions);

            parent:
            for (let i=0; i < executions.length; i++) {
                let [ hash ] = executions[i].id.split(':');
                let notInCheckedArray = tasks[taskId].alreadyCheckedHashes.indexOf(hash) === -1;
                if (!notInCheckedArray) continue parent;

                let [ message, wasRedeemed ] = await checkHash(hash);

                console.log(1);
                wasRedeemed ? tasks[taskId].alreadyCheckedHashes.push(hash) : await redeemHash(message, hash, taskId, redeemedHashesAddr, executions);
            }

            if (!manualRedeem) {
                // const redeemedHashes = await hre.ethers.getContractAt('RedeemedHashes', redeemedHashesAddr);
                // const redemptions = await redeemedHashes.connect(l2Wallet).getTotalRedemptions();
                // console.log('redemptions: ', redemptions);
                assert(tasks[taskId].alreadyCheckedHashes.length === executions.length);
                console.log('checked hashes: ', tasks[taskId].alreadyCheckedHashes);
            }

            setTimeout(waitingForFunds, 600000);
            console.log(`Waiting for funds in L2 (takes 10 minutes; current time: ${new Date().toTimeString()})`);
            console.log('');

            async function waitingForFunds() { 
                const balance = await l2ProviderTestnet.getBalance(testnetReceiver);
                assert(Number(balance) > 0);
                console.log('Contract in L2 received the ETH');
            }
        }
    });
}


async function checkHash(hash) { 
    const receipt = await l1ProviderTestnet.getTransactionReceipt(hash);
    const l1Receipt = new L1TransactionReceipt(receipt);
    const message = await l1Receipt.getL1ToL2Message(l2Wallet);
    const status = (await message.waitForStatus()).status;
    const wasRedeemed = status === L1ToL2MessageStatus.REDEEMED ? true : false;

    return [
        message,
        wasRedeemed
    ];
}

async function redeemHash(message, hash, taskId, redeemedHashesAddr, executions) { 
    console.log(2);
    let tx = await message.redeem(ops);
    console.log(3);
    await tx.wait();
    console.log(4);

    const status = (await message.waitForStatus()).status;
    console.log(4);
    assert(L1ToL2MessageStatus.REDEEMED == status);
    console.log(`hash: ${hash} redemeed`);
    tasks[taskId].alreadyCheckedHashes.push(hash);
    
    const redeemedHashes = await hre.ethers.getContractAt('RedeemedHashes', redeemedHashesAddr);
    tx = await redeemedHashes.connect(l2Wallet).storeRedemption(taskId, hash);
    await tx.wait();

    //---------
    const redemptions = await redeemedHashes.connect(l2Wallet).getTotalRedemptions();
    assert(executions.length === redemptions.length);
    console.log('redemptions: ', redemptions);
    // console.log('checked hashes: ', tasks[taskId].alreadyCheckedHashes);
}




module.exports = {
    startListening
};


