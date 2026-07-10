export const STAKING_PROGRAM_ID = "BHaXES9ZvPVozojv3Z7ETV16vjBpWNQL59mDiwoPtNPG";

export const STAKING_AUTHORITY = "HJnpCRqahd2Zunhx1VyY9d9Hj7UyLSNWQEavybJC3MSa";

export interface StakePoolAddresses {
    stakePool: string;
    lstMint: string;
    withdrawAuthority: string;
    reserveStake: string;
    managerFeeAccount: string;
    stakePoolProgram: string;
}

export const MAINNET_POOL: StakePoolAddresses = {
    stakePool: "Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb",
    lstMint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
    withdrawAuthority: "6iQKfEyhr3bZMotVkW6beNZz5CPAkiwvgV2CTje9pVSS",
    reserveStake: "BgKUXdS29YcHCFrPm5M8oLHiTzZaMDjsebggjoaQ6KFL",
    managerFeeAccount: "8yoigZfzZ1nNaadumY9uPVD118225UYHTDpmjpr2nrSa",
    stakePoolProgram: "SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy"
};

export const DEVNET_POOL: StakePoolAddresses = {
    stakePool: "JitoY5pcAxWX6iyP2QdFwTznGb8A99PRCUCVVxB46WZ",
    lstMint: "J1tos8mqbhdGcF3pgj4PCKyVjzWSURcpLZU7pPGHxSYi",
    withdrawAuthority: "8HPpFV5PFqGmDumjRTFw9BhsjrZYjJBDuHX2p6H5nBmd",
    reserveStake: "Dsd1zgN4XtxC6239vNznTNb6akTLNQeSBKoJqYjNps5e",
    managerFeeAccount: "77MybzFEM9WbZLsGtoiX2WACJ4K5JbxU9HBKUVapb5KN",
    stakePoolProgram: "DPoo15wWDqpPJJtS2MUZ49aRxqz5ZaaJCJP4z8bLuib"
};
