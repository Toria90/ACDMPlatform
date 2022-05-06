import {ethers} from "hardhat";
import {solidity} from "ethereum-waffle";
import chai from "chai";
import {
    AcdmPlatform,
    Dao,
    DaoStaking,
    ERC20MintBurn, IUniswapV2Pair__factory,
    Staking,
    UniswapV2FactoryMock,
    UniswapV2Router01Mock,
    WETH9
} from "../typechain-types"
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {BigNumber, BytesLike, Contract, ContractFactory, constants} from "ethers";
import Min = Mocha.reporters.Min;
import {Bytes} from "ethers/lib/utils";
import exp from "constants";
import daoStakingAbi from "../artifacts/contracts/DaoStaking.sol/DaoStaking.json";
import acdmPlatformAbi from "../artifacts/contracts/AcdmPlatform.sol/AcdmPlatform.json";

import {Block} from "@ethersproject/abstract-provider";

chai.use(solidity);
const { expect } = chai;

describe("DaoStaking contract", () => {
    let accounts : SignerWithAddress[];
    let daoStakingContract : DaoStaking;

    let depositInstrumentERC20 : ERC20MintBurn;
    let rewardInstrumentERC20 : ERC20MintBurn;

    const ratePercent : BigNumber = BigNumber.from(20);
    const maturityPeriodMin : BigNumber = BigNumber.from(20);
    const depositHoldTimeMin : BigNumber = BigNumber.from(10);

    let chairPerson : SignerWithAddress;
    let deployer : SignerWithAddress;
    let daoSettings : SignerWithAddress;

    const minimumQuorum : BigNumber = BigNumber.from(100);
    const debatingPeriodDuration : BigNumber = BigNumber.from(100);

    const daoStakingInterface = new ethers.utils.Interface(daoStakingAbi.abi);
    const acdmPlatformInterface = new ethers.utils.Interface(acdmPlatformAbi.abi);

    let acdmToken : ERC20MintBurn;
    const acdmTokenDecimals : number = 6;

    let acdmPlatform : AcdmPlatform;
    let acdmPlatformOwner : SignerWithAddress;

    let stakingContract : Staking;
    let daoContract : Dao;

    let roundTimeMs : number;

    let uniswapRouter : UniswapV2Router01Mock;
    let uniswapFactory : UniswapV2FactoryMock;
    let xxxToken : ERC20MintBurn;
    const xxxTokenDecimals : number = 18;
    let weth9 : WETH9;

    beforeEach(async () =>{
        accounts = await ethers.getSigners();
        [chairPerson, deployer, daoSettings, acdmPlatformOwner] = await ethers.getSigners();

        const erc20Factory = await ethers.getContractFactory("ERC20MintBurn");
        depositInstrumentERC20 = (await erc20Factory.connect(deployer).deploy("LP", "LP", 18)) as ERC20MintBurn;
        rewardInstrumentERC20 = (await erc20Factory.connect(deployer).deploy("XXX Coin", "XXX", 18)) as ERC20MintBurn;

        const daoStakingFactory = await ethers.getContractFactory("DaoStaking");
        daoStakingContract = (await daoStakingFactory.connect(deployer).deploy(
            chairPerson.address,
            minimumQuorum,
            debatingPeriodDuration,
            depositInstrumentERC20.address, 
            rewardInstrumentERC20.address,
            ratePercent,
            maturityPeriodMin,
            depositHoldTimeMin)) as DaoStaking;

        const stakingFactory = await ethers.getContractFactory("Staking");
        stakingContract = (await stakingFactory.connect(deployer).deploy(
            depositInstrumentERC20.address,
            rewardInstrumentERC20.address,
            ratePercent,
            maturityPeriodMin,
            depositHoldTimeMin)) as Staking;

        const daoFactory = await ethers.getContractFactory("Dao");
        daoContract = (await daoFactory.connect(deployer).deploy(
            chairPerson.address,
            minimumQuorum,
            debatingPeriodDuration)) as Dao;

        await daoStakingContract.connect(deployer).grantRole("0xe170b91786cf2088df84e339d2cbb48375ff66f93788d5d8c8a374f5975c98d1", daoSettings.address);
        await daoStakingContract.connect(deployer).grantRole("0x9557cf75b97593758eab5b18a0839f3d6c61d317432267fa442ec1813a82eb72", daoStakingContract.address);

        acdmToken = (await erc20Factory.connect(deployer).deploy("ACADEM Coin", "ACDM", acdmTokenDecimals)) as ERC20MintBurn;
        roundTimeMs = 3 * 24 * 60 * 60 * 1000;

        const weth9Factory : ContractFactory = await ethers.getContractFactory("WETH9");
        weth9 = (await weth9Factory.connect(deployer).deploy()) as WETH9;
        const uniswapFactoryFactory : ContractFactory = await ethers.getContractFactory("UniswapV2FactoryMock");
        uniswapFactory = (await uniswapFactoryFactory.connect(deployer).deploy(deployer.address)) as UniswapV2FactoryMock;
        const uniswapRouterFactory : ContractFactory = await ethers.getContractFactory("UniswapV2Router01Mock");
        uniswapRouter = (await uniswapRouterFactory.connect(deployer).deploy(uniswapFactory.address, weth9.address)) as UniswapV2Router01Mock;

        xxxToken = (await erc20Factory.connect(deployer).deploy("XXX Coin", "XXX", xxxTokenDecimals)) as ERC20MintBurn;

        const acdmPlatformFactory : ContractFactory = await ethers.getContractFactory("AcdmPlatform");
        acdmPlatform = (await acdmPlatformFactory.connect(deployer).deploy(acdmToken.address, daoStakingContract.address, BigNumber.from(roundTimeMs), acdmPlatformOwner.address, uniswapRouter.address, xxxToken.address, weth9.address)) as AcdmPlatform;
        await acdmToken.connect(deployer).grantRole("0xbf940c291290ff58137946bfa62793d380865fc927e0f056a5f0e262393a1686", acdmPlatform.address);
        await xxxToken.connect(deployer).grantRole("0xbf940c291290ff58137946bfa62793d380865fc927e0f056a5f0e262393a1686", acdmPlatform.address);
        await acdmPlatform.connect(deployer).grantRole("0x3b5d4cc60d3ec3516ee8ae083bd60934f6eb2a6c54b1229985c41bfb092b2603", daoStakingContract.address);
        await acdmPlatform.connect(deployer).grantRole("0x3b5d4cc60d3ec3516ee8ae083bd60934f6eb2a6c54b1229985c41bfb092b2603", deployer.address);
    });

    async function getProposalId(recipient : string, description: string, callData: string) : Promise<string> {
        let blockNumber : number = await ethers.provider.getBlockNumber();
        let block : Block = await ethers.provider.getBlock(blockNumber);
        return ethers.utils.solidityKeccak256(["address", "string", "bytes", "uint256"],[recipient, description, callData, block.timestamp]);
    }

    describe("stake", () =>{
        it("Should be get deposit tokens", async () =>{
            const account : SignerWithAddress = accounts[1];
            const depositAmount : number = 100;

            await depositInstrumentERC20.connect(deployer).mint(account.address, depositAmount);
            await depositInstrumentERC20.connect(account).approve(daoStakingContract.address, depositAmount);

            await daoStakingContract.connect(account).stake(depositAmount);

            expect(await depositInstrumentERC20.balanceOf(daoStakingContract.address)).to.equal(depositAmount);
        });

        it("Shouldn't be without approve", async () =>{
            const account : SignerWithAddress = accounts[1];
            const depositAmount : number = 100;

            await expect(daoStakingContract.connect(account).stake(depositAmount))
                .to.be.revertedWith("don't allowance");
        });
    });

    describe("claim", () =>{
        it("Shouldn't reward before maturity period", async () =>{
            const account : SignerWithAddress = accounts[1];
            const depositAmount : BigNumber = BigNumber.from(100);

            await depositInstrumentERC20.connect(deployer).mint(account.address, depositAmount);
            await depositInstrumentERC20.connect(account).approve(daoStakingContract.address, depositAmount);
            await daoStakingContract.connect(account).stake(depositAmount);

            await daoStakingContract.connect(account).claim();

            expect(await rewardInstrumentERC20.balanceOf(account.address)).to.equal(0);
        });

        it("Shouldn't reward without stake", async () =>{
            const account : SignerWithAddress = accounts[1];
            const depositAmount : number = 100;

            await daoStakingContract.connect(account).claim();

            expect(await rewardInstrumentERC20.balanceOf(account.address)).to.equal(0);
        });

        it("Should be reward after maturity period", async () =>{
            const account : SignerWithAddress = accounts[1];
            const depositAmount : number = 100;
            const rewardAmount : number = depositAmount * ratePercent.toNumber() / 100;

            await depositInstrumentERC20.connect(deployer).mint(account.address, depositAmount);
            await depositInstrumentERC20.connect(account).approve(daoStakingContract.address, depositAmount);
            await daoStakingContract.connect(account).stake(depositAmount);

            await ethers.provider.send('evm_increaseTime', [maturityPeriodMin.toNumber()*60]);

            await rewardInstrumentERC20.connect(deployer).mint(daoStakingContract.address, rewardAmount);
            await daoStakingContract.connect(account).claim();

            expect(await rewardInstrumentERC20.balanceOf(account.address)).to.equal(rewardAmount);
        });
    });

    describe("unstake", () =>{
        it("Shouldn't double close", async () => {
            const account: SignerWithAddress = accounts[1];
            const depositAmount: number = 100;
            const rewardAmount: number = depositAmount * ratePercent.toNumber() / 100;

            await depositInstrumentERC20.connect(deployer).mint(account.address, depositAmount);
            await depositInstrumentERC20.connect(account).approve(daoStakingContract.address, depositAmount);
            await daoStakingContract.connect(account).stake(depositAmount);

            await ethers.provider.send('evm_increaseTime', [depositHoldTimeMin.toNumber() * 60]);

            await daoStakingContract.connect(account).unstake();

            await ethers.provider.send('evm_increaseTime', [depositHoldTimeMin.toNumber() * 60]);

            await expect(daoStakingContract.connect(account).unstake())
                .to.be.revertedWith("don't have deposits");
        });

        it("Shouldn't double close. Clear Staking", async () => {
            const account: SignerWithAddress = accounts[1];
            const depositAmount: number = 100;
            const rewardAmount: number = depositAmount * ratePercent.toNumber() / 100;

            await depositInstrumentERC20.connect(deployer).mint(account.address, depositAmount);
            await depositInstrumentERC20.connect(account).approve(stakingContract.address, depositAmount);
            await stakingContract.connect(account).stake(depositAmount)

            await ethers.provider.send('evm_increaseTime', [depositHoldTimeMin.toNumber() * 60]);

            await stakingContract.connect(account).unstake();

            await ethers.provider.send('evm_increaseTime', [depositHoldTimeMin.toNumber() * 60]);

            await expect(stakingContract.connect(account).unstake())
                .to.be.revertedWith("don't have deposits");
        });

        it("Shouldn't unstake without stake", async () => {
            const account: SignerWithAddress = accounts[1];
            const depositAmount: number = 100;
            const rewardAmount: number = depositAmount * ratePercent.toNumber() / 100;

            await depositInstrumentERC20.connect(deployer).mint(account.address, depositAmount);
            await depositInstrumentERC20.connect(account).approve(stakingContract.address, depositAmount);
            await stakingContract.connect(account).stake(depositAmount)

            await ethers.provider.send('evm_increaseTime', [depositHoldTimeMin.toNumber() * 60]);

            await stakingContract.connect(account).unstake();

            await ethers.provider.send('evm_increaseTime', [depositHoldTimeMin.toNumber() * 60]);

            await expect(stakingContract.connect(account).unstake())
                .to.be.revertedWith("don't have deposits");
        });

        it("Shouldn't close deposit before hold time", async () => {
            const account: SignerWithAddress = accounts[1];
            const depositAmount: number = 100;
            const rewardAmount: number = depositAmount * ratePercent.toNumber() / 100;

            await depositInstrumentERC20.connect(deployer).mint(account.address, depositAmount);
            await depositInstrumentERC20.connect(account).approve(daoStakingContract.address, depositAmount);
            await daoStakingContract.connect(account).stake(depositAmount);

            await ethers.provider.send('evm_increaseTime', [depositHoldTimeMin.toNumber() * 60 - 10]);

            await expect(daoStakingContract.connect(account).unstake())
                .to.be.revertedWith("deposit hold");
        });
    });

    describe("setDepositHoldTimeMin", () => {
        it("Should revert", async () => {
            const newValue: BigNumber = BigNumber.from(depositHoldTimeMin.toNumber() - 1);
            const accountWithoutSettiongRole : SignerWithAddress = accounts[2];

            await expect(daoStakingContract.connect(accountWithoutSettiongRole).setDepositHoldTimeMin(newValue))
                .to.reverted;
        });

        it("Should set right new value", async () =>{
            const account : SignerWithAddress = accounts[5];
            const depositAmount : number = minimumQuorum.toNumber();
            const callData: string = daoStakingInterface.encodeFunctionData("setDepositHoldTimeMin", [123]);

            await depositInstrumentERC20.connect(deployer).mint(account.address, depositAmount);
            await depositInstrumentERC20.connect(account).approve(daoStakingContract.address, depositAmount);

            await daoStakingContract.connect(account).stake(depositAmount);

            await daoStakingContract.connect(chairPerson).addProposal(callData, daoStakingContract.address, "");
            let proposalId : string = await getProposalId(daoStakingContract.address, "", callData);
            await daoStakingContract.connect(account).vote(proposalId, true);

            await ethers.provider.send('evm_increaseTime', [debatingPeriodDuration.toNumber()]);

            await daoStakingContract.finishProposal(proposalId);

            expect(await daoStakingContract.depositHoldTimeMin())
                .to.be.equal(123);
        });
    });

    describe("dao set minimum quorum", () => {
        it("only for admin", async () => {
            const notAdmin: SignerWithAddress = accounts[5];
            await expect(daoStakingContract.connect(notAdmin).setMinimumQuorum(minimumQuorum))
                .to.be.reverted;
        });

        it("Should can't set zero value", async () => {
            await expect(daoStakingContract.connect(daoSettings).setMinimumQuorum(0))
                .to.be.revertedWith("quorum is zero");
        });

        it("Should set new value", async () => {
            const newValue: number = minimumQuorum.toNumber() + 1;
            await daoStakingContract.connect(daoSettings).setMinimumQuorum(newValue);
            expect(await daoStakingContract.minimumQuorum()).to.be.equal(newValue);
        });
    });

    describe("dao set duration", () => {
        it("only for admin", async () => {
            const notAdmin: SignerWithAddress = accounts[5];
            await expect(daoStakingContract.connect(notAdmin).setDebatingPeriodDuration(debatingPeriodDuration))
                .to.be.reverted;
        });

        it("Should can't set zero value", async () => {
            await expect(daoStakingContract.connect(daoSettings).setDebatingPeriodDuration(0))
                .to.be.revertedWith("duration is zero");
        });

        it("Should set new value", async () => {
            const newValue: number = debatingPeriodDuration.toNumber() + 1;
            await daoStakingContract.connect(daoSettings).setDebatingPeriodDuration(newValue);
            expect(await daoStakingContract.debatingPeriodDuration()).to.be.equal(newValue);
        });
    });

    describe("addProposal", () => {
        it("only for chairPerson", async () => {
            const notChairPerson: SignerWithAddress = accounts[5];
            const callData: string = acdmPlatformInterface.encodeFunctionData("setReferrer1CommissionSaleCoefficient", [6, 2]);
            await expect(daoStakingContract.connect(notChairPerson).addProposal(callData, acdmPlatform.address, ""))
                .to.be.reverted;
        });
    });

    describe("vote", () => {
        it("should be able for account with balance only", async () => {
            const account : SignerWithAddress = accounts[5];
            const callData: string = acdmPlatformInterface.encodeFunctionData("setReferrer1CommissionSaleCoefficient", [6, 2]);

            await daoStakingContract.connect(chairPerson).addProposal(callData, acdmPlatform.address, "");
            let proposalId : string = await getProposalId(acdmPlatform.address, "", callData);

            await expect(daoStakingContract.connect(account).vote(proposalId, true))
                .to.be.revertedWith("zero vote token balance");
        });

        it("should be able for account with balance only. Clear dao", async () => {
            const account : SignerWithAddress = accounts[5];
            const callData: string = acdmPlatformInterface.encodeFunctionData("setReferrer1CommissionSaleCoefficient", [6, 2]);

            await daoContract.connect(chairPerson).addProposal(callData, acdmPlatform.address, "");
            let proposalId : string = await getProposalId(acdmPlatform.address, "", callData);

            await expect(daoContract.connect(account).vote(proposalId, true))
                .to.be.revertedWith("zero vote token balance");
        });

        it("shouldn't be able if proposal isn't exist", async () => {
            const account : SignerWithAddress = accounts[5];
            const depositAmount : number = 100;
            const callData: string = acdmPlatformInterface.encodeFunctionData("setReferrer1CommissionSaleCoefficient", [6, 2]);

            await depositInstrumentERC20.connect(deployer).mint(account.address, depositAmount);
            await depositInstrumentERC20.connect(account).approve(daoStakingContract.address, depositAmount);

            await daoStakingContract.connect(account).stake(depositAmount);

            let proposalId : string = await getProposalId(acdmPlatform.address, "", callData);

            await expect(daoStakingContract.connect(account).vote(proposalId, true))
                .to.be.revertedWith("proposal isn't exist");
        });

        it("shouldn't be able double vote", async () => {
            const account : SignerWithAddress = accounts[5];
            const depositAmount : number = 100;
            const callData: string = acdmPlatformInterface.encodeFunctionData("setReferrer1CommissionSaleCoefficient", [6, 2]);

            await depositInstrumentERC20.connect(deployer).mint(account.address, depositAmount);
            await depositInstrumentERC20.connect(account).approve(daoStakingContract.address, depositAmount);

            await daoStakingContract.connect(account).stake(depositAmount);

            await daoStakingContract.connect(chairPerson).addProposal(callData, acdmPlatform.address, "");
            let proposalId : string = await getProposalId(acdmPlatform.address, "", callData);
            await daoStakingContract.connect(account).vote(proposalId, true);

            await expect(daoStakingContract.connect(account).vote(proposalId, true))
                .to.be.revertedWith("vote already exists");
        });

        it("should change last proposals end date", async () => {
            const account : SignerWithAddress = accounts[5];
            const depositAmount : number = 100;
            const callData: string = acdmPlatformInterface.encodeFunctionData("setReferrer1CommissionSaleCoefficient", [6, 2]);

            await depositInstrumentERC20.connect(deployer).mint(account.address, depositAmount);
            await depositInstrumentERC20.connect(account).approve(daoStakingContract.address, depositAmount);

            await daoStakingContract.connect(account).stake(depositAmount);

            await daoStakingContract.connect(chairPerson).addProposal(callData, acdmPlatform.address, "");
            let proposalId : string = await getProposalId(acdmPlatform.address, "", callData);

            await daoStakingContract.connect(chairPerson).addProposal(callData, acdmPlatform.address, "");
            let proposalId2 : string = await getProposalId(acdmPlatform.address, "", callData);
            await daoStakingContract.connect(account).vote(proposalId2, true);

            await daoStakingContract.connect(account).vote(proposalId, true);

        });

        it("shouldn't be able after proposal duration", async () => {
            const account : SignerWithAddress = accounts[5];
            const depositAmount : number = 100;
            const callData: string = acdmPlatformInterface.encodeFunctionData("setReferrer1CommissionSaleCoefficient", [6, 2]);

            await depositInstrumentERC20.connect(deployer).mint(account.address, depositAmount);
            await depositInstrumentERC20.connect(account).approve(daoStakingContract.address, depositAmount);

            await daoStakingContract.connect(account).stake(depositAmount);

            await daoStakingContract.connect(chairPerson).addProposal(callData, acdmPlatform.address, "");
            let proposalId : string = await getProposalId(acdmPlatform.address, "", callData);

            await ethers.provider.send('evm_increaseTime', [debatingPeriodDuration.toNumber()]);

            await expect(daoStakingContract.connect(account).vote(proposalId, true))
                .to.be.revertedWith("proposal period is closed");
        });
    });

    describe("finishProposal", () => {

        it("shouldn't be able if proposal isn't exist", async () => {
            const callData: string = acdmPlatformInterface.encodeFunctionData("setReferrer1CommissionSaleCoefficient", [6, 2]);

            let proposalId : string = await getProposalId(acdmPlatform.address, "", callData);
            await expect(daoStakingContract.finishProposal(proposalId))
                .to.be.revertedWith("proposal isn't exist");
        });

        it("shouldn't be able if proposal period isn't closed", async () => {
            const account : SignerWithAddress = accounts[5];
            const depositAmount : number = 100;
            const callData: string = acdmPlatformInterface.encodeFunctionData("setReferrer1CommissionSaleCoefficient", [6, 2]);

            await depositInstrumentERC20.connect(deployer).mint(account.address, depositAmount);
            await depositInstrumentERC20.connect(account).approve(daoStakingContract.address, depositAmount);

            await daoStakingContract.connect(account).stake(depositAmount);

            await daoStakingContract.connect(chairPerson).addProposal(callData, acdmPlatform.address, "");
            let proposalId : string = await getProposalId(acdmPlatform.address, "", callData);
            await daoStakingContract.connect(account).vote(proposalId, true);

            await ethers.provider.send('evm_increaseTime', [debatingPeriodDuration.toNumber()-2]);

            await expect(daoStakingContract.finishProposal(proposalId))
                .to.be.revertedWith("proposal period isn't closed");
        });

        it("shouldn't be able if not enough quorum", async () => {
            const account : SignerWithAddress = accounts[5];
            const depositAmount : number = minimumQuorum.toNumber() - 1;
            const callData: string = acdmPlatformInterface.encodeFunctionData("setReferrer1CommissionSaleCoefficient", [6, 2]);

            await depositInstrumentERC20.connect(deployer).mint(account.address, depositAmount);
            await depositInstrumentERC20.connect(account).approve(daoStakingContract.address, depositAmount);

            await daoStakingContract.connect(account).stake(depositAmount);

            await daoStakingContract.connect(chairPerson).addProposal(callData, acdmPlatform.address, "");
            let proposalId : string = await getProposalId(acdmPlatform.address, "", callData);
            await daoStakingContract.connect(account).vote(proposalId, true);

            await ethers.provider.send('evm_increaseTime', [debatingPeriodDuration.toNumber()]);

            await expect(daoStakingContract.finishProposal(proposalId))
                .to.be.revertedWith("not enough quorum");
        });

        it("shouldn't call recipient when cons", async () => {
            const account : SignerWithAddress = accounts[5];
            const depositAmount : number = minimumQuorum.toNumber();
            const callData: string = acdmPlatformInterface.encodeFunctionData("setReferrer1CommissionSaleCoefficient", [6, 2]);

            await depositInstrumentERC20.connect(deployer).mint(account.address, depositAmount);
            await depositInstrumentERC20.connect(account).approve(daoStakingContract.address, depositAmount);

            await daoStakingContract.connect(account).stake(depositAmount);

            await daoStakingContract.connect(chairPerson).addProposal(callData, acdmPlatform.address, "");
            let proposalId : string = await getProposalId(acdmPlatform.address, "", callData);
            await daoStakingContract.connect(account).vote(proposalId, false);

            await ethers.provider.send('evm_increaseTime', [debatingPeriodDuration.toNumber()]);

            await daoStakingContract.finishProposal(proposalId);

            const saleCoefficient = (await acdmPlatform.referrer1Commission()).saleCoefficient;
            expect((await acdmPlatform.referrer1Commission()).saleCoefficient)
                .to.be.equal(saleCoefficient);
        });

        it("should call recipient when pons", async () => {
            const account : SignerWithAddress = accounts[5];
            const depositAmount : number = minimumQuorum.toNumber();
            const callData: string = acdmPlatformInterface.encodeFunctionData("setReferrer1CommissionSaleCoefficient", [6, 2]);

            await depositInstrumentERC20.connect(deployer).mint(account.address, depositAmount);
            await depositInstrumentERC20.connect(account).approve(daoStakingContract.address, depositAmount);

            await daoStakingContract.connect(account).stake(depositAmount);

            await daoStakingContract.connect(chairPerson).addProposal(callData, acdmPlatform.address, "");
            let proposalId : string = await getProposalId(acdmPlatform.address, "", callData);
            await daoStakingContract.connect(account).vote(proposalId, true);

            await ethers.provider.send('evm_increaseTime', [debatingPeriodDuration.toNumber()]);

            await daoStakingContract.finishProposal(proposalId);

            expect((await acdmPlatform.referrer1Commission()).saleCoefficient)
                .to.be.equal(6);
        });

        it("should call recipient with error when wrong callData", async () => {
            const account : SignerWithAddress = accounts[5];
            const depositAmount : number = minimumQuorum.toNumber();
            const callData: string = acdmPlatformInterface.encodeFunctionData("setReferrer1CommissionSaleCoefficient", [100, 2]);

            await depositInstrumentERC20.connect(deployer).mint(account.address, depositAmount);
            await depositInstrumentERC20.connect(account).approve(daoStakingContract.address, depositAmount);

            await daoStakingContract.connect(account).stake(depositAmount);

            await daoStakingContract.connect(chairPerson).addProposal(callData, acdmPlatform.address, "");
            let proposalId : string = await getProposalId(acdmPlatform.address, "", callData);
            await daoStakingContract.connect(account).vote(proposalId, true);

            await ethers.provider.send('evm_increaseTime', [debatingPeriodDuration.toNumber()]);

            await expect(daoStakingContract.finishProposal(proposalId))
                .to.be.revertedWith("ERROR call recipient");
        });
    });

    describe("sendToOwner", () => {
        it("should send eth to owner", async () => {
            const amount : BigNumber = BigNumber.from(10 * Math.pow(10, acdmTokenDecimals));
            const price : BigNumber = BigNumber.from(200000000000000);
            const buyValue : BigNumber = BigNumber.from(amount.toNumber() / Math.pow(10, acdmTokenDecimals) * price.toNumber());
            const seller : SignerWithAddress = accounts[1];
            const buyer : SignerWithAddress = accounts[2];
            const referrer1 : SignerWithAddress = accounts[3];
            const referrer2 : SignerWithAddress = accounts[4];

            await acdmPlatform.startSaleRound();
            await acdmPlatform.startTradeRound();

            await acdmToken.connect(deployer).mint(seller.address, amount);
            await acdmToken.connect(seller).approve(acdmPlatform.address, amount);
            await acdmPlatform.connect(seller).addOrder(amount, price);
            await acdmPlatform.connect(buyer).redeemOrder({value: buyValue});

            await ethers.provider.send("evm_increaseTime", [roundTimeMs]);

            const salePrice: BigNumber = await acdmPlatform.nextSaleRoundPrice();
            await acdmPlatform.startSaleRound();
            const saleVolume : BigNumber = await acdmPlatform.saleVolume();

            const buyAcdmTotal : BigNumber = BigNumber.from(140 * salePrice.toNumber());
            await acdmPlatform.connect(buyer).buyAcdm({value: BigNumber.from(buyAcdmTotal)});


            const account : SignerWithAddress = accounts[5];
            const depositAmount : number = minimumQuorum.toNumber();
            const callData: string = acdmPlatformInterface.encodeFunctionData("sendToOwner", [100]);

            await depositInstrumentERC20.connect(deployer).mint(account.address, depositAmount);
            await depositInstrumentERC20.connect(account).approve(daoStakingContract.address, depositAmount);

            await daoStakingContract.connect(account).stake(depositAmount);

            await daoStakingContract.connect(chairPerson).addProposal(callData, acdmPlatform.address, "");
            let proposalId : string = await getProposalId(acdmPlatform.address, "", callData);
            await daoStakingContract.connect(account).vote(proposalId, true);

            await ethers.provider.send('evm_increaseTime', [debatingPeriodDuration.toNumber()]);

            const ownerBalanceBefore : BigNumber = await ethers.provider.getBalance(acdmPlatformOwner.address);
            await daoStakingContract.finishProposal(proposalId);

            expect(await ethers.provider.getBalance(acdmPlatformOwner.address))
                .to.equal(BigNumber.from(ownerBalanceBefore.toBigInt() + BigInt(100)));
        });
    });

    describe("swap eth to xxx tokens", () => {
        it("should transfer xxx tokens", async () => {
            const amount : BigNumber = BigNumber.from(10 * Math.pow(10, acdmTokenDecimals));
            const price : BigNumber = BigNumber.from(200000000000000);
            const buyValue : BigNumber = BigNumber.from(amount.toNumber() / Math.pow(10, acdmTokenDecimals) * price.toNumber());
            const seller : SignerWithAddress = accounts[1];
            const buyer : SignerWithAddress = accounts[2];

            await acdmPlatform.startSaleRound();
            await acdmPlatform.startTradeRound();

            await acdmToken.connect(deployer).mint(seller.address, amount);
            await acdmToken.connect(seller).approve(acdmPlatform.address, amount);
            await acdmPlatform.connect(seller).addOrder(amount, price);
            await acdmPlatform.connect(buyer).redeemOrder({value: buyValue});

            await ethers.provider.send("evm_increaseTime", [roundTimeMs]);

            const salePrice: BigNumber = await acdmPlatform.nextSaleRoundPrice();
            await acdmPlatform.startSaleRound();

            const buyAcdmTotal : BigNumber = BigNumber.from(140 * salePrice.toNumber());
            await acdmPlatform.connect(buyer).buyAcdm({value: BigNumber.from(buyAcdmTotal)});


            await xxxToken.connect(deployer).mint(deployer.address, BigInt(1000000 * 10**xxxTokenDecimals));
            await xxxToken.connect(deployer).approve(uniswapRouter.address, BigInt(1000 * 10**xxxTokenDecimals));
            let blockNumber = await ethers.provider.getBlockNumber();
            let timestamp = (await ethers.provider.getBlock(blockNumber)).timestamp;
            await uniswapRouter.addLiquidityETH(
                xxxToken.address, 
                1000,
                100,
                0.00000001 * 10**18,
                deployer.address,
                timestamp + 1,
                {value:0.000001*10**18}
                );


            const account : SignerWithAddress = accounts[5];
            const depositAmount : number = minimumQuorum.toNumber();
            const callData: string = acdmPlatformInterface.encodeFunctionData("swapExactETHForTokens", [1]);

            await depositInstrumentERC20.connect(deployer).mint(account.address, depositAmount);
            await depositInstrumentERC20.connect(account).approve(daoStakingContract.address, depositAmount);

            await daoStakingContract.connect(account).stake(depositAmount);

            await daoStakingContract.connect(chairPerson).addProposal(callData, acdmPlatform.address, "");
            let proposalId : string = await getProposalId(acdmPlatform.address, "", callData);
            await daoStakingContract.connect(account).vote(proposalId, true);

            await ethers.provider.send('evm_increaseTime', [debatingPeriodDuration.toNumber()]);

            await daoStakingContract.finishProposal(proposalId);

            expect(await xxxToken.balanceOf(acdmPlatform.address))
                .to.equal(1);
        });
    });

    describe("burnXxxTokens", () => {
        it("should change token balance", async () => {
            const amount : BigNumber = BigNumber.from(10 * Math.pow(10, acdmTokenDecimals));
            const price : BigNumber = BigNumber.from(200000000000000);
            const buyValue : BigNumber = BigNumber.from(amount.toNumber() / Math.pow(10, acdmTokenDecimals) * price.toNumber());
            const seller : SignerWithAddress = accounts[1];
            const buyer : SignerWithAddress = accounts[2];

            await acdmPlatform.startSaleRound();
            await acdmPlatform.startTradeRound();

            await acdmToken.connect(deployer).mint(seller.address, amount);
            await acdmToken.connect(seller).approve(acdmPlatform.address, amount);
            await acdmPlatform.connect(seller).addOrder(amount, price);
            await acdmPlatform.connect(buyer).redeemOrder({value: buyValue});

            await ethers.provider.send("evm_increaseTime", [roundTimeMs]);

            const salePrice: BigNumber = await acdmPlatform.nextSaleRoundPrice();
            await acdmPlatform.startSaleRound();

            const buyAcdmTotal : BigNumber = BigNumber.from(140 * salePrice.toNumber());
            await acdmPlatform.connect(buyer).buyAcdm({value: BigNumber.from(buyAcdmTotal)});


            await xxxToken.connect(deployer).mint(deployer.address, BigInt(1000000 * 10**xxxTokenDecimals));
            await xxxToken.connect(deployer).approve(uniswapRouter.address, BigInt(1000 * 10**xxxTokenDecimals));
            let blockNumber = await ethers.provider.getBlockNumber();
            let timestamp = (await ethers.provider.getBlock(blockNumber)).timestamp;
            await uniswapRouter.addLiquidityETH(
                xxxToken.address,
                1000,
                100,
                0.00000001 * 10**18,
                deployer.address,
                timestamp + 1,
                {value:0.000001*10**18}
            );


            let account : SignerWithAddress = accounts[5];
            let depositAmount : number = minimumQuorum.toNumber();
            let callData: string = acdmPlatformInterface.encodeFunctionData("swapExactETHForTokens", [1]);

            await depositInstrumentERC20.connect(deployer).mint(account.address, depositAmount);
            await depositInstrumentERC20.connect(account).approve(daoStakingContract.address, depositAmount);

            await daoStakingContract.connect(account).stake(depositAmount);

            await daoStakingContract.connect(chairPerson).addProposal(callData, acdmPlatform.address, "");
            let proposalId : string = await getProposalId(acdmPlatform.address, "", callData);
            await daoStakingContract.connect(account).vote(proposalId, true);

            await ethers.provider.send('evm_increaseTime', [debatingPeriodDuration.toNumber()]);

            await daoStakingContract.finishProposal(proposalId);


            account = accounts[5];
            depositAmount = minimumQuorum.toNumber();
            callData = acdmPlatformInterface.encodeFunctionData("burnXxxTokens", [1]);

            await depositInstrumentERC20.connect(deployer).mint(account.address, depositAmount);
            await depositInstrumentERC20.connect(account).approve(daoStakingContract.address, depositAmount);

            await daoStakingContract.connect(account).stake(depositAmount);

            await daoStakingContract.connect(chairPerson).addProposal(callData, acdmPlatform.address, "");
            proposalId = await getProposalId(acdmPlatform.address, "", callData);
            await daoStakingContract.connect(account).vote(proposalId, true);

            await ethers.provider.send('evm_increaseTime', [debatingPeriodDuration.toNumber()]);

            await daoStakingContract.finishProposal(proposalId);

            expect(await xxxToken.balanceOf(acdmPlatform.address))
                .to.equal(0);
        });
    });

});