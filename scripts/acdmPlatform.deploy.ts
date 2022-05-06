import {ethers} from "hardhat";
import {config as dotEnvConfig} from "dotenv";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {Contract} from "ethers";

dotEnvConfig();

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(`Deploying contract with the account: ${deployer.address}`);

    const acdmTokenContract: Contract = await deployErc20Token(deployer, "ACADEM Coin", "ACDM", 6);
    console.log(`acdm token address: ${acdmTokenContract.address}`);

    const xxxTokenContract: Contract = await deployErc20Token(deployer, "XXX Coin", "XXX", 18);
    console.log(`xxx token address: ${xxxTokenContract.address}`);
    
    const lpTokenAddress: string = await addLiquidity(deployer, xxxTokenContract);
    console.log(`lp token address: ${lpTokenAddress}`);

    const daoStakingContract: Contract = await deployDaoStaking(deployer, xxxTokenContract, lpTokenAddress);
    console.log(`dao staking address: ${daoStakingContract.address}`);

    const acdmPlatformContract: Contract = await deployAcdmPlatform(deployer, acdmTokenContract.address, daoStakingContract.address, xxxTokenContract.address);
    console.log(`acdm platform address: ${acdmPlatformContract.address}`);
}

async function deployErc20Token(deployer: SignerWithAddress, name: string, symbol: string, decimals: number): Promise<Contract>{
    const factory = await ethers.getContractFactory("ERC20MintBurn");
    return await factory.deploy(name, symbol, decimals);
}

async function addLiquidity(deployer: SignerWithAddress, xxxTokenContract: Contract): Promise<string> {
    const xxxTokenDecimals: number = await xxxTokenContract.decimals();
    const startPrice: number = 0.00001*10**18;
    const startAmount: number = 10**xxxTokenDecimals;
    const UNISWAP_ROUTER = process.env.UNISWAP_ROUTER || "";
    const UNISWAP_FACTORY = process.env.UNISWAP_FACTORY || "";
    const UNISWAP_WETH = process.env.UNISWAP_FACTORY || "";

    const factoryRouter = await ethers.getContractFactory("UniswapV2Router01Mock");
    const routerContract = await factoryRouter.attach(UNISWAP_ROUTER);

    const factoryFactory = await ethers.getContractFactory("UniswapV2FactoryMock");
    const factoryContract = await factoryFactory.attach(UNISWAP_FACTORY);
    
    await xxxTokenContract.connect(deployer).mint(deployer.address, BigInt(startAmount * 10**xxxTokenDecimals));
    await xxxTokenContract.connect(deployer).approve(routerContract.address, BigInt(startAmount * 10**xxxTokenDecimals));
    let blockNumber = await ethers.provider.getBlockNumber();
    let timestamp = (await ethers.provider.getBlock(blockNumber)).timestamp;
    await routerContract.addLiquidityETH(
        xxxTokenContract.address,
        startAmount,
        0.01 * startAmount,
        0.01 * startPrice,
        deployer.address,
        timestamp + 1,
        {value:startPrice}
    );
    
    return await factoryContract.getPair(xxxTokenContract.address, UNISWAP_WETH);
}

async function deployDaoStaking(deployer: SignerWithAddress, xxxTokenContract: Contract, lpTokenAddress: string): Promise<Contract>{
    const chairPerson: string =  deployer.address;
    const minimumQuorum: number = 1;
    const debatingPeriodDuration: number = 10;
    const depositInstrumentAddress: string = lpTokenAddress;
    const rewardInstrumentAddress: string = xxxTokenContract.address;
    const depositRatePercent: number = 3;
    const maturityPeriosMin: number = 5;
    const depositHoldTimeMin: number = 1;

    const factory = await ethers.getContractFactory("DaoStaking");
    const contract = await factory.deploy(
        chairPerson,
        minimumQuorum,
        debatingPeriodDuration,
        depositInstrumentAddress,
        rewardInstrumentAddress,
        depositRatePercent,
        maturityPeriosMin,
        depositHoldTimeMin);

    //set STAKING_SETTINGS_ROLE role
    await contract.connect(deployer).grantRole("0x9557cf75b97593758eab5b18a0839f3d6c61d317432267fa442ec1813a82eb72", contract.address);
    return contract;
}

async function deployAcdmPlatform(deployer: SignerWithAddress, acdmTokenAddress: string, daoAddress: string, xxxTokenAddress: string): Promise<Contract> {
    const UNISWAP_ROUTER = process.env.UNISWAP_ROUTER || "";
    const UNISWAP_FACTORY = process.env.UNISWAP_FACTORY || "";
    const UNISWAP_WETH = process.env.UNISWAP_FACTORY || "";
    const acdmToken: string = acdmTokenAddress;
    const daoContract: string = daoAddress;
    const roundTimeMs: number = 10;
    const owner: string = deployer.address;
    const uniswapRouter: string = UNISWAP_ROUTER;
    const xxxToken: string = xxxTokenAddress;
    const weth: string = UNISWAP_WETH;

    const factory = await ethers.getContractFactory("AcdmPlatform");
    return await factory.deploy(
        acdmToken,
        daoContract,
        roundTimeMs,
        owner,
        uniswapRouter,
        xxxToken,
        weth
    );
}

main()
    .then(() => process.exit(0))
    .catch((error) =>{
        console.error(error);
        process.exit(1);
    });