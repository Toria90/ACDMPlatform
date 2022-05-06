import {ethers} from "hardhat";
import {solidity} from "ethereum-waffle";
import chai from "chai";
import {AcdmPlatform, ERC20MintBurn, UniswapV2Router01Mock, UniswapV2FactoryMock, WETH9} from "../typechain-types"
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {BigNumber, BytesLike, Contract, ContractFactory, constants} from "ethers";
import Min = Mocha.reporters.Min;
import {Bytes} from "ethers/lib/utils";
import exp from "constants";
import erc20Abi from "../artifacts/contracts/ERC20MintBurn.sol/ERC20MintBurn.json";
import {Block} from "@ethersproject/abstract-provider";

chai.use(solidity);
const { expect } = chai;

describe("AcdmPlatform contract", () => {
    let accounts : SignerWithAddress[];
    let daoRoleAccount : SignerWithAddress;
    let deployer : SignerWithAddress;

    let acdmToken : ERC20MintBurn;
    const acdmTokenDecimals : number = 6;

    let acdmPlatform : AcdmPlatform;
    let acdmPlatformOwner : SignerWithAddress;

    let roundTimeMs : number;

    let uniswapRouter : UniswapV2Router01Mock;
    let uniswapFactory : UniswapV2FactoryMock;
    let xxxToken : ERC20MintBurn;
    const xxxTokenDecimals : number = 18;
    let weth9 : WETH9;

    const salePrices : number[] = [
        0.00001 * Math.pow(10,18) ,
        0.0000143 * Math.pow(10,18),
        0.0000187 * Math.pow(10,18)
    ];

    beforeEach(async () =>{
        accounts = await ethers.getSigners();
        [daoRoleAccount, deployer, acdmPlatformOwner] = await ethers.getSigners();

        const erc20Factory : ContractFactory = await ethers.getContractFactory("ERC20MintBurn");
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
        acdmPlatform = (await acdmPlatformFactory.connect(deployer).deploy(acdmToken.address, daoRoleAccount.address, BigNumber.from(roundTimeMs), acdmPlatformOwner.address, uniswapRouter.address, xxxToken.address, weth9.address)) as AcdmPlatform;
        await acdmToken.connect(deployer).grantRole("0xbf940c291290ff58137946bfa62793d380865fc927e0f056a5f0e262393a1686", acdmPlatform.address);
        await xxxToken.connect(deployer).grantRole("0xbf940c291290ff58137946bfa62793d380865fc927e0f056a5f0e262393a1686", acdmPlatform.address);
    });

    describe("deploy", () => {
        it("Should set right round time ms", async () =>{
            expect(await acdmPlatform.roundTimeMs()).to.equal(roundTimeMs);
        });

        it("Should set right acdm token", async () =>{
            expect(await acdmPlatform.acdmToken()).to.equal(acdmToken.address);
        });
    });

    describe("start sale round", () => {
        it("shouldn't be able to start when trade round isn't finished", async () => {

            await acdmPlatform.startSaleRound();
            await ethers.provider.send("evm_increaseTime", [roundTimeMs]);
            await acdmPlatform.startTradeRound();

            await ethers.provider.send("evm_increaseTime", [roundTimeMs - 1]);

            await expect(acdmPlatform.startSaleRound())
                .to.revertedWith("trade round isn't finished");

        });

        it("shouldn't be able to double start", async () => {
            await acdmPlatform.startSaleRound();
            await expect(acdmPlatform.startSaleRound())
                .to.revertedWith("sale round already started");
        });

        it("shouldn't mint acdm tokens if sale round volume is zero", async () => {
            await acdmPlatform.startSaleRound();
            expect(await acdmToken.balanceOf(acdmPlatform.address))
                .to.equal(0);
        });

        it("should mint right volume of tokens", async () => {
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

            expect(await acdmToken.balanceOf(buyer.address))
                .to.equal(amount);

            await ethers.provider.send("evm_increaseTime", [roundTimeMs]);

            const nextPrice : BigNumber = await acdmPlatform.nextSaleRoundPrice();
            await acdmPlatform.startSaleRound();

            expect(await acdmToken.balanceOf(acdmPlatform.address))
                .to.equal(BigNumber.from(139 * Math.pow(10, acdmTokenDecimals)));
        });
    });

    describe("next sale round price", () => {
        it("should be right for first round", async () => {
            expect((await acdmPlatform.nextSaleRoundPrice()).toNumber())
                .to.equal(salePrices[0]);
        });

        it("should be right for second round", async () => {
            await acdmPlatform.startSaleRound();
            expect((await acdmPlatform.nextSaleRoundPrice()).toNumber())
                .to.equal(salePrices[1]);
        });
    });

    describe("start trade round", () => {
        it("shouldn't be able to start when sale round isn't finished. First start", async () => {
            await expect(acdmPlatform.startTradeRound())
                .to.revertedWith("sale round isn't finished");
        });

        it("shouldn't be able to start when sale round isn't finished", async () => {
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

            await acdmPlatform.startSaleRound();

            await expect(acdmPlatform.startTradeRound())
                .to.revertedWith("sale round isn't finished");
        });

        it("should be able to start when sale round total is zero", async () => {

            await acdmPlatform.startSaleRound();
            await acdmPlatform.startTradeRound();

            await ethers.provider.send("evm_increaseTime", [roundTimeMs + 1]);

            await acdmPlatform.startSaleRound();

            await expect(acdmPlatform.startTradeRound())
                .not.to.be.reverted;
        });

        it("shouldn't be able when trade round already started", async () =>{
            await acdmPlatform.startSaleRound();
            await acdmPlatform.startTradeRound();

            await expect(acdmPlatform.startTradeRound())
                .to.be.revertedWith("trade round already started");
        });

        it("should burn previous tokens", async ()=> {
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

            await acdmPlatform.startSaleRound();
            await ethers.provider.send("evm_increaseTime", [roundTimeMs + 1]);
            await acdmPlatform.startTradeRound();

            expect(await acdmToken.balanceOf(acdmPlatform.address))
                .to.be.equal(0);
        });
    });

    describe("buy acdm", () => {
        it("shouldn't be able when sale round is finished", async () => {
            await acdmPlatform.startSaleRound();
            await acdmPlatform.startTradeRound();

            await expect(acdmPlatform.buyAcdm())
                .to.revertedWith("sale round is finished");
        });

        it("should send all tokens", async () => {
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

            expect(await acdmToken.balanceOf(acdmPlatform.address))
                .to.equal(0);
        });

        it("should send referrer commission", async () => {
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

            await acdmPlatform.connect(referrer2).register(constants.AddressZero);
            await acdmPlatform.connect(referrer1).register(referrer2.address);
            await acdmPlatform.connect(buyer).register(referrer1.address);

            const balanceReferrer1Before : BigNumber = await referrer1.getBalance();
            const balanceReferrer2Before : BigNumber = await referrer2.getBalance();
            const balancePlatformBefore : BigNumber = await ethers.provider.getBalance(acdmPlatform.address);

            const buyAcdmTotal : BigNumber = BigNumber.from(saleVolume.toNumber()/Math.pow(10, acdmTokenDecimals) * salePrice.toNumber());
            await acdmPlatform.connect(buyer).buyAcdm({value: BigNumber.from(buyAcdmTotal)});

            const referrer1Commission = await acdmPlatform.referrer1Commission();
            const referrer2Commission = await acdmPlatform.referrer2Commission();
            let _referrer1CommissionSale : BigNumber = BigNumber.from(referrer1Commission.saleCoefficient.toNumber()/Math.pow(10,referrer1Commission.saleCoefficientDecimals.toNumber())*1000);
            let _referrer2CommissionSale : BigNumber = BigNumber.from(referrer2Commission.saleCoefficient.toNumber()/Math.pow(10,referrer2Commission.saleCoefficientDecimals.toNumber())*1000);
            let platformCommissionSale : BigNumber = BigNumber.from(1000 - _referrer1CommissionSale.toNumber() - _referrer2CommissionSale.toNumber());

            expect(await referrer1.getBalance())
                .to.equal(balanceReferrer1Before.toBigInt() + buyAcdmTotal.toBigInt()*_referrer1CommissionSale.toBigInt()/BigNumber.from(1000).toBigInt());

            expect(await referrer2.getBalance())
                .to.equal(balanceReferrer2Before.toBigInt() + buyAcdmTotal.toBigInt()*_referrer2CommissionSale.toBigInt()/BigNumber.from(1000).toBigInt());

            expect(await ethers.provider.getBalance(acdmPlatform.address))
                .to.equal(balancePlatformBefore.toBigInt() + buyAcdmTotal.toBigInt()*platformCommissionSale.toBigInt()/BigNumber.from(1000).toBigInt());
        });

        it("shouldn't send referrer 2 commission", async () => {
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

            await acdmPlatform.connect(referrer2).register(constants.AddressZero);
            await acdmPlatform.connect(referrer1).register(constants.AddressZero);
            await acdmPlatform.connect(buyer).register(referrer1.address);

            const balanceReferrer1Before : BigNumber = await referrer1.getBalance();
            const balanceReferrer2Before : BigNumber = await referrer2.getBalance();
            const balancePlatformBefore : BigNumber = await ethers.provider.getBalance(acdmPlatform.address);

            const buyAcdmTotal : BigNumber = BigNumber.from(saleVolume.toNumber()/Math.pow(10, acdmTokenDecimals) * salePrice.toNumber());
            await acdmPlatform.connect(buyer).buyAcdm({value: BigNumber.from(buyAcdmTotal)});

            const referrer1Commission = await acdmPlatform.referrer1Commission();
            const referrer2Commission = await acdmPlatform.referrer2Commission();
            let _referrer1CommissionSale : BigNumber = BigNumber.from(referrer1Commission.saleCoefficient.toNumber()/Math.pow(10,referrer1Commission.saleCoefficientDecimals.toNumber())*1000);
            let _referrer2CommissionSale : BigNumber = BigNumber.from(0);
            let platformCommissionSale : BigNumber = BigNumber.from(1000 - _referrer1CommissionSale.toNumber() - _referrer2CommissionSale.toNumber());

            expect(await referrer1.getBalance())
                .to.equal(balanceReferrer1Before.toBigInt() + buyAcdmTotal.toBigInt()*_referrer1CommissionSale.toBigInt()/BigNumber.from(1000).toBigInt());

            expect(await referrer2.getBalance())
                .to.equal(balanceReferrer2Before.toBigInt() + buyAcdmTotal.toBigInt()*_referrer2CommissionSale.toBigInt()/BigNumber.from(1000).toBigInt());

            expect(await ethers.provider.getBalance(acdmPlatform.address))
                .to.equal(balancePlatformBefore.toBigInt() + buyAcdmTotal.toBigInt()*platformCommissionSale.toBigInt()/BigNumber.from(1000).toBigInt());
        });

        it("shouldn't send referrer commission", async () => {
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

            await acdmPlatform.connect(referrer2).register(constants.AddressZero);
            await acdmPlatform.connect(referrer1).register(referrer2.address);
            await acdmPlatform.connect(buyer).register(constants.AddressZero);

            const balanceReferrer1Before : BigNumber = await referrer1.getBalance();
            const balanceReferrer2Before : BigNumber = await referrer2.getBalance();
            const balancePlatformBefore : BigNumber = await ethers.provider.getBalance(acdmPlatform.address);

            const buyAcdmTotal : BigNumber = BigNumber.from(saleVolume.toNumber()/Math.pow(10, acdmTokenDecimals) * salePrice.toNumber());
            await acdmPlatform.connect(buyer).buyAcdm({value: BigNumber.from(buyAcdmTotal)});

            const referrer1Commission = await acdmPlatform.referrer1Commission();
            const referrer2Commission = await acdmPlatform.referrer2Commission();
            let _referrer1CommissionSale : BigNumber = BigNumber.from(0);
            let _referrer2CommissionSale : BigNumber = BigNumber.from(0);
            let platformCommissionSale : BigNumber = BigNumber.from(1000 - _referrer1CommissionSale.toNumber() - _referrer2CommissionSale.toNumber());

            expect(await referrer1.getBalance())
                .to.equal(balanceReferrer1Before.toBigInt() + buyAcdmTotal.toBigInt()*_referrer1CommissionSale.toBigInt()/BigNumber.from(1000).toBigInt());

            expect(await referrer2.getBalance())
                .to.equal(balanceReferrer2Before.toBigInt() + buyAcdmTotal.toBigInt()*_referrer2CommissionSale.toBigInt()/BigNumber.from(1000).toBigInt());

            expect(await ethers.provider.getBalance(acdmPlatform.address))
                .to.equal(balancePlatformBefore.toBigInt() + buyAcdmTotal.toBigInt()*platformCommissionSale.toBigInt()/BigNumber.from(1000).toBigInt());
        });
    });

    describe("register", () => {
        it("Shouldn't be able double register", async () => {
            const account : SignerWithAddress = accounts[1];
            await acdmPlatform.connect(account).register(constants.AddressZero);

            await expect(acdmPlatform.connect(account).register(constants.AddressZero))
                .to.revertedWith("already registered");
        });

        it("Shouldn't be able if referrer isn't registered", async () => {
            const account : SignerWithAddress = accounts[1];
            const referrer : SignerWithAddress = accounts[2];
            await expect(acdmPlatform.connect(account).register(referrer.address))
                .to.revertedWith("referrer isn't registered");
        });
    });

    describe("change referrer commission", () => {
        it("should set right referrer 1 sale commission", async () => {
            const newValue: BigNumber = BigNumber.from(1);
            const newDecimals: BigNumber = BigNumber.from(5);
            await acdmPlatform.connect(daoRoleAccount).setReferrer1CommissionSaleCoefficient(newValue, newDecimals);
            const newReferrerCommission = await acdmPlatform.referrer1Commission();
            expect(newReferrerCommission.saleCoefficient)
                .to.equal(newValue);
            expect(newReferrerCommission.saleCoefficientDecimals)
                .to.equal(newDecimals);
        });

        it("should set right referrer 2 sale commission", async () => {
            const newValue: BigNumber = BigNumber.from(1);
            const newDecimals: BigNumber = BigNumber.from(5);
            await acdmPlatform.connect(daoRoleAccount).setReferrer2CommissionSaleCoefficient(newValue, newDecimals);
            const newReferrerCommission = await acdmPlatform.referrer2Commission();
            expect(newReferrerCommission.saleCoefficient)
                .to.equal(newValue);
            expect(newReferrerCommission.saleCoefficientDecimals)
                .to.equal(newDecimals);
        });

        it("should set right referrer 1 trade commission", async () => {
            const newValue: BigNumber = BigNumber.from(1);
            const newDecimals: BigNumber = BigNumber.from(5);
            await acdmPlatform.connect(daoRoleAccount).setReferrer1CommissionTradeCoefficient(newValue, newDecimals);
            const newReferrerCommission = await acdmPlatform.referrer1Commission();
            expect(newReferrerCommission.tradeCoefficient)
                .to.equal(newValue);
            expect(newReferrerCommission.tradeCoefficientDecimals)
                .to.equal(newDecimals);
        });

        it("should set right referrer 2 trade commission", async () => {
            const newValue: BigNumber = BigNumber.from(1);
            const newDecimals: BigNumber = BigNumber.from(5);
            await acdmPlatform.connect(daoRoleAccount).setReferrer2CommissionTradeCoefficient(newValue, newDecimals);
            const newReferrerCommission = await acdmPlatform.referrer2Commission();
            expect(newReferrerCommission.tradeCoefficient)
                .to.equal(newValue);
            expect(newReferrerCommission.tradeCoefficientDecimals)
                .to.equal(newDecimals);
        });
    });

    describe("add order", () => {
        it("should revert when trade round isn't started", async () => {
            const amount : BigNumber = BigNumber.from(10 * Math.pow(10, acdmTokenDecimals));
            const price : BigNumber = BigNumber.from(100);
            await expect(acdmPlatform.addOrder(amount, price))
                .to.revertedWith("trade round isn't started");
        });

        it("should revert when amount is zero", async () => {
            const amount : BigNumber = BigNumber.from(0);
            const price : BigNumber = BigNumber.from(100);

            await acdmPlatform.startSaleRound();
            await acdmPlatform.startTradeRound();

            await expect(acdmPlatform.addOrder(amount, price))
                .to.revertedWith("wrong amount");
        });

        it("should revert when price is zero", async () => {
            const amount : BigNumber = BigNumber.from(10 * Math.pow(10, acdmTokenDecimals));
            const price : BigNumber = BigNumber.from(0);

            await acdmPlatform.startSaleRound();
            await acdmPlatform.startTradeRound();

            await expect(acdmPlatform.addOrder(amount, price))
                .to.revertedWith("wrong price");
        });

        it("should revert when not enough allowance", async () => {
            const amount : BigNumber = BigNumber.from(10 * Math.pow(10, acdmTokenDecimals));
            const price : BigNumber = BigNumber.from(100);

            await acdmPlatform.startSaleRound();
            await acdmPlatform.startTradeRound();

            await expect(acdmPlatform.addOrder(amount, price))
                .to.revertedWith("not enough allowance");
        });

        it("should transfer tokens", async () => {
            const seller : SignerWithAddress = accounts[1];
            const amount : BigNumber = BigNumber.from(10 * Math.pow(10, acdmTokenDecimals));
            const price : BigNumber = BigNumber.from(100);

            await acdmPlatform.startSaleRound();
            await acdmPlatform.startTradeRound();

            await acdmToken.connect(deployer).mint(seller.address, amount);
            await acdmToken.connect(seller).approve(acdmPlatform.address, amount);

            await acdmPlatform.connect(seller).addOrder(amount, price);

            expect(await acdmToken.balanceOf(acdmPlatform.address))
                .to.equal(amount);
        });
    });

    describe("remove order", () => {
        it("should revert with 'order by order id not exists'", async () => {
            const orderId : BigNumber = BigNumber.from(1);
            await expect(acdmPlatform.removeOrder(orderId))
                .to.revertedWith("order by order id not exists");
        });

        it("should revert with 'isn't creator'", async () => {
            const orderId : BigNumber = BigNumber.from(1);
            const seller : SignerWithAddress = accounts[1];
            const notSeller : SignerWithAddress = accounts[2];
            const amount : BigNumber = BigNumber.from(10 * Math.pow(10, acdmTokenDecimals));
            const price : BigNumber = BigNumber.from(100);

            await acdmPlatform.startSaleRound();
            await acdmPlatform.startTradeRound();

            await acdmToken.connect(deployer).mint(seller.address, amount);
            await acdmToken.connect(seller).approve(acdmPlatform.address, amount);

            await acdmPlatform.connect(seller).addOrder(amount, price);

            await expect(acdmPlatform.connect(notSeller).removeOrder(orderId))
                .to.revertedWith("isn't creator");
        });

        it("should transfer tokens back", async () => {
            const orderId : BigNumber = BigNumber.from(1);
            const seller : SignerWithAddress = accounts[1];
            const amount : BigNumber = BigNumber.from(10 * Math.pow(10, acdmTokenDecimals));
            const price : BigNumber = BigNumber.from(100);

            await acdmPlatform.startSaleRound();
            await acdmPlatform.startTradeRound();

            await acdmToken.connect(deployer).mint(seller.address, amount);
            await acdmToken.connect(seller).approve(acdmPlatform.address, amount);

            await acdmPlatform.connect(seller).addOrder(amount, price);
            await acdmPlatform.connect(seller).removeOrder(orderId);

            expect(await acdmToken.balanceOf(seller.address))
                .to.equal(amount);
        });
    });

    describe("redeem order", () => {
        it("should revert with 'trade round isn't started'", async () => {
            await expect(acdmPlatform.redeemOrder({value: 1}))
                .to.revertedWith("trade round isn't started");
        });

        it ("shouldn't change balance if platform hasn't orders", async () => {
            const buyer : SignerWithAddress = accounts[1];
            const buyValue : BigNumber = BigNumber.from(100);

            await acdmPlatform.startSaleRound();
            await acdmPlatform.startTradeRound();

            await acdmPlatform.connect(buyer).redeemOrder({value: buyValue});

            expect(await ethers.provider.getBalance(acdmPlatform.address))
                .to.equal(BigNumber.from(0));
        });

        it ("shouldn't change balance if buyer send not enough money", async () =>{
            const buyer : SignerWithAddress = accounts[1];
            const seller : SignerWithAddress = accounts[2];
            const price : BigNumber = BigNumber.from(100);
            const amount : BigNumber = BigNumber.from(10 * Math.pow(10, acdmTokenDecimals));
            const buyValue : BigNumber = BigNumber.from(price.toNumber() - 1);

            await acdmPlatform.startSaleRound();
            await acdmPlatform.startTradeRound();

            await acdmToken.connect(deployer).mint(seller.address, amount);
            await acdmToken.connect(seller).approve(acdmPlatform.address, amount);

            await acdmPlatform.connect(seller).addOrder(amount, price);

            await acdmPlatform.connect(buyer).redeemOrder({value: buyValue});

            expect(await ethers.provider.getBalance(acdmPlatform.address))
                .to.equal(BigNumber.from(0));

            expect(await acdmToken.balanceOf(acdmPlatform.address))
                .to.equal(BigNumber.from(amount));
        });

        it ("should send residue", async () =>{
            const buyer : SignerWithAddress = accounts[1];
            const seller : SignerWithAddress = accounts[2];
            const price : BigNumber = BigNumber.from(100);
            const amount : BigNumber = BigNumber.from(10 * Math.pow(10, acdmTokenDecimals));
            const residue : BigNumber = BigNumber.from(100);
            const buyValue : BigNumber = BigNumber.from(amount.toNumber() / Math.pow(10, acdmTokenDecimals) * price.toNumber() + residue.toNumber());
            const referrer1Commission = await acdmPlatform.referrer1Commission();
            const referrer2Commission = await acdmPlatform.referrer2Commission();
            const platformCommission : number = (amount.toNumber() / Math.pow(10, acdmTokenDecimals) * price.toNumber()
                * (referrer1Commission.tradeCoefficient.toNumber()/ 10**referrer1Commission.tradeCoefficientDecimals.toNumber()
                    + referrer2Commission.tradeCoefficient.toNumber()/ 10**referrer2Commission.tradeCoefficientDecimals.toNumber() ));

            await acdmPlatform.startSaleRound();
            await acdmPlatform.startTradeRound();

            await acdmToken.connect(deployer).mint(seller.address, amount);
            await acdmToken.connect(seller).approve(acdmPlatform.address, amount);

            await acdmPlatform.connect(seller).addOrder(amount, price);

            await acdmPlatform.connect(buyer).redeemOrder({value: buyValue});

            expect(await ethers.provider.getBalance(acdmPlatform.address))
                .to.equal(BigNumber.from(platformCommission));
        });

        it ("shouldn't send residue", async () =>{
            const buyer : SignerWithAddress = accounts[1];
            const seller : SignerWithAddress = accounts[2];
            const price : BigNumber = BigNumber.from(100);
            const amount : BigNumber = BigNumber.from(10 * Math.pow(10, acdmTokenDecimals));
            const residue : BigNumber = BigNumber.from(100);
            const buyValue : BigNumber = BigNumber.from(amount.toNumber() / Math.pow(10, acdmTokenDecimals) * price.toNumber());
            const referrer1Commission = await acdmPlatform.referrer1Commission();
            const referrer2Commission = await acdmPlatform.referrer2Commission();
            const platformCommission : number = (amount.toNumber() / Math.pow(10, acdmTokenDecimals) * price.toNumber()
                * (referrer1Commission.tradeCoefficient.toNumber()/ 10**referrer1Commission.tradeCoefficientDecimals.toNumber()
                    + referrer2Commission.tradeCoefficient.toNumber()/ 10**referrer2Commission.tradeCoefficientDecimals.toNumber() ));

            await acdmPlatform.startSaleRound();
            await acdmPlatform.startTradeRound();

            await acdmToken.connect(deployer).mint(seller.address, amount);
            await acdmToken.connect(seller).approve(acdmPlatform.address, amount);

            await acdmPlatform.connect(seller).addOrder(amount, price);

            await acdmPlatform.connect(buyer).redeemOrder({value: buyValue});

            expect(await ethers.provider.getBalance(acdmPlatform.address))
                .to.equal(BigNumber.from(platformCommission));
        });

        it ("should buy right price", async () =>{
            const buyer : SignerWithAddress = accounts[1];
            const seller : SignerWithAddress = accounts[2];
            const seller2 : SignerWithAddress = accounts[2];
            const price : BigNumber = BigNumber.from(100);
            const price2 : BigNumber = BigNumber.from(100);
            const amount : BigNumber = BigNumber.from(10 * Math.pow(10, acdmTokenDecimals));
            const amount2 : BigNumber = BigNumber.from(amount.toNumber() - Math.pow(10, acdmTokenDecimals));
            const residue : BigNumber = BigNumber.from(100);
            const buyValue : BigNumber = BigNumber.from(amount.toNumber() / Math.pow(10, acdmTokenDecimals) * price.toNumber()
                + (amount2.toNumber() - Math.pow(10, acdmTokenDecimals)) / Math.pow(10, acdmTokenDecimals) * price2.toNumber());
            const referrer1Commission = await acdmPlatform.referrer1Commission();
            const referrer2Commission = await acdmPlatform.referrer2Commission();
            const platformCommission : number = (amount.toNumber() / Math.pow(10, acdmTokenDecimals) * price.toNumber()
                * (referrer1Commission.tradeCoefficient.toNumber()/ 10**referrer1Commission.tradeCoefficientDecimals.toNumber()
                    + referrer2Commission.tradeCoefficient.toNumber()/ 10**referrer2Commission.tradeCoefficientDecimals.toNumber() ));

            await acdmPlatform.startSaleRound();
            await acdmPlatform.startTradeRound();

            await acdmToken.connect(deployer).mint(seller.address, amount);
            await acdmToken.connect(seller).approve(acdmPlatform.address, amount);
            await acdmPlatform.connect(seller).addOrder(amount, price);

            await acdmToken.connect(deployer).mint(seller2.address, amount2);
            await acdmToken.connect(seller2).approve(acdmPlatform.address, amount2);
            await acdmPlatform.connect(seller2).addOrder(amount2, price2);

            await acdmPlatform.connect(buyer).redeemOrder({value: buyValue});

            expect(await acdmToken.balanceOf(buyer.address))
                .to.equal(BigNumber.from(amount.toNumber() + amount2.toNumber() - Math.pow(10, acdmTokenDecimals)));

            await acdmPlatform.connect(seller2).removeOrder(2);
            expect(await acdmToken.balanceOf(seller2.address))
                .to.equal(BigNumber.from(Math.pow(10, acdmTokenDecimals)));
        });

        it ("should send residue", async () =>{
            const buyer : SignerWithAddress = accounts[1];
            const seller : SignerWithAddress = accounts[2];
            const price : BigNumber = BigNumber.from(100);
            const amount : BigNumber = BigNumber.from(10 * Math.pow(10, acdmTokenDecimals));
            const buyValue : BigNumber = BigNumber.from(amount.toNumber() / Math.pow(10, acdmTokenDecimals) * price.toNumber());
            const referrer1 : SignerWithAddress = accounts[4];
            const referrer2 : SignerWithAddress = accounts[5];

            await acdmPlatform.connect(referrer2).register(constants.AddressZero);
            await acdmPlatform.connect(referrer1).register(referrer2.address);
            await acdmPlatform.connect(seller).register(referrer1.address);

            await acdmPlatform.startSaleRound();
            await acdmPlatform.startTradeRound();

            await acdmToken.connect(deployer).mint(seller.address, amount);
            await acdmToken.connect(seller).approve(acdmPlatform.address, amount);

            await acdmPlatform.connect(seller).addOrder(amount, price);

            const balanceReferrer1Before : BigNumber = await referrer1.getBalance();
            const balanceReferrer2Before : BigNumber = await referrer2.getBalance();
            const balancePlatformBefore : BigNumber = await ethers.provider.getBalance(acdmPlatform.address);

            await acdmPlatform.connect(buyer).redeemOrder({value: buyValue});

            const referrer1Commission = await acdmPlatform.referrer1Commission();
            const referrer2Commission = await acdmPlatform.referrer2Commission();
            let _referrer1Commission : BigNumber = BigNumber.from(referrer1Commission.tradeCoefficient.toNumber()/Math.pow(10,referrer1Commission.tradeCoefficientDecimals.toNumber())*1000);
            let _referrer2Commission : BigNumber = BigNumber.from(referrer2Commission.tradeCoefficient.toNumber()/Math.pow(10,referrer2Commission.tradeCoefficientDecimals.toNumber())*1000);
            let platformCommission : BigNumber = BigNumber.from(1000 - _referrer1Commission.toNumber() - _referrer2Commission.toNumber());

            expect(await referrer1.getBalance())
                .to.equal(balanceReferrer1Before.toBigInt() + buyValue.toBigInt()*_referrer1Commission.toBigInt()/BigNumber.from(1000).toBigInt());

            expect(await referrer2.getBalance())
                .to.equal(balanceReferrer2Before.toBigInt() + buyValue.toBigInt()*_referrer2Commission.toBigInt()/BigNumber.from(1000).toBigInt());

            expect(await ethers.provider.getBalance(acdmPlatform.address))
                .to.equal(balancePlatformBefore.toBigInt() + buyValue.toBigInt()*platformCommission.toBigInt()/BigNumber.from(1000).toBigInt());
        });

        it ("shouldn't send referrer 2 commission", async () =>{
            const buyer : SignerWithAddress = accounts[1];
            const seller : SignerWithAddress = accounts[2];
            const price : BigNumber = BigNumber.from(100);
            const amount : BigNumber = BigNumber.from(10 * Math.pow(10, acdmTokenDecimals));
            const buyValue : BigNumber = BigNumber.from(amount.toNumber() / Math.pow(10, acdmTokenDecimals) * price.toNumber());
            const referrer1 : SignerWithAddress = accounts[4];
            const referrer2 : SignerWithAddress = accounts[5];

            await acdmPlatform.connect(referrer2).register(constants.AddressZero);
            await acdmPlatform.connect(referrer1).register(constants.AddressZero);
            await acdmPlatform.connect(seller).register(referrer1.address);

            await acdmPlatform.startSaleRound();
            await acdmPlatform.startTradeRound();

            await acdmToken.connect(deployer).mint(seller.address, amount);
            await acdmToken.connect(seller).approve(acdmPlatform.address, amount);

            await acdmPlatform.connect(seller).addOrder(amount, price);

            const balanceReferrer1Before : BigNumber = await referrer1.getBalance();
            const balanceReferrer2Before : BigNumber = await referrer2.getBalance();
            const balancePlatformBefore : BigNumber = await ethers.provider.getBalance(acdmPlatform.address);

            await acdmPlatform.connect(buyer).redeemOrder({value: buyValue});

            const referrer1Commission = await acdmPlatform.referrer1Commission();
            const referrer2Commission = await acdmPlatform.referrer2Commission();
            let _referrer1Commission : BigNumber = BigNumber.from(referrer1Commission.tradeCoefficient.toNumber()/Math.pow(10,referrer1Commission.tradeCoefficientDecimals.toNumber())*1000);
            let _referrer2Commission : BigNumber = BigNumber.from(0);
            let platformCommission : BigNumber = BigNumber.from(1000 - _referrer1Commission.toNumber() - _referrer2Commission.toNumber());

            expect(await referrer1.getBalance())
                .to.equal(balanceReferrer1Before.toBigInt() + buyValue.toBigInt()*_referrer1Commission.toBigInt()/BigNumber.from(1000).toBigInt());

            expect(await referrer2.getBalance())
                .to.equal(balanceReferrer2Before.toBigInt() + buyValue.toBigInt()*_referrer2Commission.toBigInt()/BigNumber.from(1000).toBigInt());
        });
    });
});