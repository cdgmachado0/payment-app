const { Bitcoin } = require("@renproject/chains");
const { execute } = require('./exec-bridge.js');
const { sendBitcoin } = require('./init-btc-tx.js');
const { MaxUint256 } = ethers.constants;
const { parseEther } = ethers.utils;

const amountToSend = 0.0001;

//Variables that are supposed to be dynamically created
const sendingAddr = 'mubUbyPazdyvhPJYPGWUkFWj7bkw1Yq8ys';
const senderPK = process.env.PK_TEST;

async function begin() {
    //Creates the "mint" object for bridge execution
    const mint = await execute();

    //Gets the BTC gateway deposit address
    const depositAddress = mint.gatewayAddress;
    console.log('BTC deposit address: ', depositAddress);

    //Sends the deposited BTC to the bridge deposit address
    await sendBitcoin(depositAddress, amountToSend, sendingAddr, senderPK);

    //Mints renBTC
    mint.on('deposit', async (deposit) => {
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
            .on('transactionHash', (txHash) => {
                console.log('Ethereum transaction: ', txHash.toString());
            });

        console.log(`Deposited ${amountToSend} BTC`);
    });






}


//Sends renBTC to PayMe2 as a simulation
async function simulate() {
    const uniRouterV2Addr = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
    const uniRouterV2 = await hre.ethers.getContractAt('IUniswapV2Router02', uniRouterV2Addr);
    const wethAddr = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
    const renBtcAddr = '0xeb4c2781e4eba804ce9a9803c67d0893436bb27d';
    const WBTC = await hre.ethers.getContractAt('IERC20', renBtcAddr);
    const path = [wethAddr, renBtcAddr];

    const registryAddr = '0x557e211EC5fc9a6737d2C6b7a1aDe3e0C11A8D5D'; //arb: 0x21C482f153D0317fe85C60bE1F7fa079019fcEbD
    const PayMe = await hre.ethers.getContractFactory("PayMe2");
    const payme = await PayMe.deploy(registryAddr);
    await payme.deployed();
    console.log("PayMe2 deployed to:", payme.address);

    const tradedAmount = 1 * 10 ** 8;
    await uniRouterV2.swapETHForExactTokens(tradedAmount, path, payme.address, MaxUint256, {
        value: parseEther('100')
    });
    const x = await WBTC.balanceOf(payme.address);
    console.log('renBTC balance on Begin: ', x.toString() / 10 ** 8);

    await payme.exchangeToWETH(tradedAmount);




}





// begin();

simulate();