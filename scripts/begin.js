const { Bitcoin } = require("@renproject/chains");
const { ethers } = require("ethers");
const { executeBridge } = require('./exec-bridge.js');
const { sendBitcoin } = require('./init-btc-tx.js');
const { MaxUint256 } = ethers.constants;
const { parseEther, formatEther, keccak256, defaultAbiCoder: abiCoder } = ethers.utils;
const { deploy } = require('./deploy.js');

const {
    balanceOfPYY, 
    transferPYY, 
    withdrawSharePYY, 
    approvePYY,
    getVarsForHelpers,
    sendsOneTenthRenBTC
} = require('./helpers.js');

const {
    wethAddr,
    renPoolAddr,
    tricryptoAddr,
    usdtAddr,
} = require('./state-vars.js');




const amountToSend = 0.002;

//Variables that are supposed to be dynamically created
const sendingAddr = 'mubUbyPazdyvhPJYPGWUkFWj7bkw1Yq8ys';
const senderPK = process.env.PK_TEST;


async function begin() { //KOVAN
    const wethAddr = '0xd0A1E359811322d97991E03f863a0C30C2cF029C';
    const usdtAddr = '0xf3e0d7bf58c5d455d31ef1c2d5375904df525105';
    const [userAddr] = await hre.ethers.provider.listAccounts();
    const userToken = usdtAddr;
    
    //Creates the "mint" object for bridge execution
    const mint = await executeBridge(userAddr, userToken); 

    //Gets the BTC gateway deposit address
    const depositAddress = mint.gatewayAddress;
    console.log('BTC deposit address: ', depositAddress);

    //Sends the deposited BTC to the bridge deposit address
    await sendBitcoin(depositAddress, amountToSend, sendingAddr, senderPK);
    
    //Mints renBTC
    await mint.on('deposit', async (deposit) => {
        const hash = deposit.txHash();
        console.log('first hash: ', hash);
        console.log('details of deposit: ', deposit.depositDetails);

        const depositLog = (msg) => {
            console.log(
                `BTC deposit: ${Bitcoin.utils.transactionExplorerLink(
                    deposit.depositDetails.transaction,
                    'testnet'
                )}\n
                RenVM Hash: ${hash}\n
                Status: ${deposit.status}\n
                ${msg}`
            );
        }

        await deposit.confirmed()
            .on('target', (target) => depositLog(`0/${target} confirmations`))
            .on('confirmation', (confs, target) => 
            depositLog(`${confs}/${target} confirmations`)
        );

        await deposit.signed()
            .on("status", (status) => depositLog(`Status: ${status}`));
            
        await deposit
            .mint()
            .on('transactionHash', async (txHash) => {
                console.log('Ethereum transaction: ', txHash.toString());
            }); 
        console.log(`Deposited ${amountToSend} BTC`);
    });

}



async function buffering() {
    const registryAddr = '0x557e211EC5fc9a6737d2C6b7a1aDe3e0C11A8D5D';
    const eth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
    const PayMe = await hre.ethers.getContractFactory("PayMe2");
    const payme = await PayMe.deploy(registryAddr);
    await payme.deployed();
    console.log("PayMe3 deployed to:", payme.address);

    const _msg = Buffer.from(eth.substring(2), 'hex');
    await payme.toBuffer(_msg);
}

async function tryGelatoRopsten2() {
    const pokeMeAddr = '0x9C4771560d84222fD8B7d9f15C59193388cC81B3'; //Ops Addr

    const signer = await hre.ethers.provider.getSigner(0);
    const signerAddr = await signer.getAddress();
    console.log('signer address: ', signerAddr);

    const Resolver = await hre.ethers.getContractFactory('Resolver')
    const resolver = await Resolver.deploy(pokeMeAddr, signerAddr);
    await resolver.deployed();
    console.log('resolver deployed to: ', resolver.address);

    // const tx = await resolver.startTask();
    // const receipt = await tx.wait(); 

    // console.log('receipt: ', receipt);

    // console.log('task Id raw: ', taskId);
    // console.log('task Id: ', taskId.toString());

    toTask(resolver);

}

async function toTask(resolver) {
    // const resolverAddr = '0x329C49519Db27bF3d5E000d3CE5CABB4aF8917D8';
    // const resolver = await hre.ethers.getContractAt('Resolver', resolverAddr);
    // console.log('resolver address: ', resolver.address);

    const tx = await resolver.startTask({
        gasLimit: ethers.BigNumber.from('200000')
    });
    console.log('transaction: ', tx);
    const receipt = await tx.wait();
    // console.log('receipt: ', receipt);
    const { data } = receipt.events[0];

    const abiCoder = ethers.utils.defaultAbiCoder;
    const args = [
        "address", "address", "bytes4", "address", "bytes32",
        "bytes", "bool", "address", "bytes32"
    ];
    const decodedData = abiCoder.decode(args, data);
    console.log('task id: ', decodedData[4]);
    
}

async function tryGelatoRopsten() {
    const resolverAddr = '0xA1fE693Ca917756eCeF19b6217BA1b56b3e65d2D'; //custom
    const provider = await hre.ethers.provider;
    const signer = provider.getSigner(0);

    let balance = await provider.getBalance(resolverAddr);
    console.log('bal pre: ', ethers.utils.formatEther(balance));

    const tx = {
        to: resolverAddr,
        value: ethers.utils.parseEther('0.01')
    }

    await signer.sendTransaction(tx);
    console.log('eth sent');

    balance = await provider.getBalance(resolverAddr);
    console.log('bal post: ', ethers.utils.formatEther(balance));


}

async function sendArb() {

    const chainIdArb = 42161;
    const signer = await hre.ethers.provider.getSigner(0);
    const addr = await signer.getAddress();
    const amount = ethers.utils.parseEther('5');

    const PayMeHop = await hre.ethers.getContractFactory('PayMeFacetHop')
    const paymeHop = await PayMeHop.deploy(addr)
    await paymeHop.deployed();
    console.log('paymeHop deployed to: ', paymeHop.address);


    let balance = await signer.getBalance();
    console.log('pre hop: ', ethers.utils.formatEther(balance));

    const tx = {
        value: amount,
        to: paymeHop.address,
        // gasLimit: ethers.BigNumber.from('100000')
    };

    const estGas = (await hre.ethers.provider.estimateGas(tx)).toNumber();
    console.log('est: ', estGas)
    tx.gasLimit = estGas;

    await signer.sendTransaction(tx);

    // await paymeHop.sendToArb(chainIdArb, addr, amount, {
    //     value: amount
    // });

    // balance = await signer.getBalance();
    // console.log('post hop: ', ethers.utils.formatEther(balance));

    
}


async function beginSimulatedDiamond() {
    const deployedVars = await deploy();
    const {
        deployedDiamond, 
        WETH,
        USDT,
        WBTC,
        renBTC,
        crvTri,
        callerAddr, 
        caller2Addr,
        PYY,
        managerFacet
    } = deployedVars;
    
    getVarsForHelpers(deployedDiamond, PYY, managerFacet, renBTC);

    /**+++++++++ SIMULATES CURVE SWAPS ++++++++**/
    const IWETH = await hre.ethers.getContractAt('IWETH', wethAddr);
    const tricryptoPool = await hre.ethers.getContractAt('ITricrypto', tricryptoAddr);
    const renPool = await hre.ethers.getContractAt('IRenPool', renPoolAddr);

    //Gets the gross WETH and converts to WBTC
    await IWETH.deposit({value: parseEther('1000')}); 
    let amountIn = (await WETH.balanceOf(callerAddr)).toString(); 
    //Swaps ETH for WBTC
    await tricryptoPool.exchange(2, 1, amountIn, 1, true, {
        value: amountIn
    });

    //Converts to renBTC and divides in 1/10th
    amountIn = (await WBTC.balanceOf(callerAddr)).toString();
    await WBTC.approve(renPoolAddr, MaxUint256);
    await renPool.exchange(1, 0, amountIn, 1); 
    let renBtcBalance = (await renBTC.balanceOf(callerAddr)).toString();
    let oneTenth = Math.floor(renBtcBalance / 10);

    //First user
    console.log('1st user first transfer');
    await sendsOneTenthRenBTC(oneTenth, callerAddr, usdtAddr, USDT, 'USDT', 10 ** 6);
    await approvePYY(callerAddr);
    console.log('PYY balance on caller 1: ', formatEther(await balanceOfPYY(callerAddr)));
    console.log('crvTricrypto token balance on diamondProxy: ', formatEther(await crvTri.balanceOf(deployedDiamond.address)));
    console.log('---------------------------------------'); 

    //Second user
    console.log('2nd user first transfer');
    await sendsOneTenthRenBTC(oneTenth, caller2Addr, wethAddr, WETH, 'WETH', 10 ** 18);
    await approvePYY(caller2Addr);
    console.log('PYY balance on caller 2: ', formatEther(await balanceOfPYY(caller2Addr)));
    console.log('PYY balance on caller 1 after caller2 swap: ', formatEther(await balanceOfPYY(callerAddr)));
    console.log('crvTricrypto token balance on diamondProxy: ', formatEther(await crvTri.balanceOf(deployedDiamond.address)));
    console.log('---------------------------------------'); 

    // //First user - 2nd transfer
    console.log('1st user second transfer'); 
    await sendsOneTenthRenBTC(oneTenth, callerAddr, usdtAddr, USDT, 'USDT', 10 ** 6);
    console.log('PYY balance on caller 1 after 2nd swap: ', formatEther(await balanceOfPYY(callerAddr)));
    console.log('PYY balance on caller 2 after caller1 2nd swap: ', formatEther(await balanceOfPYY(caller2Addr)));
    console.log('crvTricrypto token balance on diamondProxy: ', formatEther(await crvTri.balanceOf(deployedDiamond.address)));
    console.log('---------------------------------------'); 
    
    //Transfer half of PYY from caller1 to caller2
    console.log('Transfer half of PYY');
    const halfPYYbalance = formatEther(await balanceOfPYY(callerAddr)) / 2;  
    await transferPYY(caller2Addr, parseEther(halfPYYbalance.toString()));
    console.log('PYY balance on caller 1 after transferring half: ', formatEther(await balanceOfPYY(callerAddr)));
    console.log('PYY balance on caller 2 after getting half: ', formatEther(await balanceOfPYY(caller2Addr)));
    console.log('---------------------------------------'); 
    
    //1st user withdraw remaining share (half)
    console.log('Withdraw 1st user half share (remainder)');  
    await withdrawSharePYY(callerAddr, parseEther(formatEther(await balanceOfPYY(callerAddr))), usdtAddr);
    const usdtBalance = await USDT.balanceOf(callerAddr);
    console.log('USDT balance from fees of caller1: ', usdtBalance.toString() / 10 ** 6); 
    console.log('PYY balance on caller 1 after fees withdrawal: ', formatEther(await balanceOfPYY(callerAddr)));
    console.log('PYY balance on caller 2 after fees withdrawal ', formatEther(await balanceOfPYY(caller2Addr)));
    console.log('---------------------------------------'); 

    //1st user third transfer (ETH)
    console.log('1st user third transfer (ETH)');
    await sendsOneTenthRenBTC(oneTenth, callerAddr, wethAddr, WETH, 'WETH', 10 ** 18);
    console.log('PYY balance on caller 1: ', formatEther(await balanceOfPYY(callerAddr)));
    console.log('PYY balance on caller 2: ', formatEther(await balanceOfPYY(caller2Addr)));
    console.log('.');
    
    console.log('After PYY transfer');
    const toTransfer = formatEther(await balanceOfPYY(caller2Addr)) / 3;
    await transferPYY(callerAddr, parseEther(toTransfer.toString()), 1);
    console.log('PYY balance on caller 1: ', formatEther(await balanceOfPYY(callerAddr)));
    console.log('PYY balance on caller 2: ', formatEther(await balanceOfPYY(caller2Addr)));
    console.log('.');

    console.log('Withdrawing 1/3');
    await withdrawSharePYY(caller2Addr, parseEther(toTransfer.toString()), wethAddr);
    const wethBalance = await WETH.balanceOf(caller2Addr);
    console.log('WETH balance from fees of caller2: ', formatEther(wethBalance));
    console.log('PYY balance on caller 1: ', formatEther(await balanceOfPYY(callerAddr)));
    console.log('PYY balance on caller 2: ', formatEther(await balanceOfPYY(caller2Addr)));
    console.log('.');
    console.log('crvTricrypto token balance on diamondProxy: ', formatEther(await crvTri.balanceOf(deployedDiamond.address)));
    /**+++++++++ END OF SIMULATION CURVE SWAPS ++++++++**/
}






// toTask();

tryGelatoRopsten();

// beginSimulatedDiamond();

// sendArb();

// begin();
// .then(() => process.exit(0))
//   .catch((error) => {
//     console.error(error);
//     process.exit(1);
//   });
  

// buffering();

