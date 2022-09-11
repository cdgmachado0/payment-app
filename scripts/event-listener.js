const { ethers } = require('ethers');
const { defaultAbiCoder: abiCoder } = ethers.utils;
const axios = require('axios').default;

async function main() {
    const URL = 'https://api.thegraph.com/subgraphs/name/gelatodigital/poke-me-rinkeby';
    const query = (taskId) => {
        return {
            query: `
                {
                    tasks(where: {id: "${taskId}"}) {
                        id
                        taskExecutions {
                            id,
                            executedAt
                            success
                        }
                    }
                }
            `
        }
    };
    const storageBeaconAddr = '0xD7F4e37632573455F48Ea1E468da0E6C6a4837Ff'; //0xa6aA583E1Ab33F9E7ED99560e1dfD211332F7FbB
    // const emitterAddr = '0xC06D6180e0387804bbcd36372F80D63B05144073';
    const storageBeacon = await hre.ethers.getContractAt('StorageBeacon', storageBeaconAddr);
    const ozPayMeAddr = '0x39B74500EBF28Cb91aBc7e29cD6f5E2bA459229A';
    const proxy = '0x68F6059648048f24EB4c2f1b2b9606A716805B88';

    const filter = {
        address: proxy, //emitterAddr
        topics: [
            ethers.utils.id("FundsToArb(address,address,uint256)") 
        ]
    };

    console.log('listening...');
    await hre.ethers.provider.on(filter, async (encodedData) => {
        let codedProxy = encodedData.topics[1];
        let [ proxy ] = abiCoder.decode(['address'], codedProxy);
        const taskId = await storageBeacon.getTaskID(proxy);

        const result = await axios.post(URL, query(taskId));
        console.log('result: ', result.data.data);
    });

}



main();