

async function err(n = 0) { 
    const [ callerAddr, caller2Addr ] = await hre.ethers.provider.listAccounts();

    return {
        alreadyInitialized: "VM Exception while processing transaction: reverted with reason string 'Initializable: contract is already initialized'",
        notAuthorized: (function (m) {
            switch(m) {
                case callerAddr:
                case caller2Addr:
                    return `VM Exception while processing transaction: reverted with custom error 'NotAuthorized("${m}")'`;
                case 1:
                    return 'Transaction reverted without a reason string';
                case 2:
                    return "VM Exception while processing transaction: reverted with reason string 'LibDiamond: Must be contract owner'";
                
            }
        })(n),
        notProxy: "VM Exception while processing transaction: reverted with custom error 'NotAccount()'",
        notOwner: "VM Exception while processing transaction: reverted with reason string 'Ownable: caller is not the owner'",
        zeroAddress: `VM Exception while processing transaction: reverted with custom error 'CantBeZero("address")'`,
        zeroSlippage: `VM Exception while processing transaction: reverted with custom error 'CantBeZero("slippage")'`,
        zeroName: `VM Exception while processing transaction: reverted with custom error 'CantBeZero("name")'`,
        tokenNotFound: `VM Exception while processing transaction: reverted with custom error 'TokenNotInDatabase("${n}")'`,
        zeroMsgValue: `VM Exception while processing transaction: reverted with custom error 'CantBeZero("msg.value")'`,
        zeroShares: `VM Exception while processing transaction: reverted with custom error 'CantBeZero("shares")'`,
        tokenInDatabase: `VM Exception while processing transaction: reverted with custom error 'TokenAlreadyInDatabase("${n}")'`,
        invalidName: "VM Exception while processing transaction: reverted with custom error 'NameTooLong()'",
        l1TokenDisabled: `VM Exception while processing transaction: reverted with custom error 'L1TokenDisabled("${n}")'`,
        noTaskId: `call revert exception [ See: https://links.ethers.org/v5-errors-CALL_EXCEPTION ] (method="getTaskID(address,address)", data="0xec0b769f", errorArgs=[], errorName="NoTaskId", errorSignature="NoTaskId()", reason=null, code=CALL_EXCEPTION, version=abi/5.7.0)`,
        userNotInDatabase: `VM Exception while processing transaction: reverted with custom error 'UserNotInDatabase("${n}")'`,
        notAccount: "VM Exception while processing transaction: reverted with custom error 'NotAccount()'"
    };
    
} 


module.exports = {
    err
};