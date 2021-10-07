const RenJS = require("@renproject/ren");
const { Bitcoin, Ethereum } = require("@renproject/chains");
const BN = require('bn.js');
// const hre = require('hardhat');


async function executeBridge(user, userToken) {
    const renJS = new RenJS('testnet', { useV2TransactionFormat: true }); //org: 0xF95D54616c371f12c152E278FC4fCb47341bB0A8
    const payme = '0x55654C4A4d30d0D1C561A2f2F96e96A84990e028'; //btcMinter: '0xA9816e2Ca3DC637ED385F50F5Ba732c4a7f6fa4A';
    const amount = 0.003; //with vault: 0x58caD20B9C492e09Ee8b91eEBa23AFB744Cf8bDa
    const provider = await hre.ethers.provider; //payme3: 0x55654C4A4d30d0D1C561A2f2F96e96A84990e028

    const mint = await renJS.lockAndMint({
        asset: 'BTC',
        from: Bitcoin(),
        to: Ethereum(provider).Contract({
            sendTo: payme,
            contractFn: 'deposit',
            contractParams: [
                {
                    name: '_user',
                    type: 'bytes',
                    value: Buffer.from(user.substring(2), 'hex')
                },
                {
                    name: '_userToken',
                    type: 'bytes',
                    value: Buffer.from(userToken.substring(2), 'hex')
                }
            ]
        }),
        nonce: new BN(44).toArrayLike(Buffer, "be", 32) //increment nonce programatically
    });
    
    return mint;
}


module.exports = {
    executeBridge
};

