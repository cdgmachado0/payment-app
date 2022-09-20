const { ethers, Wallet } = require("ethers");
const { defaultAbiCoder: abiCoder } = ethers.utils;
const axios = require('axios').default;
const { L1TransactionReceipt, L1ToL2MessageStatus } = require('@arbitrum/sdk');
const { assert } = require('console');

const {
    l1ProviderTestnet,
    l2ProviderTestnet,
    network,
    signerTestnet
} = require('../../scripts/state-vars.js');

const { checkHash, redeemHash } = require('../../scripts/event-listener.js');


const l2Wallet = new Wallet(process.env.PK, l2ProviderTestnet);
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

 

async function startListening(storageBeaconAddr, proxy, redeemedHashesAddr) {
    const storageBeacon = await hre.ethers.getContractAt('StorageBeacon', storageBeaconAddr);

    const filter = {
        address: proxy, 
        topics: [
            ethers.utils.id("FundsToArb(address,address,uint256)") 
        ]
    };

    console.log('listening...');

    await hre.ethers.provider.once(filter, async (encodedData) => {
        //ETH has been sent out from the proxy by the Gelato call
        const balance = await hre.ethers.provider.getBalance(proxy);
        assert(balance === 0);
        console.log('balance post (should be 0): ***** ', Number(balance));

        let codedProxy = encodedData.topics[1];
        let [ proxy ] = abiCoder.decode(['address'], codedProxy);
        let taskId = await storageBeacon.getTaskID(proxy);

        if (!tasks[taskId]) {
            tasks[taskId] = {};
            tasks[taskId].alreadyCheckedHashes = [];
        }

        //Waits to query Gelato's subgraph for the tx hashes
        setTimeout(continueExecution, 120000);
        console.log('setTimeout rolling...');

        async function continueExecution() {
            let result = await axios.post(URL, query(taskId));
            let executions =  result.data.data.tasks[0].taskExecutions;
            console.log('executions: ', executions);

            parent:
            for (let i=0; i < executions.length; i++) {
                let [ hash ] = executions[i].id.split(':');
                console.log('hash: ', hash);

                let notInCheckedArray = tasks[taskId].alreadyCheckedHashes.indexOf(hash) === -1;
                if (!notInCheckedArray) continue parent;

                let [ message, wasRedeemed ] = await checkHash(hash);

                wasRedeemed ? tasks[taskId].alreadyCheckedHashes.push(hash) : redeemHash(message, hash, taskId, redeemedHashesAddr);
                // console.log('alreadyCheckedHashes ******: ', tasks[taskId].alreadyCheckedHashes);
            }

            //----------
            const redeemedHashes = await hre.ethers.getContractAt('RedeemedHashes', redeemedHashesAddr);
            const redemptions = await redeemedHashes.connect(l2Wallet).getTotalRedemptions();
            console.log('redemptions: ', redemptions);
            console.log('checked hashes: ', tasks[taskId].alreadyCheckedHashes);
        }
    });

    setTimeout(waitingForFunds, 600000);
    console.log(`Waiting for funds in L2 (takes < 10 minutes; current time: ${new Date().toTimeString()})`);

    async function waitingForFunds() { 
        const balance = signerTestnet.getBalance();
        assert(Number(balance) > 0);
        console.log('balance post (should be more than 0): ***** ', Number(balance));
    }
}




module.exports = {
    startListening
};


